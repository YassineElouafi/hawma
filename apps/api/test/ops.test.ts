import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { randomUUID } from "node:crypto";
import { createApp, startEventDelivery } from "../src/main";
import { OVERRIDES } from "../src/app.module";
import { hashPassword, verifyPassword } from "../src/modules/ops/staff.service";
import { can, PERMISSIONS, ROLES } from "../src/domain/rbac";

let app: NestFastifyApplication;
const mk = async (email: string, roles: string[], active = true) => {
  const id = randomUUID(); OVERRIDES.staffRepo.items.set(id, { id, email, passwordHash: await hashPassword("correct horse battery"), roles: roles as never, active }); return id;
};
beforeAll(async () => { app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); startEventDelivery(app); });
afterAll(async () => { await app.close(); });
const req = (method: "GET" | "POST", url: string, token?: string, payload?: object) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const login = async (email: string) => (await req("POST", "/ops/login", undefined, { email, password: "correct horse battery" })).json().token as string;
const seedKyc = (userId = randomUUID(), tier = 1) => { const id = randomUUID(); OVERRIDES.kycRepo.items.set(id, { id, userId, tier, status: "in_review", documents: ["cin_front", "cin_back", "selfie"], createdAt: new Date().toISOString() }); return { id, userId }; };

describe("RBAC model", () => {
  it("every role is defined and read_only can never write", () => {
    for (const r of ROLES) expect(PERMISSIONS[r]).toBeDefined();
    for (const p of ["users.suspend", "kyc.review", "bookings.cancel", "refunds.issue", "staff.manage"] as const) expect(can(["read_only"], p)).toBe(false);
    expect(can(["finance"], "refunds.issue")).toBe(true); expect(can(["support"], "refunds.issue")).toBe(false);
  });
});

