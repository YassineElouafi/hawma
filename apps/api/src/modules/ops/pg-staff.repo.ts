import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import { hashPassword, type StaffRecord, type StaffRepo } from "./staff.service";
import { ROLES, type Role } from "../../domain/rbac";

const toRec = (r: typeof s.staffUsers.$inferSelect): StaffRecord => ({ id: r.id, email: r.email, passwordHash: r.passwordHash, roles: (r.roles as Role[]), active: r.active });

export class PgStaffRepo implements StaffRepo {
  constructor(private db: PostgresJsDatabase) {}
  async byEmail(email: string) { const [r] = await this.db.select().from(s.staffUsers).where(eq(s.staffUsers.email, email.toLowerCase())); return r && toRec(r); }
  async byId(id: string) { const [r] = await this.db.select().from(s.staffUsers).where(eq(s.staffUsers.id, id)); return r && toRec(r); }

  /** Idempotent: creates the account or updates its password/roles. Used by the bootstrap CLI. */
  async upsert(email: string, password: string, roles: Role[]) {
    if (password.length < 12) throw new Error("staff passwords must be at least 12 characters");
    for (const r of roles) if (!(ROLES as readonly string[]).includes(r)) throw new Error(`unknown role ${r}`);
    const passwordHash = await hashPassword(password);
    const [r] = await this.db.insert(s.staffUsers).values({ email: email.toLowerCase(), passwordHash, roles }).onConflictDoUpdate({ target: s.staffUsers.email, set: { passwordHash, roles, active: true } }).returning();
    return toRec(r);
  }
}
