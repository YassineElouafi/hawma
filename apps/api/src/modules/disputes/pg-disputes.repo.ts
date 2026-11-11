import { and, eq } from "drizzle-orm";
import { ConflictException } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { Dispute, DisputeRepo, Outcome } from "./disputes.service";

const toD = (r: typeof s.disputes.$inferSelect): Dispute => ({ id: r.id, bookingId: r.bookingId, openedBy: r.openedBy, reason: r.reason, status: r.status as Dispute["status"], outcome: (r.outcome as Outcome) ?? undefined, refundCentimes: r.refundCentimes ?? undefined, resolutionNote: r.resolutionNote ?? undefined, resolvedBy: r.resolvedBy ?? undefined, createdAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() });
export class PgDisputeRepo implements DisputeRepo {
  constructor(private db: PostgresJsDatabase) {}
  async create(d: { bookingId: string; openedBy: string; reason: string }) {
    try { const [r] = await this.db.insert(s.disputes).values(d).returning(); return toD(r); }
    catch (e) { const c = e as { code?: string; cause?: { code?: string } }; if ((c.code ?? c.cause?.code) === "23505") throw new ConflictException("this booking already has a dispute"); throw e; }
  }
  async get(id: string) { const [r] = await this.db.select().from(s.disputes).where(eq(s.disputes.id, id)); return r && toD(r); }
  async forBooking(b: string) { const [r] = await this.db.select().from(s.disputes).where(eq(s.disputes.bookingId, b)); return r && toD(r); }
  async list(status: "open" | "resolved", limit: number) { return (await this.db.select().from(s.disputes).where(eq(s.disputes.status, status)).orderBy(s.disputes.createdAt).limit(limit)).map(toD); }
  async resolve(id: string, r: { outcome: Outcome; refundCentimes?: number; note: string; by: string }) {
    const [row] = await this.db.update(s.disputes).set({ status: "resolved", outcome: r.outcome, refundCentimes: r.refundCentimes, resolutionNote: r.note, resolvedBy: r.by, resolvedAt: new Date() }).where(and(eq(s.disputes.id, id), eq(s.disputes.status, "open"))).returning();
    return row && toD(row);
  }
}
