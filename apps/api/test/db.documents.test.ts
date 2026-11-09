import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "../src/db/schema";
import { DocCrypto } from "../src/modules/documents/crypto";
import { DocumentsService } from "../src/modules/documents/documents.service";
import { PgDocRepo } from "../src/modules/documents/pg-documents.repo";

const url = process.env.DATABASE_URL;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 5)]);
(url ? describe : describe.skip)("KYC documents on real Postgres", () => {
  let client: ReturnType<typeof postgres>; let db: ReturnType<typeof drizzle>;
  beforeAll(() => { client = postgres(url!, { max: 2 }); db = drizzle(client); });
  afterAll(async () => { await client.end(); });
  it("stores only ciphertext; round-trips through the service", async () => {
    const [u] = await db.insert(s.users).values({ phone: `+2126${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning();
    const [v] = await db.insert(s.verifications).values({ userId: u.id, tier: 1, status: "in_review", documents: [] }).returning();
    const svc = new DocumentsService(new PgDocRepo(db), new DocCrypto());
    const meta = await svc.upload(u.id, v.id, "cin_front", PNG.toString("base64"));
    const [row] = await client`select ciphertext from identity.kyc_document where id = ${meta.id}`;
    expect(Buffer.from(row.ciphertext).includes(Buffer.alloc(100, 5))).toBe(false);                  // plaintext bytes are not in the table
    expect((await svc.read(meta.id)).bytes.equals(PNG)).toBe(true);
    await expect(svc.upload(crypto.randomUUID(), v.id, "selfie", PNG.toString("base64"))).rejects.toThrow();
  });
});
