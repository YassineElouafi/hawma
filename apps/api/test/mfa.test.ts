import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword, MemoryStaffRepo, StaffService } from "../src/modules/ops/staff.service";
import { totp } from "../src/modules/ops/totp";

async function setup(env: NodeJS.ProcessEnv = {}) {
  const repo = new MemoryStaffRepo(); const id = randomUUID();
  repo.items.set(id, { id, email: "fin@hawma.ma", passwordHash: await hashPassword("correct horse battery"), roles: ["finance"], active: true });
  return { repo, id, svc: new StaffService(repo, undefined, env) };
}
const enroll = async (s: Awaited<ReturnType<typeof setup>>) => {
  const { token } = await s.svc.login("fin@hawma.ma", "correct horse battery"); const staff = await s.svc.authenticate(token);
  const { secret } = await s.svc.mfaSetup(staff); const { recoveryCodes } = await s.svc.mfaEnable(staff, totp(secret)); return { secret, recoveryCodes, staff };
};

describe("staff MFA", () => {
  it("setup → enable (needs a valid code) → login requires the second factor", async () => {
    const s = await setup(); const { token } = await s.svc.login("fin@hawma.ma", "correct horse battery"); const staff = await s.svc.authenticate(token);
    expect(staff.mfa).toBe(false);
    const { secret, otpauthUrl } = await s.svc.mfaSetup(staff); expect(otpauthUrl).toContain(secret);
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery", "123456")).resolves.toBeTruthy();   // not enabled yet: a stray code is ignored
    await expect(s.svc.mfaEnable(staff, "000000")).rejects.toThrow(/not valid/);
    const { recoveryCodes } = await s.svc.mfaEnable(staff, totp(secret)); expect(recoveryCodes).toHaveLength(8);
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery")).rejects.toThrow(/mfa_required/);
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery", "000000")).rejects.toThrow(/invalid credentials/);
    const ok = await s.svc.login("fin@hawma.ma", "correct horse battery", totp(secret)); expect(ok.staff.mfa).toBe(true);
    expect((await s.svc.authenticate(ok.token)).mfa).toBe(true);
    await expect(s.svc.login("fin@hawma.ma", "wrong password!!", totp(secret))).rejects.toThrow(/invalid credentials/);   // password still checked first
  });

  it("the TOTP secret is encrypted at rest", async () => {
    const s = await setup(); const { secret } = await enroll(s);
    expect(s.repo.items.get(s.id)!.mfaSecret).toBeTruthy(); expect(s.repo.items.get(s.id)!.mfaSecret).not.toContain(secret);
  });

  it("recovery codes work exactly once", async () => {
    const s = await setup(); const { recoveryCodes } = await enroll(s);
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery", recoveryCodes[0])).resolves.toBeTruthy();
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery", recoveryCodes[0])).rejects.toThrow(/invalid credentials/);
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery", recoveryCodes[1].toUpperCase())).resolves.toBeTruthy();   // case-insensitive
  });

  it("wrong second factors count toward the lockout", async () => {
    const s = await setup(); await enroll(s);
    for (let i = 0; i < 5; i++) await s.svc.login("fin@hawma.ma", "correct horse battery", "000000").catch(() => {});
    await expect(s.svc.login("fin@hawma.ma", "correct horse battery", "000000")).rejects.toThrow(/locked/);
  });

  it("can be disabled only with a valid code; re-enrolling is possible", async () => {
    const s = await setup(); const { secret, staff } = await enroll(s);
    await expect(s.svc.mfaDisable(staff, "000000")).rejects.toThrow(/invalid/); await expect(s.svc.mfaSetup(staff)).rejects.toThrow(/already enabled/);
    await s.svc.mfaDisable(staff, totp(secret)); const { token } = await s.svc.login("fin@hawma.ma", "correct horse battery"); expect((await s.svc.authenticate(token)).mfa).toBe(false);
  });

  it("OPS_REQUIRE_MFA gates sensitive actions for staff without MFA only", async () => {
    const s = await setup({ OPS_REQUIRE_MFA: "true" } as NodeJS.ProcessEnv);
    const { token } = await s.svc.login("fin@hawma.ma", "correct horse battery"); const noMfa = await s.svc.authenticate(token);
    expect(() => s.svc.require(noMfa, "payouts.approve")).toThrow(/mfa_required/);
    expect(() => s.svc.require(noMfa, "audit.read")).not.toThrow();                                        // read-only things stay available
    const { secret } = await s.svc.mfaSetup(noMfa); await s.svc.mfaEnable(noMfa, totp(secret));
    const withMfa = await s.svc.authenticate((await s.svc.login("fin@hawma.ma", "correct horse battery", totp(secret))).token);
    expect(() => s.svc.require(withMfa, "payouts.approve")).not.toThrow();
    const lax = (await setup()).svc; const t2 = await lax.login("fin@hawma.ma", "correct horse battery"); expect(() => lax.require(lax ? { id: "x", email: "x", roles: ["finance"], mfa: false } : (undefined as never), "payouts.approve")).not.toThrow(); expect(t2.token).toBeTruthy();
  });
});
