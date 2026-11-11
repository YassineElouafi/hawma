import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ZodFilter } from "./zod.filter";
import { attachGateway } from "./realtime/gateway";
import { MemoryBus, RedisBus } from "./realtime/bus";
import { AuthService } from "./modules/auth/auth.service";
import { LedgerService } from "./modules/ledger/ledger.service";
import { BusPublisher } from "./realtime/outbox-publisher";
import { relayOutbox } from "./modules/bookings/outbox.relay";
import { db } from "./app.module";
import { DispatchService } from "./modules/dispatch/dispatch.service";
import { BookingsService, bookingAccess } from "./modules/bookings/bookings.service";
import Redis from "ioredis";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgStaffRepo } from "./modules/ops/pg-staff.repo";
import { configProblems, registerHardening } from "./hardening";

export async function createApp(opts: { hardening?: boolean } = {}) {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true, bodyLimit: 5_000_000 }), { logger: ["error", "warn"], bodyParser: false });
  app.useGlobalFilters(new ZodFilter());
  // Clients commonly send "content-type: application/json" with an empty body on command endpoints (accept, cancel…).
  // Fastify rejects that by default (400), so treat an empty body as "no body".
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (_req: unknown, body: string, done: (e: Error | null, v?: unknown) => void) => {
    if (!body) return done(null, undefined);
    try { done(null, JSON.parse(body)); } catch (e) { (e as Error & { statusCode?: number }).statusCode = 400; done(e as Error); }
  });
  if (opts.hardening !== false) await registerHardening(app, { db: db ?? undefined, redis: process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : undefined });
  return app;
}

/** Attach the WebSocket gateway at /ws on the same HTTP server. Redis pub/sub when REDIS_URL is set (multi-instance fan-out). */
export function startRealtime(app: NestFastifyApplication) {
  const auth = app.get(AuthService), bookings = app.get(BookingsService);
  const bus = app.get("BUS") as import("./realtime/bus").Bus;
  const repo = bookings.repo;
  return attachGateway(app.getHttpServer(), {
    bus, authenticate: (t) => auth.verify(t),
    canSubscribe: async (u, ch) => { const [kind, id] = ch.split(":"); if (kind === "user") return id === u; if (kind === "booking") return (await bookingAccess(repo, id, u)).participant; return false; },
    canPublishLocation: async (u, b) => (await bookingAccess(repo, b, u)).canShareLocation,
  });
}

/** Delivers booking events to connected clients: Postgres outbox relay (durable, multi-instance safe) or a direct hook in memory mode. */
export function startEventDelivery(app: NestFastifyApplication) {
  const bus = app.get("BUS") as import("./realtime/bus").Bus; const bookings = app.get(BookingsService);
  const parties = async (id: string) => { const b = await bookings.repo.get(id); return [b?.customerId, b?.providerId].filter((x): x is string => !!x); };
  if (!db) { bookings.afterEvent = (b, e) => {
      if (e.type === "booking.confirmed") void app.get(LedgerService).settleBooking(b.id).catch(() => {}); const msg = { bookingId: b.id, ...e }; void bus.publish(`booking:${b.id}`, msg); for (const u of [b.customerId, b.providerId]) if (u) void bus.publish(`user:${u}`, msg); }; return () => {}; }
  const ledger = app.get(LedgerService);
  const bus_ = new BusPublisher(bus, parties);
  const pub = { async publish(type: string, eventId: string, payload: unknown) {
    await bus_.publish(type, eventId, payload);
    if (type === "booking.confirmed") await ledger.settleBooking((payload as { bookingId: string }).bookingId); // idempotent; a failure rolls the relay batch back and retries
  } };
  let busy = false;
  const pgdb = db; const timer = setInterval(async () => { if (busy) return; busy = true; try { while ((await relayOutbox(pgdb, pub)) > 0); } catch (e) { console.warn("outbox relay failed", (e as Error).message); } finally { busy = false; } }, 1000);
  return () => clearInterval(timer);
}

/** Optional first-run admin: set BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD (>=12 chars), start once, then REMOVE the variables. Idempotent. */
async function bootstrapAdmin() {
  const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: pw, DATABASE_URL: url } = process.env;
  if (!email || !pw || !url || process.env.HAWMA_STORE !== "postgres") return;
  const sql = postgres(url, { max: 1 });
  try { const r = await new PgStaffRepo(drizzle(sql)).upsert(email, pw, ["admin"]); console.log(`bootstrap admin ready: ${r.email}`); } finally { await sql.end(); }
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const problems = configProblems(process.env);
  if (problems.length) { console.error(`Refusing to start — configuration problems:\n - ${problems.join("\n - ")}`); process.exit(1); }
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
  startRealtime(app);
  startEventDelivery(app);
  const dispatch = app.get(DispatchService); setInterval(() => dispatch.tick().catch((e) => console.warn("dispatch tick failed", e)), 3000);
  await bootstrapAdmin();
  console.log(`hawma-api listening on ${process.env.PORT ?? 3001}`);
}
