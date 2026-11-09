import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { DocMeta, DocRepo } from "./documents.service";

const toMeta = (r: typeof s.kycDocuments.$inferSelect): DocMeta => ({ id: r.id, verificationId: r.verificationId, userId: r.userId, kind: r.kind, mime: r.mime, size: r.size, createdAt: r.createdAt.toISOString() });
export class PgDocRepo implements DocRepo {
  constructor(private db: PostgresJsDatabase) {}
  async add(m: Omit<DocMeta, "id" | "createdAt">, nonce: string, data: Buffer) { const [r] = await this.db.insert(s.kycDocuments).values({ ...m, nonce, ciphertext: data }).returning(); return toMeta(r); }
  async list(v: string) { return (await this.db.select().from(s.kycDocuments).where(eq(s.kycDocuments.verificationId, v)).orderBy(s.kycDocuments.createdAt)).map(toMeta); }
  async get(id: string) { const [r] = await this.db.select().from(s.kycDocuments).where(eq(s.kycDocuments.id, id)); return r && { meta: toMeta(r), nonce: r.nonce, data: r.ciphertext }; }
  async verificationOwner(v: string) { const [r] = await this.db.select({ userId: s.verifications.userId, status: s.verifications.status }).from(s.verifications).where(eq(s.verifications.id, v)); return r; }
}
