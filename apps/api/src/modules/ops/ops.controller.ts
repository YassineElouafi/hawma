import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UnauthorizedException, HttpCode } from "@nestjs/common";
import { z } from "zod";
import { OpsService } from "./ops.service";
import { BookingsService } from "../bookings/bookings.service";
import { LedgerService } from "../ledger/ledger.service";
import { StaffService, type Staff } from "./staff.service";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200), code: z.string().max(20).optional() });
const codeSchema = z.object({ code: z.string().min(6).max(20) });
const settleSchema = z.object({ providerId: z.string().uuid(), amountCentimes: z.number().int().min(1).max(10_000_000), reference: z.string().uuid(), reason: z.string().min(5).max(300) });
const decisionSchema = z.object({ reason: z.string().max(500).optional() });

@Controller("ops")
export class OpsController {
  constructor(@Inject(StaffService) private staff: StaffService, @Inject(OpsService) private ops: OpsService, @Inject(BookingsService) private bookings: BookingsService, @Inject(LedgerService) private ledger: LedgerService) {}
  private async me(h?: string): Promise<Staff> { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.staff.authenticate(h.slice(7)); }

  @Post("login") @HttpCode(200) login(@Body() b: unknown) { const v = loginSchema.parse(b); return this.staff.login(v.email, v.password, v.code); }
  @Post("mfa/setup") @HttpCode(200) async mfaSetup(@Headers("authorization") h: string) { return this.staff.mfaSetup(await this.me(h)); }
  @Post("mfa/enable") @HttpCode(200) async mfaEnable(@Headers("authorization") h: string, @Body() b: unknown) { return this.staff.mfaEnable(await this.me(h), codeSchema.parse(b).code); }
  @Post("mfa/disable") @HttpCode(200) async mfaDisable(@Headers("authorization") h: string, @Body() b: unknown) { return this.staff.mfaDisable(await this.me(h), codeSchema.parse(b).code); }
  @Get("me") async whoami(@Headers("authorization") h: string) { return this.me(h); }

  @Get("kyc") async kycQueue(@Headers("authorization") h: string, @Query("limit") limit?: string) {
    const s = await this.me(h); this.staff.require(s, "kyc.read"); return this.ops.kycQueue(Math.min(Number(limit) || 50, 200));
  }
  @Post("kyc/:id/approve") @HttpCode(200) async approve(@Headers("authorization") h: string, @Param("id") id: string, @Body() b: unknown) {
    const s = await this.me(h); this.staff.require(s, "kyc.review"); return this.ops.kycDecision(s, id, "approved", decisionSchema.parse(b ?? {}).reason);
  }
  @Post("kyc/:id/reject") @HttpCode(200) async reject(@Headers("authorization") h: string, @Param("id") id: string, @Body() b: unknown) {
    const s = await this.me(h); this.staff.require(s, "kyc.review"); return this.ops.kycDecision(s, id, "rejected", decisionSchema.parse(b ?? {}).reason);
  }
  @Post("seed-demo") @HttpCode(200) async seed(@Headers("authorization") h: string) {
    const s = await this.me(h); this.staff.require(s, "staff.manage");
    if (!this.ops.seeder) return { created: 0, note: "seeding requires the Postgres store" };
    const r = await this.ops.seeder(); await this.ops.auditNote(s, "demo.seed", "catalogue", "seed demo marketplace data", r); return r;
  }
  @Get("stats") async stats(@Headers("authorization") h: string) {
    const s = await this.me(h); this.staff.require(s, "bookings.read");
    const [b, q] = await Promise.all([this.bookings.stats(14), this.ops.kycQueue(200)]);
    const sum = (ks: string[]) => ks.reduce((n, k) => n + (b.byState[k] ?? 0), 0);
    const active = sum(["Accepted", "EnRoute", "Arrived", "InProgress"]), done = sum(["Settled", "Confirmed", "Completed"]), lost = sum(["Cancelled", "Declined", "Expired"]);
    return { ...b, active, pendingKyc: q.length, fillRate: done + lost ? done / (done + lost) : null };
  }
  @Get("finance") async finance(@Headers("authorization") h: string) { const s = await this.me(h); this.staff.require(s, "audit.read"); return this.ledger.totals(); }
  @Get("backups") async backups(@Headers("authorization") h: string) {
    const s = await this.me(h); this.staff.require(s, "bookings.read");
    const d = await this.ops.backupStatus(); return d;
  }
  @Get("finance/debtors") async debtors(@Headers("authorization") h: string) { const s = await this.me(h); this.staff.require(s, "audit.read"); return this.ledger.debtors(50); }
  /** Finance records cash received from a provider against fees owed. Idempotent on `reference`; audited with a reason. */
  @Post("finance/settlements") @HttpCode(200) async settle(@Headers("authorization") h: string, @Body() b: unknown) {
    const s = await this.me(h); this.staff.require(s, "payouts.approve"); const v = settleSchema.parse(b);
    const r = await this.ledger.settleCash(v.providerId, v.amountCentimes, v.reference);
    if (r.posted) await this.ops.auditNote(s, "finance.cash_settlement", v.providerId, v.reason, { amountCentimes: v.amountCentimes, reference: v.reference });
    return r;
  }
  @Get("bookings") async listBookings(@Headers("authorization") h: string, @Query("state") state?: string) { const s = await this.me(h); this.staff.require(s, "bookings.read"); return this.bookings.listAll(state || undefined, 100); }
  @Get("bookings/:id") async oneBooking(@Headers("authorization") h: string, @Param("id") id: string) { const s = await this.me(h); this.staff.require(s, "bookings.read"); return this.bookings.getAny(id); }
  @Get("audit") async audit(@Headers("authorization") h: string) { const s = await this.me(h); this.staff.require(s, "audit.read"); return this.ops.auditLog(); }
}
