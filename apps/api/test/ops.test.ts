import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/main";
import { OVERRIDES } from "../src/app.module";
import { hashPassword, verifyPassword } from "../src/modules/ops/staff.service";
import { can, PERMISSIONS, ROLES } from "../src/domain/rbac";

let app: NestFastifyApplication;
const mk = async (email: string, roles: string[], active = true) => {
  const id = randomUUID(); OVERRIDES.staffRepo.items.set(id, { id, email, passwordHash: await hashPassword("correct horse battery"), roles: roles as never, active }); return id;
};
beforeAll(async () => { app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
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
