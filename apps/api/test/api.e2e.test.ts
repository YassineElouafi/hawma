import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp, startEventDelivery } from "../src/main";
import { OVERRIDES } from "../src/app.module";

let app: NestFastifyApplication;
beforeAll(async () => { app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); startEventDelivery(app); });
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

describe("empty JSON bodies", () => {
  it("command endpoints accept content-type json with no body; malformed JSON is a clean 400", async () => {
    const c = await login("0613572468"), p = await login("0624681357");
    const b = (await post("/v1/bookings", { mode: "catalogue", providerId: p.userId, totalCentimes: 1000 }, c.accessToken)).json();
    const r = await app.inject({ method: "POST", url: `/v1/bookings/${b.id}/accept`, headers: { authorization: `Bearer ${p.accessToken}`, "content-type": "application/json" } });
    expect(r.statusCode).toBe(201); expect(r.json().state).toBe("Accepted");
    const bad = await app.inject({ method: "POST", url: "/v1/auth/otp/request", headers: { "content-type": "application/json" }, payload: "{not json" });
    expect(bad.statusCode).toBe(400);
  });
});

describe("reviews", () => {
  it("only participants, only after completion, once each; provider rating updates", async () => {
    const c = await login("0631231231"), p = await login("0632342342"), x = await login("0633453453");
    OVERRIDES.catalogueRepo.stats.set(p.userId, { rating: 0, jobs: 0, tier: 1, cancelRate: 0, responseMin: 10, status: "active" });
    const b = (await post("/v1/bookings", { mode: "catalogue", providerId: p.userId, totalCentimes: 5000 }, c.accessToken)).json();
    expect((await post(`/v1/bookings/${b.id}/reviews`, { rating: 5 }, c.accessToken)).statusCode).toBe(422);        // too early
    for (const cmd of ["accept", "start-trip", "arrive", "start-job", "complete"]) await post(`/v1/bookings/${b.id}/${cmd}`, undefined, p.accessToken);
    expect((await post(`/v1/bookings/${b.id}/reviews`, { rating: 5 }, x.accessToken)).statusCode).toBe(403);       // stranger
    expect((await post(`/v1/bookings/${b.id}/reviews`, { rating: 9 }, c.accessToken)).statusCode).toBe(400);       // out of range
    const r1 = await post(`/v1/bookings/${b.id}/reviews`, { rating: 4, comment: "Très pro" }, c.accessToken);
    expect(r1.statusCode).toBe(201); expect(r1.json()).toMatchObject({ subjectId: p.userId, rating: 4 });
    expect((await post(`/v1/bookings/${b.id}/reviews`, { rating: 5 }, c.accessToken)).statusCode).toBe(409);       // once per author
    expect((await post(`/v1/bookings/${b.id}/reviews`, { rating: 5 }, p.accessToken)).statusCode).toBe(201);       // provider reviews the customer
    expect(OVERRIDES.catalogueRepo.stats.get(p.userId)!.rating).toBe(4);
    const list = (await app.inject({ url: `/v1/providers/${p.userId}/reviews` })).json();
    expect(list).toHaveLength(1); expect(list[0].comment).toBe("Très pro");
  });
});

describe("dispatch over HTTP", () => {
  it("provider goes online, customer requests, provider accepts the offer", async () => {
    const c = await login("0651515151"), p = await login("0652525252"), q = await login("0653535353");
    OVERRIDES.catalogueRepo.stats.set(p.userId, { rating: 4.7, jobs: 5, tier: 1, cancelRate: 0, responseMin: 5, status: "active" });
    const near = { lat: 33.5883, lng: -7.635 };
    expect((await post("/v1/provider/presence", { online: true, ...near }, q.accessToken)).statusCode).toBe(403);   // not a provider
    expect((await post("/v1/provider/presence", { online: true, ...near }, p.accessToken)).statusCode).toBe(200);
    const b = await post("/v1/dispatch-requests", { ...near, categoryId: "errands", totalCentimes: 3500 }, c.accessToken); expect(b.statusCode).toBe(201);
    const pending = (await app.inject({ url: "/v1/dispatch-offers/pending", headers: { authorization: `Bearer ${p.accessToken}` } })).json();
    expect(pending).toHaveLength(1); expect(pending[0].bookingId).toBe(b.json().id);
    expect((await post(`/v1/dispatch-offers/${pending[0].id}/accept`, undefined, c.accessToken)).statusCode).toBe(403);   // not the offered provider
    const ok = await post(`/v1/dispatch-offers/${pending[0].id}/accept`, undefined, p.accessToken);
    expect(ok.statusCode).toBe(201); expect(ok.json()).toMatchObject({ state: "Accepted", providerId: p.userId });
    expect((await post("/v1/provider/presence", { online: false }, p.accessToken)).json()).toEqual({ online: false });
    expect((await post("/v1/dispatch-requests", { lat: 1, lng: 1, categoryId: "errands", totalCentimes: 1 }, c.accessToken)).statusCode).toBe(400); // outside Morocco
  });
});

