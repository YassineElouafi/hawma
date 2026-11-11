import { Module } from "@nestjs/common";
import { DisputesController } from "./modules/disputes/disputes.controller";
import { DisputesService, MemoryDisputeRepo } from "./modules/disputes/disputes.service";
import { PgDisputeRepo } from "./modules/disputes/pg-disputes.repo";
import { LedgerService, MemoryLedgerRepo } from "./modules/ledger/ledger.service";
import { PgLedgerRepo } from "./modules/ledger/pg-ledger.repo";
import { DispatchController } from "./modules/dispatch/dispatch.controller";
import { DispatchService, MemoryOfferRepo } from "./modules/dispatch/dispatch.service";
import { PgOfferRepo, PgProviderPort } from "./modules/dispatch/pg-dispatch.repo";
import { MemoryPresence, RedisPresence } from "./modules/dispatch/presence";
import { MemoryBus, RedisBus } from "./realtime/bus";
import { DocumentsController } from "./modules/documents/documents.controller";
import { DocumentsService, MemoryDocRepo } from "./modules/documents/documents.service";
import { PgDocRepo } from "./modules/documents/pg-documents.repo";
import { DocCrypto } from "./modules/documents/crypto";
import { ReviewsController } from "./modules/reviews/reviews.controller";
import { MemoryReviewRepo, ReviewsService } from "./modules/reviews/reviews.service";
import { PgReviewRepo, PgStatsSink } from "./modules/reviews/pg-reviews.repo";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgBookingRepo } from "./modules/bookings/pg-booking.repo";
import { PgCatalogueRepo } from "./modules/catalogue/pg-catalogue.repo";
import { PgAuditRepo, PgKycRepo } from "./modules/ops/pg-ops.repos";
import { PgStaffRepo } from "./modules/ops/pg-staff.repo";
import { PgSessionRepo, PgUserRepo } from "./modules/auth/user.repo";
import { seedDemo } from "./db/seed-demo";
import { backupLog as schemaBackup } from "./db/schema";
import { desc } from "drizzle-orm";
import { senderFromEnv } from "./modules/auth/otp-senders";
import { OpsController } from "./modules/ops/ops.controller";
import { VerificationController } from "./modules/ops/verification.controller";
import { OpsService, MemoryAuditRepo, MemoryKycRepo } from "./modules/ops/ops.service";
import { StaffService, MemoryStaffRepo } from "./modules/ops/staff.service";
import { CatalogueController } from "./modules/catalogue/catalogue.controller";
import { CatalogueService } from "./modules/catalogue/catalogue.service";
import { MemoryCatalogueRepo } from "./modules/catalogue/memory-catalogue.repo";
import Redis from "ioredis";
import { RedisOtpStore } from "./modules/auth/redis-otp.store";
import { HealthController } from "./modules/health/health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService, ConsoleOtpSender, MemoryOtpStore } from "./modules/auth/auth.service";
import { BookingsController } from "./modules/bookings/bookings.controller";
import { BookingsService, MemoryBookingRepo } from "./modules/bookings/bookings.service";

export const db = process.env.HAWMA_STORE === "postgres" && process.env.DATABASE_URL ? drizzle(postgres(process.env.DATABASE_URL, { max: Number(process.env.DB_POOL ?? 10) })) : undefined;

const memStats = new Map<string, { ratings: number[] }>();
const otp = senderFromEnv(process.env);
if (process.env.NODE_ENV === "production") console.log(`otp delivery: ${otp.kind.join(" -> ")}${process.env.OTP_DEBUG_RETURN_CODE === "true" ? " (PILOT: codes also returned in API responses)" : ""}`);
type CatStats = { stats?: Map<string, { tier: number; status: string; rating: number; cancelRate: number }>; tiers?: Record<string, number> };
type ProviderPort = import("./modules/dispatch/dispatch.service").ProviderPort;
function memoryProviderPort(): ProviderPort {
  const cat = (): CatStats => OVERRIDES.catalogueRepo as unknown as CatStats;
  return {
    async profile(id: string) { const st = cat().stats?.get(id); return st && { tier: st.tier, status: st.status, rating: st.rating, cancelRate: st.cancelRate, acceptance: 1 }; },
    async busy(id: string): Promise<boolean> { const all = (await OVERRIDES.bookingRepoRef?.listAll(undefined, 1000)) ?? []; return all.some((b) => b.providerId === id && ["Accepted", "EnRoute", "Arrived", "InProgress"].includes(b.state)); },
    async requiredTier(c: string | null | undefined): Promise<number> { return cat().tiers?.[c ?? ""] ?? 1; },
  };
}

