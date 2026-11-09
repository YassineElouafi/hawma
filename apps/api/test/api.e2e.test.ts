import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/main";
import { OVERRIDES } from "../src/app.module";

let app: NestFastifyApplication;
beforeAll(async () => { app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
afterAll(async () => { await app.close(); });

const post = (url: string, payload?: unknown, token?: string) =>
  app.inject({ method: "POST", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function login(phone: string) {
  expect((await post("/v1/auth/otp/request", { phone })).statusCode).toBe(200);
  const code = OVERRIDES.otpSender.last.get(phone.replace(/^0/, "+212"))!;
  const r = await post("/v1/auth/otp/verify", { phone, code });
  expect(r.statusCode).toBe(200);
  return r.json() as { userId: string; accessToken: string };
}

describe("API", () => {
  it("health", async () => { expect((await app.inject({ url: "/healthz" })).json().status).toBe("ok"); });

  it("OTP: rejects bad numbers, wrong codes, and rate-limits", async () => {
    expect((await post("/v1/auth/otp/request", { phone: "12345678" })).statusCode).toBe(400);
    await post("/v1/auth/otp/request", { phone: "0611111111" });
    expect((await post("/v1/auth/otp/verify", { phone: "0611111111", code: "000000" })).statusCode).toBe(401);
    expect((await post("/v1/auth/otp/verify", { phone: "0611111111", code: "abc" })).headers["content-type"]).toContain("problem+json");
    for (let i = 0; i < 2; i++) await post("/v1/auth/otp/request", { phone: "0622222222" });
    await post("/v1/auth/otp/request", { phone: "0622222222" });
    expect((await post("/v1/auth/otp/request", { phone: "0622222222" })).statusCode).toBe(429);
  });

  it("OTP code is single-use", async () => {
    const phone = "0633333333";
    await post("/v1/auth/otp/request", { phone });
    const code = OVERRIDES.otpSender.last.get("+212633333333")!;
    expect((await post("/v1/auth/otp/verify", { phone, code })).statusCode).toBe(200);
    expect((await post("/v1/auth/otp/verify", { phone, code })).statusCode).toBe(401);
  });

  it("requires a token and a participant", async () => {
    expect((await post("/v1/bookings", { mode: "dispatch", totalCentimes: 5000 })).statusCode).toBe(401);
    const c = await login("0644444444"), stranger = await login("0655555555");
    const b = (await post("/v1/bookings", { mode: "dispatch", totalCentimes: 5000 }, c.accessToken)).json();
    expect((await app.inject({ url: `/v1/bookings/${b.id}`, headers: { authorization: `Bearer ${stranger.accessToken}` } })).statusCode).toBe(403);
  });

  it("full dispatch booking lifecycle over HTTP", async () => {
    const customer = await login("0661111111"), provider = await login("0662222222");
    const created = (await post("/v1/bookings", { mode: "dispatch", totalCentimes: 20000, paymentMethod: "cash" }, customer.accessToken)).json();
    expect(created).toMatchObject({ state: "Requested", feeCentimes: 3000 });

    // customer cannot accept their own job
    expect((await post(`/v1/bookings/${created.id}/accept`, undefined, customer.accessToken)).statusCode).toBe(422);

    const t = provider.accessToken;
    let b = (await post(`/v1/bookings/${created.id}/accept`, undefined, t)).json();
    expect(b).toMatchObject({ state: "Accepted", providerId: provider.userId });
    for (const [cmd, state] of [["start-trip", "EnRoute"], ["arrive", "Arrived"], ["start-job", "InProgress"], ["complete", "Completed"]] as const) {
      b = (await post(`/v1/bookings/${created.id}/${cmd}`, undefined, t)).json();
      expect(b.state).toBe(state);
    }
    expect((await post(`/v1/bookings/${created.id}/confirm`, undefined, t)).statusCode).toBe(422); // provider cannot confirm
    b = (await post(`/v1/bookings/${created.id}/confirm`, undefined, customer.accessToken)).json();
    expect(b.state).toBe("Confirmed");
    expect(b.events.map((e: { type: string }) => e.type)).toEqual(["booking.accepted", "booking.enroute", "booking.arrived", "booking.inprogress", "booking.completed", "booking.confirmed"]);
  });

  it("second provider cannot claim an already accepted dispatch job", async () => {
    const customer = await login("0671111111"), p1 = await login("0672222222"), p2 = await login("0673333333");
    const b = (await post("/v1/bookings", { mode: "dispatch", totalCentimes: 3000 }, customer.accessToken)).json();
    expect((await post(`/v1/bookings/${b.id}/accept`, undefined, p1.accessToken)).statusCode).toBe(201);
    expect((await post(`/v1/bookings/${b.id}/accept`, undefined, p2.accessToken)).statusCode).toBe(403);
  });

  it("validates input", async () => {
    const c = await login("0681111111");
    expect((await post("/v1/bookings", { mode: "catalogue", totalCentimes: 100 }, c.accessToken)).statusCode).toBe(422);
    expect((await post("/v1/bookings", { mode: "nope", totalCentimes: -1 }, c.accessToken)).statusCode).toBe(400);
  });
});

describe("catalogue over HTTP", () => {
  it("provider publishes, customer searches and reads slots", async () => {
    const provider = await login("0691111111"), customer = await login("0692222222");
    OVERRIDES.catalogueRepo.stats.set(provider.userId, { rating: 4.8, jobs: 25, tier: 1, cancelRate: 0, responseMin: 5, status: "active" });
    const body = { categoryId: "tutoring", title: "Maths lycée", lat: 33.5883, lng: -7.635, basePriceCentimes: 10000, pricingModel: "hourly" };
    expect((await post("/v1/offers", body)).statusCode).toBe(401);
    expect((await post("/v1/offers", { ...body, categoryId: "cleaning" }, provider.accessToken)).statusCode).toBe(403); // needs tier 2
    const offer = (await post("/v1/offers", body, provider.accessToken)).json();
    expect(offer.id).toBeTruthy();
    expect((await app.inject({ method: "PUT", url: "/v1/me/availability", payload: { rules: [{ weekday: 2, startMin: 540, endMin: 660 }] }, headers: { authorization: `Bearer ${provider.accessToken}` } })).statusCode).toBe(204);
    const res = await app.inject({ url: "/v1/search?lat=33.59&lng=-7.63&radiusM=4000&q=maths", headers: { authorization: `Bearer ${customer.accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((x: { id: string }) => x.id)).toContain(offer.id);
    const slots = await app.inject({ url: `/v1/offers/${offer.id}/slots?from=2026-11-10&days=1&durationMin=60` });
    expect(slots.json().map((x: { startMin: number }) => x.startMin)).toEqual([540, 570, 600]);
    expect((await app.inject({ url: "/v1/search?lat=abc&lng=-7.63" })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: `/v1/offers/${offer.id}`, headers: { authorization: `Bearer ${customer.accessToken}` } })).statusCode).toBe(403);
  });
});

describe("refresh tokens", () => {
  it("rotate once; replay and garbage are rejected; pilot debug code is opt-in", async () => {
    const phone = "0698765432";
    const req = await post("/v1/auth/otp/request", { phone });
    expect(req.json().devCode).toBeUndefined();
    const code = OVERRIDES.otpSender.last.get("+212698765432")!;
    const first = (await post("/v1/auth/otp/verify", { phone, code })).json();
    expect(first.refreshToken).toBeTruthy();
    const second = await post("/v1/auth/refresh", { refreshToken: first.refreshToken });
    expect(second.statusCode).toBe(200);
    expect(second.json().userId).toBe(first.userId);
    expect(second.json().refreshToken).not.toBe(first.refreshToken);
    expect((await post("/v1/auth/refresh", { refreshToken: first.refreshToken })).statusCode).toBe(401); // replay
    expect((await post("/v1/auth/refresh", { refreshToken: "x".repeat(30) })).statusCode).toBe(401);
  });
  it("devCode is returned only when OTP_DEBUG_RETURN_CODE=true", async () => {
    process.env.OTP_DEBUG_RETURN_CODE = "true";
    const r = await post("/v1/auth/otp/request", { phone: "0687654321" });
    delete process.env.OTP_DEBUG_RETURN_CODE;
    expect(r.json().devCode).toMatch(/^\d{6}$/);
  });
});

describe("provider mode API", () => {
  it("provider sees own offers and profile; incoming request accepted via the same booking commands", async () => {
    const provider = await login("0601112233"), customer = await login("0602223344");
    const h = (t: string) => ({ authorization: `Bearer ${t}` });
    expect((await app.inject({ url: "/v1/me/provider", headers: h(provider.accessToken) })).json()).toMatchObject({ tier: 0, status: "none" });
    OVERRIDES.catalogueRepo.stats.set(provider.userId, { rating: 0, jobs: 0, tier: 1, cancelRate: 0, responseMin: 10, status: "active" });
    const offer = (await post("/v1/offers", { categoryId: "tutoring", title: "Cours de maths", lat: 33.58, lng: -7.63, basePriceCentimes: 8000 }, provider.accessToken)).json();
    expect((await app.inject({ url: "/v1/offers/mine", headers: h(provider.accessToken) })).json().map((o: { id: string }) => o.id)).toEqual([offer.id]);
    expect((await app.inject({ url: "/v1/offers/mine", headers: h(customer.accessToken) })).json()).toEqual([]);
    const b = (await post("/v1/bookings", { mode: "catalogue", providerId: provider.userId, totalCentimes: 8000 }, customer.accessToken)).json();
    const mine = (await app.inject({ url: "/v1/bookings", headers: h(provider.accessToken) })).json();
    expect(mine.map((x: { id: string }) => x.id)).toContain(b.id);                 // the request shows up for the provider
    expect((await post(`/v1/bookings/${b.id}/accept`, undefined, provider.accessToken)).json().state).toBe("Accepted");
    expect((await post(`/v1/bookings/${b.id}/cancel`, undefined, customer.accessToken)).json().state).toBe("Cancelled"); // customer can still cancel
  });
});