describe("booking provider summary", () => {
  it("participants see rating/jobs, never the phone; strangers are refused; unassigned is null", async () => {
    const c = await login("0661919191"), p = await login("0662929292"), x = await login("0663939393");
    OVERRIDES.catalogueRepo.stats.set(p.userId, { rating: 4.6, jobs: 12, tier: 1, cancelRate: 0, responseMin: 5, status: "active" });
    const unassigned = (await post("/v1/bookings", { mode: "dispatch", totalCentimes: 1000 }, c.accessToken)).json();
    const h = (t: string) => ({ authorization: `Bearer ${t}` });
    expect((await app.inject({ url: `/v1/bookings/${unassigned.id}/provider`, headers: h(c.accessToken) })).json()).toBeNull();
    const b = (await post("/v1/bookings", { mode: "catalogue", providerId: p.userId, totalCentimes: 1000 }, c.accessToken)).json();
    const r = await app.inject({ url: `/v1/bookings/${b.id}/provider`, headers: h(c.accessToken) });
    expect(r.json()).toMatchObject({ id: p.userId, rating: 4.6, jobs: 12, tier: 1 }); expect(JSON.stringify(r.json())).not.toContain("+212");
    expect((await app.inject({ url: `/v1/bookings/${b.id}/provider`, headers: h(x.accessToken) })).statusCode).toBe(403);
  });
});

describe("money: wallet and finance after a confirmed cash job", () => {
  it("provider wallet and ops finance totals reflect the ledger", async () => {
    const c = await login("0671212121"), p = await login("0672323232");
    const b = (await post("/v1/bookings", { mode: "catalogue", providerId: p.userId, totalCentimes: 20000, paymentMethod: "cash" }, c.accessToken)).json();
    for (const cmd of ["accept", "start-trip", "arrive", "start-job", "complete"]) await post(`/v1/bookings/${b.id}/${cmd}`, undefined, p.accessToken);
    await post(`/v1/bookings/${b.id}/confirm`, undefined, c.accessToken);
    await new Promise((r) => setTimeout(r, 100));                        // memory-mode event hook is fire-and-forget
    const w = (await app.inject({ url: "/v1/me/wallet", headers: { authorization: `Bearer ${p.accessToken}` } })).json();
    expect(w).toMatchObject({ netEarningsCentimes: 17000, cashOwedCentimes: 3000 });
    expect((await app.inject({ url: "/v1/me/wallet", headers: { authorization: `Bearer ${c.accessToken}` } })).json()).toMatchObject({ netEarningsCentimes: 0, cashOwedCentimes: 0 });
    expect((await app.inject({ url: "/v1/me/wallet" })).statusCode).toBe(401);
  });
});

describe("scheduled catalogue bookings", () => {
  it("books a free slot at the server-computed price; conflicts, overlaps and invalid slots are refused", async () => {
    const prov = await login("0601717171"), c1 = await login("0602727272"), c2 = await login("0603737373");
    OVERRIDES.catalogueRepo.stats.set(prov.userId, { rating: 4.8, jobs: 10, tier: 1, cancelRate: 0, responseMin: 5, status: "active" });
    const offer = (await post("/v1/offers", { categoryId: "tutoring", title: "Maths", lat: 33.58, lng: -7.63, basePriceCentimes: 10000, pricingModel: "hourly" }, prov.accessToken)).json();
    await app.inject({ method: "PUT", url: "/v1/me/availability", payload: { rules: [{ weekday: 2, startMin: 540, endMin: 720 }] }, headers: { authorization: `Bearer ${prov.accessToken}` } });
    const book = (token: string, slot: object, extra: object = {}) => post("/v1/bookings", { mode: "catalogue", offerId: offer.id, slot, durationMin: 120, ...extra }, token);
    const day = "2026-11-17";                                                           // a Tuesday
    const ok = await book(c1.accessToken, { date: day, startMin: 540 }, { totalCentimes: 1 });   // client-supplied price must be ignored
    expect(ok.statusCode).toBe(201); expect(ok.json()).toMatchObject({ providerId: prov.userId, totalCentimes: 20000, state: "Requested", localDate: day, startMin: 540 });
    expect(ok.json().scheduledAt).toBe("2026-11-17T08:00:00.000Z");                     // 09:00 Morocco time (UTC+1)
    expect((await book(c2.accessToken, { date: day, startMin: 540 })).statusCode).toBe(409);    // same slot
    expect((await book(c2.accessToken, { date: day, startMin: 570 }, { durationMin: 60 })).statusCode).toBe(409); // overlaps the first booking
    expect((await book(c2.accessToken, { date: "2026-11-18", startMin: 540 })).statusCode).toBe(409);            // Wednesday: no availability
    expect((await book(prov.accessToken, { date: day, startMin: 600 }, { durationMin: 60 })).statusCode).toBe(422); // own offer
    expect((await post("/v1/bookings", { mode: "catalogue", offerId: offer.id }, c2.accessToken)).statusCode).toBe(422);  // no slot
    await post(`/v1/bookings/${ok.json().id}/cancel`, undefined, c1.accessToken);                                   // cancelling frees the slot
    expect((await book(c2.accessToken, { date: day, startMin: 540 })).statusCode).toBe(201);
  });
});

