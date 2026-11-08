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
