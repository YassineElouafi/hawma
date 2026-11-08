import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "../src/db/schema";
import { PgAuditRepo, PgKycRepo } from "../src/modules/ops/pg-ops.repos";
import { OpsService } from "../src/modules/ops/ops.service";

const url = process.env.DATABASE_URL;
(url ? describe : describe.skip)("Postgres ops repos (real Postgres)", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>; let ops: OpsService; let audit: PgAuditRepo;
  const staff = { id: crypto.randomUUID(), email: "ts@hawma.ma", roles: ["trust_safety" as const] };
  beforeAll(() => { client = postgres(url!, { max: 4 }); db = drizzle(client); audit = new PgAuditRepo(db); ops = new OpsService(audit, new PgKycRepo(db)); });
  afterAll(async () => { await client.end(); });

  async function submit(tier = 1) {
    const [u] = await db.insert(s.users).values({ phone: `+2127${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning();
    const [v] = await db.insert(s.verifications).values({ userId: u.id, tier, status: "in_review", documents: ["cin_front", "selfie"] }).returning();
    return { u, v };
  }

  it("approval activates the provider at the right tier and writes the audit row atomically", async () => {
    const { u, v } = await submit(2);
    expect((await ops.kycQueue()).map((x) => x.id)).toContain(v.id);
    const done = await ops.kycDecision(staff, v.id, "approved", "documents verified in person");
    expect(done.status).toBe("approved");
    const [p] = await client`select kyc_tier, status from identity.provider_profile where user_id = ${u.id}`;
    expect(p).toMatchObject({ kyc_tier: 2, status: "active" });
    const log = await audit.list(5);
    expect(log.find((e) => e.target === v.id)).toMatchObject({ action: "kyc.approved", actorId: staff.id, reason: "documents verified in person" });
  });

  it("two reviewers racing: exactly one decision and one audit row", async () => {
    const { v } = await submit(1);
    const res = await Promise.allSettled([ops.kycDecision(staff, v.id, "approved", "first reviewer ok"), ops.kycDecision({ ...staff, id: crypto.randomUUID() }, v.id, "rejected", "second reviewer says no")]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await client`select count(*)::int n from platform.audit_log where target = ${v.id}`;
    expect(n).toBe(1);
  });

  it("rejection records the reason and does not create a provider profile", async () => {
    const { u, v } = await submit(1);
    await ops.kycDecision(staff, v.id, "rejected", "CIN photo unreadable, please resubmit");
    const [r] = await client`select status, reason from identity.verification where id = ${v.id}`;
    expect(r).toMatchObject({ status: "rejected", reason: "CIN photo unreadable, please resubmit" });
    expect(await client`select 1 from identity.provider_profile where user_id = ${u.id}`).toHaveLength(0);
  });

  it("audit log cannot be tampered with", async () => {
    const [row] = await client`select id from platform.audit_log limit 1`;
    await expect(client`update platform.audit_log set action = 'x' where id = ${row.id}`).rejects.toThrow(/append-only/);
    await expect(client`delete from platform.audit_log where id = ${row.id}`).rejects.toThrow(/append-only/);
  });
});
