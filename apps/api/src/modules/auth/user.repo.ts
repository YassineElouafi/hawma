import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";

export interface UserRepo { upsertByPhone(phone: string): Promise<{ id: string; displayName?: string; locale: string }>; byId(id: string): Promise<{ id: string; phone: string; displayName?: string; locale: string; status: string } | undefined> }
export interface SessionRepo { create(userId: string, refreshToken: string, ttlDays: number): Promise<void>; consume(refreshToken: string): Promise<string | undefined>; revokeAll(userId: string): Promise<void> }
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export class MemoryUserRepo implements UserRepo {
  private m = new Map<string, { id: string; phone: string; displayName?: string; locale: string; status: string }>();
  async upsertByPhone(phone: string) { let u = [...this.m.values()].find((x) => x.phone === phone); if (!u) { u = { id: randomUUID(), phone, locale: "fr", status: "active" }; this.m.set(u.id, u); } return u; }
  async byId(id: string) { return this.m.get(id); }
}
export class MemorySessionRepo implements SessionRepo {
  private m = new Map<string, { userId: string; exp: number }>();
  async create(userId: string, t: string, days: number) { this.m.set(hashToken(t), { userId, exp: Date.now() + days * 864e5 }); }
  async consume(t: string) { const k = hashToken(t), v = this.m.get(k); this.m.delete(k); return v && v.exp > Date.now() ? v.userId : undefined; }
  async revokeAll(userId: string) { for (const [k, v] of this.m) if (v.userId === userId) this.m.delete(k); }
}

export class PgUserRepo implements UserRepo {
  constructor(private db: PostgresJsDatabase) {}
  async upsertByPhone(phone: string) {
    const [u] = await this.db.insert(s.users).values({ phone }).onConflictDoUpdate({ target: s.users.phone, set: { phone } }).returning();
    return { id: u.id, displayName: u.displayName ?? undefined, locale: u.locale };
  }
  async byId(id: string) { const [u] = await this.db.select().from(s.users).where(eq(s.users.id, id)); return u && { id: u.id, phone: u.phone, displayName: u.displayName ?? undefined, locale: u.locale, status: u.status }; }
}
export class PgSessionRepo implements SessionRepo {
  constructor(private db: PostgresJsDatabase) {}
  async create(userId: string, t: string, days: number) { await this.db.insert(s.sessions).values({ userId, refreshHash: hashToken(t), expiresAt: new Date(Date.now() + days * 864e5) }); }
  /** One-time use: marks revoked atomically; a replayed token returns undefined. */
  async consume(t: string) {
    const [r] = await this.db.update(s.sessions).set({ revokedAt: new Date() })
      .where(and(eq(s.sessions.refreshHash, hashToken(t)), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date()))).returning({ userId: s.sessions.userId });
    return r?.userId;
  }
  async revokeAll(userId: string) { await this.db.update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt))); }
}
