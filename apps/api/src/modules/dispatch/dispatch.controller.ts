import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { DispatchService, type ProviderPort } from "./dispatch.service";
import type { PresenceStore } from "./presence";

const reqSchema = z.object({ lat: z.number().min(20).max(36.5), lng: z.number().min(-17.5).max(-0.5), categoryId: z.string().min(2), totalCentimes: z.number().int().min(0).max(10_000_000), paymentMethod: z.enum(["cash", "card", "wallet"]).default("cash") });
const presSchema = z.object({ online: z.boolean(), lat: z.number().min(20).max(36.5).optional(), lng: z.number().min(-17.5).max(-0.5).optional() });

@Controller("v1")
export class DispatchController {
  constructor(@Inject(DispatchService) private d: DispatchService, @Inject(AuthService) private auth: AuthService, @Inject("PRESENCE") private presence: PresenceStore, @Inject("PROVIDER_PORT") private providers: ProviderPort) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }

  @Post("dispatch-requests") async request(@Headers("authorization") h: string, @Body() b: unknown) { return this.d.request(await this.uid(h), reqSchema.parse(b)); }
  @Get("dispatch-offers/pending") async pending(@Headers("authorization") h: string) { return this.d.pending(await this.uid(h)); }
  @Post("dispatch-offers/:id/accept") async accept(@Headers("authorization") h: string, @Param("id") id: string) { return this.d.accept(await this.uid(h), id); }
  @Post("dispatch-offers/:id/reject") @HttpCode(200) async reject(@Headers("authorization") h: string, @Param("id") id: string) { return this.d.reject(await this.uid(h), id); }

  /** Providers heartbeat their position while online (every ~15 s). Only active providers can appear on the dispatch map. */
  @Post("provider/presence") @HttpCode(200) async setPresence(@Headers("authorization") h: string, @Body() b: unknown) {
    const id = await this.uid(h), v = presSchema.parse(b);
    const p = await this.providers.profile(id); if (!p || p.status !== "active") throw new ForbiddenException("only verified providers can go online");
    if (!v.online) { await this.presence.offline(id); return { online: false }; }
    if (v.lat === undefined || v.lng === undefined) throw new ForbiddenException("location required to go online");
    await this.presence.heartbeat(id, v.lat, v.lng); return { online: true };
  }
}