export const OVERRIDES = {
  disputeRepo: new MemoryDisputeRepo(),
  ledgerRepo: new MemoryLedgerRepo(),
  bus: new MemoryBus(), presence: new MemoryPresence(), offerRepo: new MemoryOfferRepo(),
  providerPort: memoryProviderPort(),
  bookingRepoRef: undefined as import("./modules/bookings/bookings.service").BookingRepo | undefined,
  reviewRepo: new MemoryReviewRepo(),
  // memory stand-in for the Postgres recompute: keeps the catalogue stats map in sync for tests/dev
  statsSink: { async refresh(providerId: string) { const r = OVERRIDES.reviewRepo.items.filter((x) => x.subjectId === providerId).map((x) => x.rating); memStats.set(providerId, { ratings: r }); const st = (OVERRIDES.catalogueRepo as unknown as { stats?: Map<string, { rating: number }> }).stats?.get(providerId); if (st) { st.rating = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; } } }, otpSender: otp.sender as ConsoleOtpSender, catalogueRepo: db ? new PgCatalogueRepo(db) : new MemoryCatalogueRepo(), staffRepo: db ? new PgStaffRepo(db) : new MemoryStaffRepo(), auditRepo: db ? new PgAuditRepo(db) : new MemoryAuditRepo(), kycRepo: undefined as unknown as import("./modules/ops/ops.service").KycRepo };
OVERRIDES.kycRepo = db ? new PgKycRepo(db) : new MemoryKycRepo(OVERRIDES.auditRepo as MemoryAuditRepo);

@Module({
  controllers: [HealthController, AuthController, BookingsController, CatalogueController, OpsController, VerificationController, ReviewsController, DocumentsController, DispatchController, DisputesController],
  providers: [
    { provide: "DISPUTE_REPO", useFactory: () => (db ? new PgDisputeRepo(db) : OVERRIDES.disputeRepo) },
    { provide: "LEDGER", useFactory: (l: LedgerService) => l, inject: [LedgerService] },
    DisputesService,
    { provide: "LEDGER_REPO", useFactory: () => (db ? new PgLedgerRepo(db) : OVERRIDES.ledgerRepo) },
    LedgerService,
    { provide: "BUS", useFactory: () => (process.env.REDIS_URL ? new RedisBus(new Redis(process.env.REDIS_URL), new Redis(process.env.REDIS_URL)) : OVERRIDES.bus) },
    { provide: "PRESENCE", useFactory: () => (process.env.REDIS_URL && !process.env.VITEST ? new RedisPresence(new Redis(process.env.REDIS_URL)) : OVERRIDES.presence) },
    { provide: "OFFER_REPO", useFactory: () => (db ? new PgOfferRepo(db) : OVERRIDES.offerRepo) },
    { provide: "PROVIDER_PORT", useFactory: (l: LedgerService) => (db ? new PgProviderPort(db, l) : OVERRIDES.providerPort), inject: [LedgerService] },
    { provide: "BOOKINGS", useFactory: (b: BookingsService) => b, inject: [BookingsService] },
    { provide: "CLOCK", useValue: () => Date.now() },
    DispatchService,
    { provide: "DOC_CRYPTO", useFactory: () => new DocCrypto(process.env.KYC_ENC_KEY) },
    { provide: "DOC_REPO", useFactory: () => (db ? new PgDocRepo(db) : new MemoryDocRepo((id) => { const v = (OVERRIDES.kycRepo as unknown as { items?: Map<string, { userId: string; status: string }> }).items?.get(id); return v && { userId: v.userId, status: v.status }; })) },
    DocumentsService,
    { provide: "REVIEW_REPO", useFactory: () => (db ? new PgReviewRepo(db) : OVERRIDES.reviewRepo) },
    { provide: "BOOKING_REPO", useFactory: (b: BookingsService) => b.repo, inject: [BookingsService] },
    { provide: "STATS_SINK", useFactory: () => (db ? new PgStatsSink(db) : OVERRIDES.statsSink) },
    ReviewsService,
    { provide: "CATALOGUE_REPO", useFactory: () => OVERRIDES.catalogueRepo },
    CatalogueService,
    { provide: StaffService, useFactory: () => new StaffService(OVERRIDES.staffRepo) },
    { provide: OpsService, useFactory: () => new OpsService(OVERRIDES.auditRepo, OVERRIDES.kycRepo, db ? () => seedDemo(db) : undefined, db ? async () => (await db.select().from(schemaBackup).orderBy(desc(schemaBackup.id)).limit(8)).map((r) => ({ at: r.at.toISOString(), ok: r.ok, file: r.file, bytes: r.bytes, error: r.error })) : undefined) },
    { provide: AuthService, useFactory: () => new AuthService(process.env.REDIS_URL ? new RedisOtpStore(new Redis(process.env.REDIS_URL)) : new MemoryOtpStore(), OVERRIDES.otpSender, db ? new PgUserRepo(db) : undefined, db ? new PgSessionRepo(db) : undefined) },
    { provide: BookingsService, useFactory: () => { const repo = db ? new PgBookingRepo(db) : new MemoryBookingRepo(); OVERRIDES.bookingRepoRef = repo; return new BookingsService(repo); } },
  ],
})
export class AppModule {}
