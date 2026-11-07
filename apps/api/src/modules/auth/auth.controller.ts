import { Body, Controller, Inject, Post, Req, HttpCode } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";

const reqSchema = z.object({ phone: z.string().min(8).max(20) });
const verSchema = z.object({ phone: z.string().min(8).max(20), code: z.string().regex(/^\d{6}$/) });

@Controller("v1/auth")
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  @Post("otp/request") @HttpCode(200) request(@Body() b: unknown, @Req() req: { ip?: string }) { return this.auth.requestOtp(reqSchema.parse(b).phone, req.ip); }
  @Post("otp/verify") @HttpCode(200) verify(@Body() b: unknown) { const v = verSchema.parse(b); return this.auth.verifyOtp(v.phone, v.code); }
}
