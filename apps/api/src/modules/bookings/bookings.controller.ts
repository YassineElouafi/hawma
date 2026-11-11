import { Body, ConflictException, Controller, Get, Headers, Inject, Param, Post, UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "./bookings.service";
import { CatalogueService } from "../catalogue/catalogue.service";
import { COMMANDS, type Command } from "../../domain/booking";

const createSchema = z.object({
  mode: z.enum(["catalogue", "dispatch", "quote"]),
  providerId: z.string().uuid().optional(),
  offerId: z.string().uuid().optional(),
  slot: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMin: z.number().int().min(0).max(1439) }).optional(),
  durationMin: z.number().int().min(15).max(720).optional(),
  totalCentimes: z.number().int().min(0).max(10_000_000).default(0),
  paymentMethod: z.enum(["cash", "card", "wallet"]).default("cash"),
});

@Controller("v1/bookings")
export class BookingsController {
  constructor(@Inject(BookingsService) private svc: BookingsService, @Inject(AuthService) private auth: AuthService, @Inject(CatalogueService) private catalogue: CatalogueService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }

  @Post() async create(@Headers("authorization") h: string, @Body() b: unknown) {
    const uid = await this.uid(h); const v = createSchema.parse(b);
    if (!v.offerId) return this.svc.create(uid, v);
    // Booking a catalogue offer for a time slot: price, provider and category come from the offer, never from the client.
    const offer = await this.catalogue.offer(v.offerId);
    if (offer.providerId === uid) throw new UnprocessableEntityException("you cannot book your own offer");
    if (offer.pricingModel === "quote") throw new UnprocessableEntityException("this offer is priced on request");
    if (!v.slot || !v.durationMin) throw new UnprocessableEntityException("choose a time slot and duration");
    const free = await this.catalogue.slots(v.offerId, v.slot.date, 1, v.durationMin);
    if (!free.some((s) => s.startMin === v.slot!.startMin)) throw new ConflictException("that time slot is not available");
    const total = offer.pricingModel === "hourly" ? Math.round((offer.basePriceCentimes * v.durationMin) / 60) : offer.basePriceCentimes;
    return this.svc.create(uid, { mode: "catalogue", providerId: offer.providerId, offerId: offer.id, categoryId: offer.categoryId, slot: v.slot, durationMin: v.durationMin, totalCentimes: total, paymentMethod: v.paymentMethod, lat: offer.lat, lng: offer.lng });
  }
  /** Move a booking to another free slot (same duration). Availability is re-validated server-side. */
  @Post(":id/reschedule") async reschedule(@Headers("authorization") h: string, @Param("id") id: string, @Body() body: unknown) {
    const uid = await this.uid(h); const slot = z.object({ slot: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMin: z.number().int().min(0).max(1439) }) }).parse(body).slot;
    const b = await this.svc.get(id, uid);
    if (b.customerId !== uid) throw new UnprocessableEntityException("only the customer can reschedule");
    if (!b.offerId || !b.durationMin) throw new UnprocessableEntityException("this booking has no scheduled time");
    const free = await this.catalogue.slots(b.offerId, slot.date, 1, b.durationMin);
    if (!free.some((s) => s.startMin === slot.startMin)) throw new ConflictException("that time slot is not available");
    return this.svc.reschedule(id, uid, slot);
  }
  @Get() async list(@Headers("authorization") h: string) { return this.svc.list(await this.uid(h)); }
  /** Who is coming? Public-safe summary of the assigned provider, visible to the booking's participants only (no phone number). */
  @Get(":id/provider") async provider(@Headers("authorization") h: string, @Param("id") id: string) {
    const uid = await this.uid(h); const b = await this.svc.get(id, uid);   // throws 403/404 for non-participants
    if (!b.providerId) return null;
    const [sum, user] = await Promise.all([this.catalogue.providerSummary(b.providerId), this.auth.users.byId(b.providerId)]);
    return { id: b.providerId, name: user?.displayName ?? null, rating: sum.rating, jobs: sum.jobs, tier: sum.tier };
  }
  @Get(":id") async get(@Headers("authorization") h: string, @Param("id") id: string) { return this.svc.get(id, await this.uid(h)); }
  @Post(":id/:command") async cmd(@Headers("authorization") h: string, @Param("id") id: string, @Param("command") c: string) {
    const command = z.enum(COMMANDS).parse(c.replace(/-/g, "_")) as Command;
    return this.svc.command(id, command, await this.uid(h));
  }
}
