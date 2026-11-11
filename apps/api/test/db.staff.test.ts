import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgStaffRepo } from "../src/modules/ops/pg-staff.repo";
import { StaffService } from "../src/modules/ops/staff.service";

const url = process.env.DATABASE_URL;
(url ? describe : describe.skip)("Postgres staff repo (real Postgres)", () => {
  let client: ReturnType<typeof postgres>; let repo: PgStaffRepo; let svc: StaffService;
  beforeAll(() => { client = postgres(url!, { max: 2 }); repo = new PgStaffRepo(drizzle(client)); svc = new StaffService(repo); });
  afterAll(async () => { await client.end(); });

  it("upsert is idempotent, normalises email, and the account can log in", async () => {
    const email = `Admin${Date.now()}@Hawma.ma`;
    const a = await repo.upsert(email, "a-very-long-password-1", ["admin"]);
    const b = await repo.upsert(email.toLowerCase(), "a-very-long-password-2", ["admin", "finance"]);
    expect(b.id).toBe(a.id); expect(b.roles).toEqual(["admin", "finance"]);
    await expect(svc.login(email, "a-very-long-password-1")).rejects.toThrow();          // old password no longer works
    const { token, staff } = await svc.login(email, "a-very-long-password-2");
    expect(staff.roles).toEqual(["admin", "finance"]);
    expect((await svc.authenticate(token)).email).toBe(email.toLowerCase());
  });
  it("rejects weak passwords and unknown roles", async () => {
    await expect(repo.upsert("w@hawma.ma", "short", ["admin"])).rejects.toThrow(/12 characters/);
    await expect(repo.upsert("w@hawma.ma", "long-enough-password", ["root" as never])).rejects.toThrow(/unknown role/);
  });
});

(url ? describe : describe.skip)("staff MFA on real Postgres", () => {
  it("enrolment persists, login needs the code, recovery codes are single-use across instances", async () => {
    const { totp } = await import("../src/modules/ops/totp"); const { DocCrypto } = await import("../src/modules/documents/crypto");
    const client = postgres(url!, { max: 2 }); const repo = new PgStaffRepo(drizzle(client)); const key = Buffer.alloc(32, 7).toString("base64");
    const email = `mfa${Date.now()}@hawma.ma`; await repo.upsert(email, "a-very-long-password-1", ["finance"]);
    const svcA = new StaffService(repo, new DocCrypto(key), {} as NodeJS.ProcessEnv);
    const staff = await svcA.authenticate((await svcA.login(email, "a-very-long-password-1")).token);
    const { secret } = await svcA.mfaSetup(staff); const { recoveryCodes } = await svcA.mfaEnable(staff, totp(secret));
    const svcB = new StaffService(repo, new DocCrypto(key), {} as NodeJS.ProcessEnv);                       // a different server instance, same DB + key
    await expect(svcB.login(email, "a-very-long-password-1")).rejects.toThrow(/mfa_required/);
    expect((await svcB.login(email, "a-very-long-password-1", totp(secret))).staff.mfa).toBe(true);
    await svcB.login(email, "a-very-long-password-1", recoveryCodes[0]);
    await expect(svcA.login(email, "a-very-long-password-1", recoveryCodes[0])).rejects.toThrow(/invalid credentials/);   // used on B, rejected on A
    const [row] = await client`select mfa_secret from platform.staff_user where email = ${email}`; expect(row.mfa_secret).not.toContain(secret);   // encrypted at rest
    await client.end();
  });
});
