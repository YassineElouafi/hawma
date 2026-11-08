import { Body, Controller, Get, Headers, Inject, Param, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "./bookings.service";
import { COMMANDS, type Command } from "../../domain/booking";

const createSchema = z.object({
  mode: z.enum(["catalogue", "dispatch", "quote"]),
  providerId: z.string().uuid().optional(),
  totalCentimes: z.number().int().min(0).max(10_000_000),
  paymentMethod: z.enum(["cash", "card", "wallet"]).default("cash"),
});

@Controller("v1/bookings")
export class BookingsController {
  constructor(@Inject(BookingsService) private svc: BookingsService, @Inject(AuthService) private auth: AuthService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }

  @Post() async create(@Headers("authorization") h: string, @Body() b: unknown) { return this.svc.create(await this.uid(h), createSchema.parse(b)); }
  @Get() async list(@Headers("authorization") h: string) { return this.svc.list(await this.uid(h)); }
  @Get(":id") async get(@Headers("authorization") h: string, @Param("id") id: string) { return this.svc.get(id, await this.uid(h)); }
  @Post(":id/:command") async cmd(@Headers("authorization") h: string, @Param("id") id: string, @Param("command") c: string) {
    const command = z.enum(COMMANDS).parse(c.replace(/-/g, "_")) as Command;
    return this.svc.command(id, command, await this.uid(h));
  }
}
