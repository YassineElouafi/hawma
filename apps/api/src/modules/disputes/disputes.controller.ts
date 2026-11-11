import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { StaffService } from "../ops/staff.service";
import { OpsService } from "../ops/ops.service";
import { DisputesService } from "./disputes.service";

const openSchema = z.object({ reason: z.string().min(10).max(1000) });
const resolveSchema = z.object({ outcome: z.enum(["reject", "refund_full", "refund_partial"]), note: z.string().min(5).max(500), refundCentimes: z.number().int().min(1).max(10_000_000).optional() });

@Controller()
export class DisputesController {
  constructor(@Inject(DisputesService) private svc: DisputesService, @Inject(AuthService) private auth: AuthService, @Inject(StaffService) private staff: StaffService, @Inject(OpsService) private ops: OpsService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }
  private async me(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.staff.authenticate(h.slice(7)); }

  @Post("v1/bookings/:id/disputes") async open(@Headers("authorization") h: string, @Param("id") id: string, @Body() b: unknown) { return this.svc.open(await this.uid(h), id, openSchema.parse(b).reason); }
  @Get("ops/disputes") async list(@Headers("authorization") h: string, @Query("status") status?: string) { const s = await this.me(h); this.staff.require(s, "disputes.resolve"); return this.svc.list(status === "resolved" ? "resolved" : "open"); }
  @Post("ops/disputes/:id/resolve") @HttpCode(200) async resolve(@Headers("authorization") h: string, @Param("id") id: string, @Body() b: unknown) {
    const s = await this.me(h); this.staff.require(s, "disputes.resolve"); const v = resolveSchema.parse(b);
    const d = await this.svc.resolve(s.id, id, v.outcome, v.note, v.refundCentimes);
    await this.ops.auditNote(s, `dispute.${v.outcome}`, d.bookingId, v.note, { disputeId: id, refundCentimes: d.refundCentimes ?? 0 });
    return d;
  }
}
