import { Module } from "@nestjs/common";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgBookingRepo } from "./modules/bookings/pg-booking.repo";
import { PgCatalogueRepo } from "./modules/catalogue/pg-catalogue.repo";
import { PgAuditRepo, PgKycRepo } from "./modules/ops/pg-ops.repos";
import { PgStaffRepo } from "./modules/ops/pg-staff.repo";
import { PgSessionRepo, PgUserRepo } from "./modules/auth/user.repo";
import { seedDemo } from "./db/seed-demo";
import { OpsController } from "./modules/ops/ops.controller";
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

const db = process.env.HAWMA_STORE === "postgres" && process.env.DATABASE_URL ? drizzle(postgres(process.env.DATABASE_URL, { max: Number(process.env.DB_POOL ?? 10) })) : undefined;

export const OVERRIDES = { otpSender: new ConsoleOtpSender(), catalogueRepo: db ? new PgCatalogueRepo(db) : new MemoryCatalogueRepo(), staffRepo: db ? new PgStaffRepo(db) : new MemoryStaffRepo(), auditRepo: db ? new PgAuditRepo(db) : new MemoryAuditRepo(), kycRepo: undefined as unknown as import("./modules/ops/ops.service").KycRepo };
OVERRIDES.kycRepo = db ? new PgKycRepo(db) : new MemoryKycRepo(OVERRIDES.auditRepo as MemoryAuditRepo);

@Module({
  controllers: [HealthController, AuthController, BookingsController, CatalogueController, OpsController],
  providers: [
    { provide: "CATALOGUE_REPO", useFactory: () => OVERRIDES.catalogueRepo },
    CatalogueService,
    { provide: StaffService, useFactory: () => new StaffService(OVERRIDES.staffRepo) },
    { provide: OpsService, useFactory: () => new OpsService(OVERRIDES.auditRepo, OVERRIDES.kycRepo, db ? () => seedDemo(db) : undefined) },
    { provide: AuthService, useFactory: () => new AuthService(process.env.REDIS_URL ? new RedisOtpStore(new Redis(process.env.REDIS_URL)) : new MemoryOtpStore(), OVERRIDES.otpSender, db ? new PgUserRepo(db) : undefined, db ? new PgSessionRepo(db) : undefined) },
    { provide: BookingsService, useFactory: () => new BookingsService(db ? new PgBookingRepo(db) : new MemoryBookingRepo()) },
  ],
})
export class AppModule {}
