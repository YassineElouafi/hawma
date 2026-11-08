import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UnauthorizedException, HttpCode } from "@nestjs/common";
import { z } from "zod";
import { OpsService } from "./ops.service";
import { BookingsService } from "../bookings/bookings.service";
import { StaffService, type Staff } from "./staff.service";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
const decisionSchema = z.object({ reason: z.string().max(500).optional() });

@Controller("ops")
export class OpsController {
  constructor(@Inject(StaffService) private staff: StaffService, @Inject(OpsService) private ops: OpsService, @Inject(BookingsService) private bookings: BookingsService) {}
  private async me(h?: string): Promise<Staff> { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.staff.authenticate(h.slice(7)); }

  @Post("login") @HttpCode(200) login(@Body() b: unknown) { const v = loginSchema.parse(b); return this.staff.login(v.email, v.password); }
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
  @Get("bookings") async listBookings(@Headers("authorization") h: string, @Query("state") state?: string) { const s = await this.me(h); this.staff.require(s, "bookings.read"); return this.bookings.listAll(state || undefined, 100); }
  @Get("bookings/:id") async oneBooking(@Headers("authorization") h: string, @Param("id") id: string) { const s = await this.me(h); this.staff.require(s, "bookings.read"); return this.bookings.getAny(id); }
  @Get("audit") async audit(@Headers("authorization") h: string) { const s = await this.me(h); this.staff.require(s, "audit.read"); return this.ops.auditLog(); }
}
