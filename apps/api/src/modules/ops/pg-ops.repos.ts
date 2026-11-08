import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { AuditEntry, AuditRepo, KycRepo, Verification } from "./ops.service";

const toV = (r: typeof s.verifications.$inferSelect): Verification => ({ id: r.id, userId: r.userId, tier: r.tier, status: r.status as Verification["status"], reason: r.reason ?? undefined, documents: (r.documents as string[]) ?? [], createdAt: r.createdAt.toISOString() });

export class PgAuditRepo implements AuditRepo {
  constructor(private db: PostgresJsDatabase) {}
  async append(e: Omit<AuditEntry, "id" | "at">) { await this.db.insert(s.auditLog).values({ actorId: e.actorId, action: e.action, target: e.target, reason: e.reason, meta: e.meta }); }
  async list(limit: number) {
    const rows = await this.db.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(limit);
    return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), actorId: r.actorId ?? "", action: r.action, target: r.target ?? "", reason: r.reason ?? undefined, meta: r.meta as Record<string, unknown> }));
  }
}

export class PgKycRepo implements KycRepo {
  constructor(private db: PostgresJsDatabase) {}
  async list(status: Verification["status"][], limit: number) {
    return (await this.db.select().from(s.verifications).where(inArray(s.verifications.status, status)).orderBy(s.verifications.createdAt).limit(limit)).map(toV);
  }
  async get(id: string) { const [r] = await this.db.select().from(s.verifications).where(eq(s.verifications.id, id)); return r && toV(r); }

  async decide(id: string, status: "approved" | "rejected", reviewerId: string, reason: string | undefined, expected: Verification["status"][], audit: Omit<AuditEntry, "id" | "at">) {
    return this.db.transaction(async (tx) => {
      const [r] = await tx.update(s.verifications).set({ status, reason, reviewerId, decidedAt: new Date() })
        .where(and(eq(s.verifications.id, id), inArray(s.verifications.status, expected))).returning();
      if (!r) return undefined;
      if (status === "approved") {
        await tx.insert(s.providers).values({ userId: r.userId, kycTier: r.tier, status: "active" })
          .onConflictDoUpdate({ target: s.providers.userId, set: { kycTier: sql`greatest(${s.providers.kycTier}, ${r.tier})`, status: "active" } });
      }
      await tx.insert(s.auditLog).values({ actorId: audit.actorId, action: audit.action, target: audit.target, reason: audit.reason, meta: audit.meta });
      return toV(r);
    });
  }
}
