import { Body, Controller, Get, Headers, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { OpsService } from "./ops.service";

const schema = z.object({ tier: z.number().int().min(1).max(3), documents: z.array(z.enum(["cin_front", "cin_back", "selfie", "address_proof", "criminal_record", "trade_licence", "insurance"])).min(1).max(7) });

/** Provider-facing verification application (document upload itself comes with the object-storage step). */
@Controller("v1/verifications")
export class VerificationController {
  constructor(@Inject(AuthService) private auth: AuthService, @Inject(OpsService) private ops: OpsService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }
  @Post() async submit(@Headers("authorization") h: string, @Body() b: unknown) { const v = schema.parse(b); return this.ops.submitVerification(await this.uid(h), v.tier, v.documents); }
  @Get("mine") async mine(@Headers("authorization") h: string) { return this.ops.myVerifications(await this.uid(h)); }
}