describe("passwords", () => {
  it("hash/verify round-trip, salted, rejects wrong and malformed", async () => {
    const a = await hashPassword("pw-12345678"), b = await hashPassword("pw-12345678");
    expect(a).not.toBe(b); expect(await verifyPassword("pw-12345678", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false); expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("ops API", () => {
  it("login: bad credentials, inactive accounts, lockout after 5 failures", async () => {
    await mk("lock@hawma.ma", ["support"]); await mk("off@hawma.ma", ["support"], false);
    expect((await req("POST", "/ops/login", undefined, { email: "nobody@hawma.ma", password: "whatever123" })).statusCode).toBe(401);
    expect((await req("POST", "/ops/login", undefined, { email: "off@hawma.ma", password: "correct horse battery" })).statusCode).toBe(401);
    for (let i = 0; i < 5; i++) await req("POST", "/ops/login", undefined, { email: "lock@hawma.ma", password: "wrong-password" });
    const r = await req("POST", "/ops/login", undefined, { email: "lock@hawma.ma", password: "correct horse battery" });
    expect(r.statusCode).toBe(401); expect(r.json().title).toMatch(/locked/);
  });

  it("a customer token can never reach /ops", async () => {
    await req("POST", "/v1/auth/otp/request", undefined, { phone: "0611223344" });
    const code = OVERRIDES.otpSender.last.get("+212611223344")!;
    const c = (await req("POST", "/v1/auth/otp/verify", undefined, { phone: "0611223344", code })).json();
    expect((await req("GET", "/ops/kyc", c.accessToken)).statusCode).toBe(401);
    expect((await req("GET", "/ops/me")).statusCode).toBe(401);
  });

  it("permissions: support can read the queue but not review", async () => {
    await mk("sup@hawma.ma", ["support"]); const t = await login("sup@hawma.ma");
    expect((await req("GET", "/ops/kyc", t)).statusCode).toBe(200);
    const k = seedKyc();
    expect((await req("POST", `/ops/kyc/${k.id}/approve`, t, { reason: "looks fine to me" })).statusCode).toBe(403);
    expect((await req("GET", "/ops/audit", t)).statusCode).toBe(403);
  });

  it("approve requires a decision with audit trail; reviewing twice conflicts; tier is granted", async () => {
    const id = await mk("ts@hawma.ma", ["trust_safety"]); const t = await login("ts@hawma.ma");
    const k = seedKyc(undefined, 2);
    const ok = await req("POST", `/ops/kyc/${k.id}/approve`, t, { reason: "CIN matches selfie, record clean" });
    expect(ok.statusCode).toBe(200); expect(ok.json().status).toBe("approved");
    expect(OVERRIDES.kycRepo.tiers.get(k.userId)).toBe(2);
    expect((await req("POST", `/ops/kyc/${k.id}/reject`, t, { reason: "too late now" })).statusCode).toBe(409);
    const log = (await req("GET", "/ops/audit", t)).json();
    expect(log[0]).toMatchObject({ actorId: id, action: "kyc.approved", target: k.id, reason: "CIN matches selfie, record clean" });
  });

  it("reasons are mandatory: rejection needs one, and short/empty reasons are refused without any effect", async () => {
    await mk("ts2@hawma.ma", ["trust_safety"]); const t = await login("ts2@hawma.ma");
    const k = seedKyc(); const before = OVERRIDES.auditRepo.items.length;
    expect((await req("POST", `/ops/kyc/${k.id}/reject`, t, {})).statusCode).toBe(422);
    expect((await req("POST", `/ops/kyc/${k.id}/approve`, t, { reason: "ok" })).statusCode).toBe(400);
    expect(OVERRIDES.kycRepo.items.get(k.id)!.status).toBe("in_review");
    expect(OVERRIDES.auditRepo.items.length).toBe(before);
  });

  it("nobody reviews their own verification; tier 3 needs an admin", async () => {
    const self = await mk("self@hawma.ma", ["trust_safety"]); const t = await login("self@hawma.ma");
    const mine = seedKyc(self); expect((await req("POST", `/ops/kyc/${mine.id}/approve`, t, { reason: "approving myself" })).statusCode).toBe(409);
    const t3 = seedKyc(undefined, 3); expect((await req("POST", `/ops/kyc/${t3.id}/approve`, t, { reason: "tier three docs fine" })).statusCode).toBe(409);
    await mk("adm@hawma.ma", ["admin"]); const ta = await login("adm@hawma.ma");
    expect((await req("POST", `/ops/kyc/${t3.id}/approve`, ta, { reason: "tier three docs fine" })).statusCode).toBe(200);
  });

  it("revoking a role takes effect immediately even with a valid token", async () => {
    const id = await mk("rev@hawma.ma", ["trust_safety"]); const t = await login("rev@hawma.ma");
    expect((await req("GET", "/ops/kyc", t)).statusCode).toBe(200);
    OVERRIDES.staffRepo.items.get(id)!.roles = ["read_only"];
    const k = seedKyc(); expect((await req("POST", `/ops/kyc/${k.id}/approve`, t, { reason: "should not be allowed" })).statusCode).toBe(403);
    OVERRIDES.staffRepo.items.get(id)!.active = false;
    expect((await req("GET", "/ops/me", t)).statusCode).toBe(401);
  });
});

describe("verification applications and bookings explorer", () => {
  it("provider applies once; staff sees it in the queue and approves; explorer lists bookings", async () => {
    await req("POST", "/v1/auth/otp/request", undefined, { phone: "0644556677" });
    const code = OVERRIDES.otpSender.last.get("+212644556677")!;
    const c = (await req("POST", "/v1/auth/otp/verify", undefined, { phone: "0644556677", code })).json();
    expect((await req("POST", "/v1/verifications", undefined, { tier: 1, documents: ["cin_front"] })).statusCode).toBe(401);
    expect((await req("POST", "/v1/verifications", c.accessToken, { tier: 9, documents: ["cin_front"] })).statusCode).toBe(400);
    expect((await req("POST", "/v1/verifications", c.accessToken, { tier: 1, documents: ["cin_front", "cin_back", "selfie"] })).statusCode).toBe(201);
    expect((await req("POST", "/v1/verifications", c.accessToken, { tier: 1, documents: ["selfie"] })).statusCode).toBe(409); // one open application
    expect((await req("GET", "/v1/verifications/mine", c.accessToken)).json()[0].status).toBe("in_review");
    await mk("rev2@hawma.ma", ["trust_safety"]); const t = await login("rev2@hawma.ma");
    const q = (await req("GET", "/ops/kyc", t)).json();
    const mine = q.find((v: { userId: string }) => v.userId === c.userId);
    expect(mine).toBeTruthy();
    expect((await req("POST", `/ops/kyc/${mine.id}/approve`, t, { reason: "documents match the applicant" })).statusCode).toBe(200);
    expect((await req("GET", "/v1/verifications/mine", c.accessToken)).json()[0].status).toBe("approved");

    const b = (await req("POST", "/v1/bookings", c.accessToken, { mode: "dispatch", totalCentimes: 2500 })).json();
    const list = (await req("GET", "/ops/bookings", t)).json();
    expect(list.map((x: { id: string }) => x.id)).toContain(b.id);
    expect((await req("GET", `/ops/bookings?state=Settled`, t)).json().map((x: { id: string }) => x.id)).not.toContain(b.id);
    expect((await req("GET", `/ops/bookings/${b.id}`, t)).json().state).toBe("Requested");
    expect((await req("GET", "/ops/bookings", c.accessToken)).statusCode).toBe(401); // customer token cannot use ops
  });
});

describe("ops stats", () => {
  it("summarises bookings for the dashboard", async () => {
    await mk("stats@hawma.ma", ["read_only"]); const t = await login("stats@hawma.ma");
    const r = await req("GET", "/ops/stats", t); expect(r.statusCode).toBe(200);
    const s = r.json();
    expect(s.perDay).toHaveLength(14); expect(typeof s.total).toBe("number"); expect(s).toHaveProperty("pendingKyc"); expect(s).toHaveProperty("fillRate");
    expect((await req("GET", "/ops/stats")).statusCode).toBe(401);
  });
});

describe("cash fee settlement via ops", () => {
  it("finance records a payment: permission, reason, idempotency, audit", async () => {
    const c = await (async () => { await req("POST", "/v1/auth/otp/request", undefined, { phone: "0681818181" }); return (await req("POST", "/v1/auth/otp/verify", undefined, { phone: "0681818181", code: OVERRIDES.otpSender.last.get("+212681818181")! })).json(); })();
    const p = await (async () => { await req("POST", "/v1/auth/otp/request", undefined, { phone: "0682828282" }); return (await req("POST", "/v1/auth/otp/verify", undefined, { phone: "0682828282", code: OVERRIDES.otpSender.last.get("+212682828282")! })).json(); })();
    const b = (await req("POST", "/v1/bookings", c.accessToken, { mode: "catalogue", providerId: p.userId, totalCentimes: 20000, paymentMethod: "cash" })).json();
    for (const cmd of ["accept", "start-trip", "arrive", "start-job", "complete"]) await req("POST", `/v1/bookings/${b.id}/${cmd}`, p.accessToken);
    await req("POST", `/v1/bookings/${b.id}/confirm`, c.accessToken); await new Promise((r) => setTimeout(r, 100));
    await mk("fin@hawma.ma", ["finance"]); const fin = await login("fin@hawma.ma"); await mk("sup2@hawma.ma", ["support"]); const sup = await login("sup2@hawma.ma");
    const debt = (await req("GET", "/ops/finance/debtors", fin)).json(); expect(debt.find((d: { providerId: string }) => d.providerId === p.userId)).toMatchObject({ owedCentimes: 3000 });
    const ref = randomUUID(); const body = { providerId: p.userId, amountCentimes: 1000, reference: ref, reason: "cash received at office" };
    expect((await req("POST", "/ops/finance/settlements", sup, body)).statusCode).toBe(403);                       // support cannot record payments
    expect((await req("POST", "/ops/finance/settlements", fin, { ...body, reason: "no" })).statusCode).toBe(400);   // reason required
    const ok = await req("POST", "/ops/finance/settlements", fin, body); expect(ok.json()).toEqual({ posted: true, owedAfterCentimes: 2000 });
    const again = await req("POST", "/ops/finance/settlements", fin, body); expect(again.json()).toEqual({ posted: false, owedAfterCentimes: 2000 });
    expect((await req("POST", "/ops/finance/settlements", fin, { ...body, reference: randomUUID(), amountCentimes: 5000 })).statusCode).toBe(422);
    const audits = OVERRIDES.auditRepo.items.filter((a) => a.action === "finance.cash_settlement" && a.target === p.userId); expect(audits).toHaveLength(1);   // replay not re-audited
    expect(audits[0]).toMatchObject({ reason: "cash received at office" });
  });
});

describe("disputes over HTTP", () => {
  it("customer opens, support resolves with a reason; finance cannot; audit recorded", async () => {
    const mkUser = async (phone: string) => { await req("POST", "/v1/auth/otp/request", undefined, { phone }); return (await req("POST", "/v1/auth/otp/verify", undefined, { phone, code: OVERRIDES.otpSender.last.get(phone.replace(/^0/, "+212"))! })).json(); };
    const c = await mkUser("0691010101"), p = await mkUser("0692020202");
    const b = (await req("POST", "/v1/bookings", c.accessToken, { mode: "catalogue", providerId: p.userId, totalCentimes: 10000, paymentMethod: "cash" })).json();
    for (const cmd of ["accept", "start-trip", "arrive", "start-job", "complete"]) await req("POST", `/v1/bookings/${b.id}/${cmd}`, p.accessToken);
    expect((await req("POST", `/v1/bookings/${b.id}/disputes`, p.accessToken, { reason: "I am the provider not the customer" })).statusCode).toBe(403);
    expect((await req("POST", `/v1/bookings/${b.id}/disputes`, c.accessToken, { reason: "short" })).statusCode).toBe(400);
    const d = await req("POST", `/v1/bookings/${b.id}/disputes`, c.accessToken, { reason: "Le prestataire n'a pas terminé le travail" }); expect(d.statusCode).toBe(201);
    await mk("sup3@hawma.ma", ["support"]); const sup = await login("sup3@hawma.ma"); await mk("ro@hawma.ma", ["read_only"]); const ro = await login("ro@hawma.ma");
    expect((await req("GET", "/ops/disputes", ro)).statusCode).toBe(403);
    expect((await req("GET", "/ops/disputes", sup)).json().map((x: { id: string }) => x.id)).toContain(d.json().id);
    expect((await req("POST", `/ops/disputes/${d.json().id}/resolve`, ro, { outcome: "reject", note: "not allowed for read only" })).statusCode).toBe(403);
    expect((await req("POST", `/ops/disputes/${d.json().id}/resolve`, sup, { outcome: "refund_partial", note: "partial refund is fair" })).statusCode).toBe(422);   // amount missing
    const ok = await req("POST", `/ops/disputes/${d.json().id}/resolve`, sup, { outcome: "refund_partial", refundCentimes: 4000, note: "partial refund is fair" }); expect(ok.statusCode).toBe(200);
    expect((await req("GET", `/ops/bookings/${b.id}`, sup)).json().state).toBe("Settled");
    expect(OVERRIDES.auditRepo.items.at(-1)).toMatchObject({ action: "dispute.refund_partial", target: b.id, reason: "partial refund is fair" });
    expect((await req("POST", `/ops/disputes/${d.json().id}/resolve`, sup, { outcome: "reject", note: "second try here" })).statusCode).toBe(409);
  });
});

describe("backup status", () => {
  it("reports not-configured in memory mode and requires staff auth", async () => {
    await mk("bk@hawma.ma", ["read_only"]); const t = await login("bk@hawma.ma");
    expect((await req("GET", "/ops/backups")).statusCode).toBe(401);
    expect((await req("GET", "/ops/backups", t)).json()).toMatchObject({ configured: false, lastSuccessAt: null, ageSeconds: null, recent: [] });
  });
});
