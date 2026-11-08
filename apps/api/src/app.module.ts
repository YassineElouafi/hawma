import { Module } from "@nestjs/common";
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

export const OVERRIDES = { otpSender: new ConsoleOtpSender(), catalogueRepo: new MemoryCatalogueRepo() };

@Module({
  controllers: [HealthController, AuthController, BookingsController, CatalogueController],
  providers: [
    { provide: "CATALOGUE_REPO", useFactory: () => OVERRIDES.catalogueRepo },
    CatalogueService,
    { provide: AuthService, useFactory: () => new AuthService(process.env.REDIS_URL ? new RedisOtpStore(new Redis(process.env.REDIS_URL)) : new MemoryOtpStore(), OVERRIDES.otpSender) },
    { provide: BookingsService, useFactory: () => new BookingsService(new MemoryBookingRepo()) },
  ],
})
export class AppModule {}
