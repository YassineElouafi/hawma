import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createHash, randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Redis } from "ioredis";
import { collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

const DEV_JWT = "dev-only-secret-change-me-32-bytes-min!!", DEV_OPS = "dev-only-ops-secret-change-me-32-bytes!!!";

/** Refuse to boot in production with development secrets or missing configuration. Pure so it can be unit-tested. */
export function configProblems(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== "production") return [];
  const p: string[] = [];
  const secret = (name: string, dev: string) => { const v = env[name]; if (!v) p.push(`${name} is not set`); else if (v === dev) p.push(`${name} is the development default`); else if (v.length < 32) p.push(`${name} must be at least 32 characters`); };
  secret("JWT_SECRET", DEV_JWT); secret("OPS_JWT_SECRET", DEV_OPS);
  if (env.JWT_SECRET && env.JWT_SECRET === env.OPS_JWT_SECRET) p.push("JWT_SECRET and OPS_JWT_SECRET must differ (customer tokens must never be valid for ops)");
  try { if (Buffer.from(env.KYC_ENC_KEY ?? "", "base64").length !== 32) p.push("KYC_ENC_KEY must be 32 bytes, base64-encoded"); } catch { p.push("KYC_ENC_KEY is invalid"); }
  if (env.HAWMA_STORE !== "postgres") p.push("HAWMA_STORE must be 'postgres' in production (in-memory stores lose data)");
  if (env.HAWMA_STORE === "postgres" && !env.DATABASE_URL) p.push("DATABASE_URL is not set");
  if (!env.REDIS_URL) p.push("REDIS_URL is not set (OTP limits and presence need Redis)");
  return p;
}

export interface Deps { db?: PostgresJsDatabase; redis?: Redis }

/** Security headers, rate limits, request ids, JSON access logs, /readyz and /metrics. */
export async function registerHardening(app: NestFastifyApplication, deps: Deps = {}, env: NodeJS.ProcessEnv = process.env) {
  const f = app.getHttpAdapter().getInstance();
  await f.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  if (!env.VITEST || env.RATE_LIMIT_MAX) {
    await f.register(rateLimit, {
      // Authenticated clients are limited per token (mobile carriers put many users behind one IP); anonymous traffic per IP.
      max: ((req: { headers: Record<string, string | undefined> }) => (req.headers.authorization ? Number(env.RATE_LIMIT_MAX ?? 1200) : Number(env.RATE_LIMIT_UNAUTH_MAX ?? 300))) as unknown as number, timeWindow: "1 minute", ...(deps.redis ? { redis: deps.redis } : {}),
      keyGenerator: (req: any) => (req.headers.authorization ? "t:" + createHash("sha1").update(req.headers.authorization).digest("hex").slice(0, 16) : "ip:" + req.ip),
      errorResponseBuilder: (_r: unknown, ctx: { after: string }) => Object.assign(new Error(`Too many requests, retry in ${ctx.after}`), { statusCode: 429 }),
    });
  }

  const registry = new Registry(); collectDefaultMetrics({ register: registry });
  const http = new Histogram({ name: "http_request_duration_seconds", help: "HTTP request duration", labelNames: ["method", "route", "status"], buckets: [0.005, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [registry] });
  if (deps.db) {
    const db = deps.db;
    new Gauge({ name: "outbox_unpublished_events", help: "Outbox rows not yet delivered (should hover near 0)", registers: [registry], async collect() { const r = await db.execute<{ n: number }>(sql`select count(*)::int n from platform.outbox where published_at is null`); this.set(Number([...r][0]?.n ?? 0)); } });
    new Gauge({ name: "dispatch_open_offers", help: "Dispatch offers awaiting an answer", registers: [registry], async collect() { const r = await db.execute<{ n: number }>(sql`select count(*)::int n from booking.dispatch_offer where status = 'offered'`); this.set(Number([...r][0]?.n ?? 0)); } });
    new Gauge({ name: "dispatch_waiting_requests", help: "Dispatch bookings queued for a provider", registers: [registry], async collect() { const r = await db.execute<{ n: number }>(sql`select count(*)::int n from booking.booking where mode = 'dispatch' and state = 'Requested'`); this.set(Number([...r][0]?.n ?? 0)); } });
  }

  f.addHook("onRequest", async (req: any, reply: any) => { req.startedAt = process.hrtime.bigint(); const id = String(req.headers["x-request-id"] ?? "").slice(0, 64) || randomUUID(); req.reqId = id; reply.header("x-request-id", id); });
  f.addHook("onResponse", async (req: any, reply: any) => {
    const ms = Number(process.hrtime.bigint() - req.startedAt) / 1e6; const route = req.routeOptions?.url ?? "unmatched"; const status = reply.statusCode;
    http.labels(req.method, route, String(status)).observe(ms / 1000);
    if (route !== "/healthz" && route !== "/readyz" && route !== "/metrics" && !env.VITEST) console.log(JSON.stringify({ t: new Date().toISOString(), level: status >= 500 ? "error" : "info", reqId: req.reqId, method: req.method, route, status, ms: Math.round(ms * 10) / 10, ip: req.ip }));
  });

  f.get("/readyz", async (_req: unknown, reply: any) => {
    const checks: Record<string, string> = {};
    if (deps.db) { try { await deps.db.execute(sql`select 1`); checks.postgres = "ok"; } catch (e) { checks.postgres = `fail: ${(e as Error).message.slice(0, 80)}`; } }
    if (deps.redis) { try { await deps.redis.ping(); checks.redis = "ok"; } catch (e) { checks.redis = `fail: ${(e as Error).message.slice(0, 80)}`; } }
    const ok = Object.values(checks).every((v) => v === "ok"); return reply.code(ok ? 200 : 503).send({ status: ok ? "ready" : "degraded", checks });
  });
  f.get("/metrics", async (req: any, reply: any) => {
    const token = env.METRICS_TOKEN; if (!token) return reply.code(404).send();                                   // disabled unless a token is configured
    if (req.headers.authorization !== `Bearer ${token}`) return reply.code(401).send();
    return reply.header("content-type", registry.contentType).send(await registry.metrics());
  });
  return registry;
}