describe("rescheduling and availability", () => {
  it("customer moves a booking to another free slot; conflicts, strangers and started jobs are refused", async () => {
    const prov = await login("0601818181"), c1 = await login("0602828282"), c2 = await login("0603838383"), x = await login("0604848484");
    OVERRIDES.catalogueRepo.stats.set(prov.userId, { rating: 4.8, jobs: 10, tier: 1, cancelRate: 0, responseMin: 5, status: "active" });
    const offer = (await post("/v1/offers", { categoryId: "tutoring", title: "Maths 2", lat: 33.58, lng: -7.63, basePriceCentimes: 10000, pricingModel: "hourly" }, prov.accessToken)).json();
    const rules = [{ weekday: 2, startMin: 540, endMin: 900 }];
    expect((await app.inject({ method: "PUT", url: "/v1/me/availability", payload: { rules }, headers: { authorization: `Bearer ${prov.accessToken}` } })).statusCode).toBe(204);
    expect((await app.inject({ url: "/v1/me/availability", headers: { authorization: `Bearer ${prov.accessToken}` } })).json()).toEqual(rules);
    const day = "2026-11-24"; const slot = (startMin: number) => ({ date: day, startMin });
    const mine = (await post("/v1/bookings", { mode: "catalogue", offerId: offer.id, slot: slot(540), durationMin: 60 }, c1.accessToken)).json();
    const other = (await post("/v1/bookings", { mode: "catalogue", offerId: offer.id, slot: slot(660), durationMin: 60 }, c2.accessToken)).json();
    const resched = (token: string, id: string, s: object) => post(`/v1/bookings/${id}/reschedule`, { slot: s }, token);
    expect((await resched(x.accessToken, mine.id, slot(780))).statusCode).toBe(403);                                  // stranger
    expect((await resched(prov.accessToken, mine.id, slot(780))).statusCode).toBe(422);                               // provider cannot move the customer's booking
    expect((await resched(c1.accessToken, mine.id, slot(660))).statusCode).toBe(409);                                 // taken by c2
    expect((await resched(c1.accessToken, mine.id, slot(480))).statusCode).toBe(409);                                 // outside availability
    const ok = await resched(c1.accessToken, mine.id, slot(780)); expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ startMin: 780, localDate: day, state: "Requested", scheduledAt: "2026-11-24T12:00:00.000Z" });
    expect(ok.json().events.at(-1)).toMatchObject({ type: "booking.rescheduled", command: "reschedule" });
    expect((await post("/v1/bookings", { mode: "catalogue", offerId: offer.id, slot: slot(540), durationMin: 60 }, x.accessToken)).statusCode).toBe(201);   // the old slot is free again
    await post(`/v1/bookings/${other.id}/accept`, undefined, prov.accessToken); await post(`/v1/bookings/${other.id}/start-trip`, undefined, prov.accessToken);
    expect((await resched(c2.accessToken, other.id, slot(840))).statusCode).toBe(422);                                // already started
    const urgent = (await post("/v1/bookings", { mode: "dispatch", totalCentimes: 1000 }, c1.accessToken)).json();
    expect((await resched(c1.accessToken, urgent.id, slot(840))).statusCode).toBe(422);                               // no scheduled time
  });
});
