// Load/invariant test for the dispatch flow against a running API + Postgres. Usage: see .github/workflows/loadtest.yml
import postgres from "postgres";

const B = process.env.API_URL ?? "http://localhost:3999";
const N_PROV = Number(process.env.PROVIDERS ?? 40), N_CUST = Number(process.env.CUSTOMERS ?? 150), CONC = Number(process.env.CONCURRENCY ?? 30), RUN_S = Number(process.env.DURATION_S ?? 45);
const lat = new Map(); const rec = (name, ms, ok) => { const a = lat.get(name) ?? { ms: [], err: 0 }; a.ms.push(ms); if (!ok) a.err++; lat.set(name, a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(name, m, p, t, b) {
  const t0 = performance.now();
  try { const r = await fetch(B + p, { method: m, headers: { ...(b ? { "content-type": "application/json" } : {}), ...(t ? { authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
    const x = await r.text(); let d; try { d = JSON.parse(x) } catch { d = x } rec(name, performance.now() - t0, r.status < 500); return { s: r.status, d }; }
  catch (e) { rec(name, performance.now() - t0, false); return { s: 0, d: String(e) }; }
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
const login = async (phone) => { const q = await j("otp.request", "POST", "/v1/auth/otp/request", null, { phone }); const v = await j("otp.verify", "POST", "/v1/auth/otp/verify", null, { phone, code: q.d.devCode }); return v.d; };
const phone = (prefix, i) => `0${prefix}${String(10_000_000 + i).padStart(8, "0")}`;
const C = { lat: 33.5883, lng: -7.635 };

const staff = (await j("ops.login", "POST", "/ops/login", null, { email: process.env.STAFF_EMAIL, password: process.env.STAFF_PASSWORD })).d.token;
console.log(`setup: ${N_PROV} providers, ${N_CUST} customers, concurrency ${CONC}`);
const provs = await pool(Array.from({ length: N_PROV }), 10, async (_, i) => {
  const u = await login(phone(6, i)); await j("kyc.apply", "POST", "/v1/verifications", u.accessToken, { tier: 1, documents: ["cin_front"] });
  return u;
});
const queue = (await j("kyc.queue", "GET", "/ops/kyc?limit=200", staff)).d;
await pool(queue.filter((v) => provs.some((p) => p.userId === v.userId)), 10, (v) => j("kyc.approve", "POST", `/ops/kyc/${v.id}/approve`, staff, { reason: "load test approval" }));
const custs = await pool(Array.from({ length: N_CUST }), 10, (_, i) => login(phone(7, i)));

// provider agents: heartbeat + poll offers + accept (80%) / reject (20%)
let stop = false; const accepted = []; let offersSeen = 0;
const agents = provs.map((p, i) => (async () => {
  const pos = { lat: C.lat + (Math.random() - 0.5) * 0.03, lng: C.lng + (Math.random() - 0.5) * 0.03 }; let lastBeat = 0;
  while (!stop) {
    if (Date.now() - lastBeat > 10_000) { await j("presence", "POST", "/v1/provider/presence", p.accessToken, { online: true, ...pos }); lastBeat = Date.now(); }
    const pend = await j("offers.pending", "GET", "/v1/dispatch-offers/pending", p.accessToken);
    for (const o of Array.isArray(pend.d) ? pend.d : []) {
      offersSeen++; await sleep(100 + Math.random() * 400);
      if (Math.random() < 0.8) { const r = await j("offer.accept", "POST", `/v1/dispatch-offers/${o.id}/accept`, p.accessToken); if (r.s === 201) { accepted.push({ provider: p.userId, booking: o.bookingId }); await finish(p, o.bookingId); } }
      else await j("offer.reject", "POST", `/v1/dispatch-offers/${o.id}/reject`, p.accessToken);
    }
    await sleep(250 + Math.random() * 250);
  }
})());
async function finish(p, bookingId) { for (const c of ["start-trip", "arrive", "start-job", "complete"]) { await sleep(50); await j("job." + c, "POST", `/v1/bookings/${bookingId}/${c}`, p.accessToken); } }

await sleep(1500);
const t0 = Date.now();
const created = await pool(custs, CONC, async (c, i) => (await j("dispatch.request", "POST", "/v1/dispatch-requests", c.accessToken, { lat: C.lat + (Math.random() - 0.5) * 0.02, lng: C.lng + (Math.random() - 0.5) * 0.02, categoryId: "errands", totalCentimes: 3000, paymentMethod: "cash" })));
const reqSecs = (Date.now() - t0) / 1000;
await sleep(Math.max(0, RUN_S * 1000 - (Date.now() - t0))); stop = true; await Promise.all(agents);

// ---- invariants straight from the database ----
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const ids = created.filter((r) => r.s === 201).map((r) => r.d.id);
const states = await sql`select state, count(*)::int n from booking.booking where id = any(${ids}) group by state order by n desc`;
const dupProv = await sql`select provider_id, count(*)::int n from booking.booking where id = any(${ids}) and provider_id is not null and state in ('Accepted','EnRoute','Arrived','InProgress') group by provider_id having count(*) > 1`;
const dupOpen = await sql`select provider_id, count(*)::int n from booking.dispatch_offer where status = 'offered' group by provider_id having count(*) > 1`;
const doubleAccepted = await sql`select booking_id, count(*)::int n from booking.dispatch_offer where status = 'accepted' and booking_id = any(${ids}) group by booking_id having count(*) > 1`;
const orphan = await sql`select count(*)::int n from booking.booking where id = any(${ids}) and state = 'Accepted' and provider_id is null`;
const events = await sql`select count(*)::int n from platform.outbox where aggregate_id = any(${ids})`;
await sql.end();

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };
console.log("\n=== latency (ms) ===");
for (const [name, a] of [...lat.entries()].sort()) console.log(name.padEnd(18), `n=${String(a.ms.length).padStart(5)}  p50=${pct(a.ms, 50).toFixed(0).padStart(5)}  p95=${pct(a.ms, 95).toFixed(0).padStart(5)}  p99=${pct(a.ms, 99).toFixed(0).padStart(5)}  5xx/errors=${a.err}`);
console.log("\n=== outcome ===");
console.log(`dispatch requests created: ${ids.length}/${N_CUST} in ${reqSecs.toFixed(1)}s (${(ids.length / reqSecs).toFixed(1)}/s)   offers seen: ${offersSeen}   accepted jobs: ${accepted.length}`);
console.log("booking states:", Object.fromEntries(states.map((r) => [r.state, r.n])), " outbox events:", events[0].n);
const failures = [];
if (ids.length < N_CUST) failures.push(`only ${ids.length}/${N_CUST} requests were created`);
if (dupProv.length) failures.push(`providers with >1 active job: ${JSON.stringify(dupProv)}`);
if (dupOpen.length) failures.push(`providers with >1 open offer: ${JSON.stringify(dupOpen)}`);
if (doubleAccepted.length) failures.push(`bookings with >1 accepted offer: ${JSON.stringify(doubleAccepted)}`);
if (orphan[0].n) failures.push(`${orphan[0].n} Accepted bookings without a provider`);
const total5xx = [...lat.values()].reduce((s, a) => s + a.err, 0); if (total5xx) failures.push(`${total5xx} requests failed (5xx/network)`);
const reqP95 = pct(lat.get("dispatch.request")?.ms ?? [0], 95); if (reqP95 > 2000) failures.push(`dispatch.request p95 ${reqP95.toFixed(0)} ms exceeds 2000 ms`);
if (failures.length) { console.error("\nFAILED:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("\nALL INVARIANTS HELD ✔");
