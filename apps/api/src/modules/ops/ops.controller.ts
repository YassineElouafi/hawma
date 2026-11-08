import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UnauthorizedException, HttpCode } from "@nestjs/common";
import { z } from "zod";
import { OpsService } from "./ops.service";
import { StaffService, type Staff } from "./staff.service";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
const decisionSchema = z.object({ reason: z.string().max(500).optional() });

@Controller("ops")
export class OpsController {
  constructor(@Inject(StaffService) private staff: StaffService, @Inject(OpsService) private ops: OpsService) {}
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
  @Get("audit") async audit(@Headers("authorization") h: string) { const s = await this.me(h); this.staff.require(s, "audit.read"); return this.ops.auditLog(); }
}
