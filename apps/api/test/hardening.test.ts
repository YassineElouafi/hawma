import "reflect-metadata";
import { afterAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { configProblems, registerHardening } from "../src/hardening";

const good = { NODE_ENV: "production", JWT_SECRET: "j".repeat(40), OPS_JWT_SECRET: "o".repeat(40), KYC_ENC_KEY: Buffer.alloc(32, 1).toString("base64"), HAWMA_STORE: "postgres", DATABASE_URL: "postgres://x", REDIS_URL: "redis://x" } as NodeJS.ProcessEnv;

describe("production config guard", () => {
  it("accepts a complete configuration and ignores non-production", () => { expect(configProblems(good)).toEqual([]); expect(configProblems({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toEqual([]); });
  it("flags every dangerous gap", () => {
    expect(configProblems({ NODE_ENV: "production" } as NodeJS.ProcessEnv).length).toBeGreaterThanOrEqual(5);
    expect(configProblems({ ...good, JWT_SECRET: "dev-only-secret-change-me-32-bytes-min!!" }).join()).toMatch(/JWT_SECRET is the development default/);
    expect(configProblems({ ...good, OPS_JWT_SECRET: good.JWT_SECRET }).join()).toMatch(/must differ/);
    expect(configProblems({ ...good, JWT_SECRET: "short" }).join()).toMatch(/at least 32/);
    expect(configProblems({ ...good, KYC_ENC_KEY: "abc" }).join()).toMatch(/32 bytes/);
    expect(configProblems({ ...good, HAWMA_STORE: undefined }).join()).toMatch(/HAWMA_STORE/);
    expect(configProblems({ ...good, REDIS_URL: undefined }).join()).toMatch(/REDIS_URL/);
  });
});

let app: NestFastifyApplication;
describe("http hardening", () => {
  afterAll(async () => { await app?.close(); });
  it("adds security headers and a request id (echoes a client-supplied one)", async () => {
    app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
    const r = await app.inject({ url: "/healthz" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff"); expect(r.headers["x-frame-options"]).toBeTruthy(); expect(r.headers["strict-transport-security"]).toBeTruthy(); expect(r.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
    expect((await app.inject({ url: "/healthz", headers: { "x-request-id": "abc-123" } })).headers["x-request-id"]).toBe("abc-123");
  });
  it("/readyz reports healthy (no backing services in memory mode) and /metrics is off without a token", async () => {
    expect((await app.inject({ url: "/readyz" })).json()).toMatchObject({ status: "ready" });
    expect((await app.inject({ url: "/metrics" })).statusCode).toBe(404);
  });
  it("/metrics requires the bearer token when enabled and exposes request histograms", async () => {
    const env = { ...process.env, METRICS_TOKEN: "m-token-123456" } as NodeJS.ProcessEnv;
    const a2 = await createApp({ hardening: false }); await registerHardening(a2, {}, env); await a2.init(); await a2.getHttpAdapter().getInstance().ready();
    await a2.inject({ url: "/healthz" });
    expect((await a2.inject({ url: "/metrics" })).statusCode).toBe(401); expect((await a2.inject({ url: "/metrics", headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    const m = await a2.inject({ url: "/metrics", headers: { authorization: "Bearer m-token-123456" } });
    expect(m.statusCode).toBe(200); expect(m.body).toContain("http_request_duration_seconds_bucket"); expect(m.body).toContain('route="/healthz"'); expect(m.body).toContain("process_cpu_user_seconds_total");
    await a2.close();
  });
  it("rate limits per token and per IP independently, with a clean 429", async () => {
    const env = { ...process.env, RATE_LIMIT_MAX: "5", RATE_LIMIT_UNAUTH_MAX: "3" } as NodeJS.ProcessEnv;
    const a3 = await createApp({ hardening: false }); await registerHardening(a3, {}, env); await a3.init(); await a3.getHttpAdapter().getInstance().ready();
    const codes = async (h: Record<string, string>, n: number) => { const out: number[] = []; for (let i = 0; i < n; i++) out.push((await a3.inject({ url: "/healthz", headers: h })).statusCode); return out; };
    expect(await codes({}, 5)).toEqual([200, 200, 200, 429, 429]);                                   // anonymous: 3 per minute per IP
    expect(await codes({ authorization: "Bearer aaa" }, 7)).toEqual([200, 200, 200, 200, 200, 429, 429]);
    expect(await codes({ authorization: "Bearer bbb" }, 1)).toEqual([200]);                           // a different token has its own budget
    const r = await a3.inject({ url: "/healthz" }); expect(r.statusCode).toBe(429); expect(r.json()).toMatchObject({ status: 429 });
    await a3.close();
  });
});
