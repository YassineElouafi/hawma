import { Module } from "@nestjs/common";
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

export const OVERRIDES = { otpSender: new ConsoleOtpSender(), catalogueRepo: new MemoryCatalogueRepo(), staffRepo: new MemoryStaffRepo(), kycRepo: undefined as unknown as MemoryKycRepo, auditRepo: new MemoryAuditRepo() };
OVERRIDES.kycRepo = new MemoryKycRepo(OVERRIDES.auditRepo);

@Module({
  controllers: [HealthController, AuthController, BookingsController, CatalogueController, OpsController],
  providers: [
    { provide: "CATALOGUE_REPO", useFactory: () => OVERRIDES.catalogueRepo },
    CatalogueService,
    { provide: StaffService, useFactory: () => new StaffService(OVERRIDES.staffRepo) },
    { provide: OpsService, useFactory: () => new OpsService(OVERRIDES.auditRepo, OVERRIDES.kycRepo) },
    { provide: AuthService, useFactory: () => new AuthService(process.env.REDIS_URL ? new RedisOtpStore(new Redis(process.env.REDIS_URL)) : new MemoryOtpStore(), OVERRIDES.otpSender) },
    { provide: BookingsService, useFactory: () => new BookingsService(new MemoryBookingRepo()) },
  ],
})
export class AppModule {}
