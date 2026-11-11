import postgres from "postgres";
const src = postgres(process.env.DATABASE_URL!), dst = postgres(process.env.DATABASE_URL!.replace(/\/hawma$/, "/hawma_restore"));
const tables = ["identity.user", "identity.provider_profile", "identity.verification", "identity.kyc_document", "booking.booking", "booking.booking_event", "money.ledger_entry", "platform.outbox"];
let bad = 0;
for (const t of tables) { const [a] = await src.unsafe(`select count(*)::int n from ${t}`), [b] = await dst.unsafe(`select count(*)::int n from ${t}`); const ok = a.n === b.n && a.n > 0; if (!ok) bad++; console.log(`${ok ? "OK  " : "FAIL"} ${t.padEnd(30)} source=${a.n} restored=${b.n}`); }
const [sa] = await src`select coalesce(sum(amount_centimes),0)::bigint s, count(distinct txn_id)::int t from money.ledger_entry`, [sb] = await dst`select coalesce(sum(amount_centimes),0)::bigint s, count(distinct txn_id)::int t from money.ledger_entry`;
console.log(`ledger: source sum=${sa.s} txns=${sa.t} | restored sum=${sb.s} txns=${sb.t}`); if (String(sb.s) !== "0" || sa.t !== sb.t) bad++;
const [da] = await src`select md5(string_agg(ciphertext::text, '' order by id::text)) h from identity.kyc_document`, [db2] = await dst`select md5(string_agg(ciphertext::text, '' order by id::text)) h from identity.kyc_document`;
console.log(`document ciphertext checksum equal: ${da.h === db2.h}`); if (da.h !== db2.h) bad++;
// the restored database must still enforce its invariants
await dst`insert into booking.booking (customer_id, lat, lng) values (gen_random_uuid(), 1, 1)`.catch(() => {});
let enforced = false; try { await dst.begin(async (t) => { const x = crypto.randomUUID(); await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${x}, 't', 'platform_float', 5)`; await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${x}, 't', 'platform_revenue', -4)`; }); } catch { enforced = true; }
console.log(`restored DB still rejects an unbalanced ledger transaction: ${enforced}`); if (!enforced) bad++;
await src.end(); await dst.end(); if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); } console.log("RESTORE VERIFIED ✔");
