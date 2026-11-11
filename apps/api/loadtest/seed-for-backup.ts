import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import * as s from "../src/db/schema";
import { BookingsService } from "../src/modules/bookings/bookings.service";
import { PgBookingRepo } from "../src/modules/bookings/pg-booking.repo";
import { LedgerService } from "../src/modules/ledger/ledger.service";
import { PgLedgerRepo } from "../src/modules/ledger/pg-ledger.repo";
import { DocumentsService } from "../src/modules/documents/documents.service";
import { PgDocRepo } from "../src/modules/documents/pg-documents.repo";
import { DocCrypto } from "../src/modules/documents/crypto";

const client = postgres(process.env.DATABASE_URL!, { max: 4 }); const db = drizzle(client);
const repo = new PgBookingRepo(db), bookings = new BookingsService(repo), ledger = new LedgerService(new PgLedgerRepo(db), repo);
const [u] = await db.insert(s.users).values({ phone: "+212611000001" }).returning(); await db.insert(s.providers).values({ userId: u.id, kycTier: 1, status: "active" });
for (let i = 0; i < 25; i++) {
  const cust = randomUUID(); const b = await bookings.create(cust, { mode: "catalogue", providerId: u.id, totalCentimes: 10000 + i * 100, paymentMethod: "cash" });
  for (const c of ["accept", "start_trip", "arrive", "start_job", "complete"] as const) await bookings.command(b.id, c, u.id);
  await bookings.command(b.id, "confirm", cust); await ledger.settleBooking(b.id);
}
const [v] = await db.insert(s.verifications).values({ userId: u.id, tier: 1, status: "in_review", documents: [] }).returning();
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 9)]);
await new DocumentsService(new PgDocRepo(db), new DocCrypto(process.env.KYC_ENC_KEY)).upload(u.id, v.id, "cin_front", png.toString("base64"));
console.log("seeded"); await client.end();
