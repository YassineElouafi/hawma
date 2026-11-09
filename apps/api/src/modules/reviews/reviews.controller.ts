import { Body, Controller, Get, Headers, Inject, Param, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { ReviewsService } from "./reviews.service";

const schema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });

@Controller("v1")
export class ReviewsController {
  constructor(@Inject(ReviewsService) private svc: ReviewsService, @Inject(AuthService) private auth: AuthService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }
  @Post("bookings/:id/reviews") async rate(@Headers("authorization") h: string, @Param("id") id: string, @Body() b: unknown) { const v = schema.parse(b); return this.svc.rate(await this.uid(h), id, v.rating, v.comment); }
  @Get("bookings/:id/reviews") async forBooking(@Headers("authorization") h: string, @Param("id") id: string) { await this.uid(h); return this.svc.forBooking(id); }
  @Get("providers/:id/reviews") forProvider(@Param("id") id: string) { return this.svc.forProvider(id); }
}
