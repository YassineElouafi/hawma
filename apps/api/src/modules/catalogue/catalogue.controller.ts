import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, Put, Query, UnauthorizedException, HttpCode } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { CatalogueService } from "./catalogue.service";

const offerSchema = z.object({
  categoryId: z.string().min(2), title: z.string().min(3).max(120), description: z.string().max(2000).optional(),
  lat: z.number().min(20).max(36.5), lng: z.number().min(-17.5).max(-0.5), radiusM: z.number().int().min(300).max(50_000).default(5000),
  basePriceCentimes: z.number().int().min(0).max(10_000_000), pricingModel: z.enum(["fixed", "hourly", "quote"]).default("fixed"), recurringAllowed: z.boolean().default(false),
});
const searchSchema = z.object({
  lat: z.coerce.number().min(20).max(36.5), lng: z.coerce.number().min(-17.5).max(-0.5), radiusM: z.coerce.number().int().min(300).max(50_000).default(5000),
  categoryId: z.string().optional(), q: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
});
const slotsSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.coerce.number().int().min(1).max(31).default(7), durationMin: z.coerce.number().int().min(15).max(720).default(60) });
const rulesSchema = z.object({ rules: z.array(z.object({ weekday: z.number().int(), startMin: z.number().int(), endMin: z.number().int() })).max(50) });

@Controller("v1")
export class CatalogueController {
  constructor(@Inject(CatalogueService) private svc: CatalogueService, @Inject(AuthService) private auth: AuthService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }

  @Post("offers") async publish(@Headers("authorization") h: string, @Body() b: unknown) { return this.svc.publish(await this.uid(h), offerSchema.parse(b)); }
  @Delete("offers/:id") @HttpCode(204) async remove(@Headers("authorization") h: string, @Param("id") id: string) { await this.svc.deactivate(await this.uid(h), id); }
  @Get("offers/mine") async mine(@Headers("authorization") h: string) { return this.svc.offersOf(await this.uid(h)); }
  @Get("me/provider") async provider(@Headers("authorization") h: string) { return this.svc.providerSummary(await this.uid(h)); }
  @Get("search") search(@Query() q: unknown) { return this.svc.search(searchSchema.parse(q), new Date().toISOString().slice(0, 10)); }
  @Get("offers/:id/slots") slots(@Param("id") id: string, @Query() q: unknown) { const v = slotsSchema.parse(q); return this.svc.slots(id, v.from, v.days, v.durationMin); }
  @Put("me/availability") @HttpCode(204) async availability(@Headers("authorization") h: string, @Body() b: unknown) { await this.svc.setAvailability(await this.uid(h), rulesSchema.parse(b).rules); }
}
