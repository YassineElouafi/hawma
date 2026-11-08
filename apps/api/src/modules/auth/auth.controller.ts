import { Body, Controller, Get, Headers, Inject, Post, Req, HttpCode, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";

const reqSchema = z.object({ phone: z.string().min(8).max(20) });
const verSchema = z.object({ phone: z.string().min(8).max(20), code: z.string().regex(/^\d{6}$/) });

const refSchema = z.object({ refreshToken: z.string().min(20).max(200) });

@Controller("v1")
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  @Get("me") async me(@Headers("authorization") h: string) {
    if (!h?.startsWith("Bearer ")) throw new UnauthorizedException();
    const id = await this.auth.verify(h.slice(7)); const u = await this.auth.users.byId(id);
    if (!u) throw new UnauthorizedException();
    return { id: u.id, phone: u.phone, displayName: u.displayName, locale: u.locale };
  }
  @Post("auth/otp/request") @HttpCode(200) request(@Body() b: unknown, @Req() req: { ip?: string }) { return this.auth.requestOtp(reqSchema.parse(b).phone, req.ip); }
  @Post("auth/refresh") @HttpCode(200) refresh(@Body() b: unknown) { return this.auth.refresh(refSchema.parse(b).refreshToken); }
  @Post("auth/otp/verify") @HttpCode(200) verify(@Body() b: unknown) { const v = verSchema.parse(b); return this.auth.verifyOtp(v.phone, v.code); }
}
