import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp, startRealtime } from "../src/main";
import { OVERRIDES } from "../src/app.module";

let app: NestFastifyApplication; let gw: ReturnType<typeof startRealtime>; let port: number;
beforeAll(async () => {
  app = await createApp(); await app.listen(0, "127.0.0.1");
  port = (app.getHttpServer().address() as { port: number }).port; gw = startRealtime(app);
});
afterAll(async () => { await gw.close(); await app.close(); });

const post = (url: string, payload?: unknown, token?: string) => app.inject({ method: "POST", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
async function login(phone: string) {
  await post("/v1/auth/otp/request", { phone });
  const r = await post("/v1/auth/otp/verify", { phone, code: OVERRIDES.otpSender.last.get(phone.replace(/^0/, "+212"))! });
  return r.json() as { userId: string; accessToken: string };
}
async function ws(token: string) {
  const s = new WebSocket(`ws://127.0.0.1:${port}/ws`); const frames: { t: string; [k: string]: unknown }[] = [];
  s.on("message", (d) => frames.push(JSON.parse(String(d)))); await new Promise((r) => s.once("open", r));
  s.send(JSON.stringify({ t: "auth", token }));
  const until = async (p: (f: (typeof frames)[number]) => boolean) => { const end = Date.now() + 2000; while (Date.now() < end) { const f = frames.find(p); if (f) return f; await new Promise((r) => setTimeout(r, 10)); } throw new Error("timeout " + JSON.stringify(frames)); };
  await until((f) => f.t === "ready");
  return { s, until, send: (o: unknown) => s.send(JSON.stringify(o)) };
}

describe("realtime over the real server with real JWTs", () => {
  it("customer follows the provider's live location during an active job", async () => {
    const customer = await login("0601010101"), provider = await login("0602020202"), stranger = await login("0603030303");
    const b = (await post("/v1/bookings", { mode: "dispatch", totalCentimes: 4000 }, customer.accessToken)).json();
    await post(`/v1/bookings/${b.id}/accept`, undefined, provider.accessToken);
    const cu = await ws(customer.accessToken), pr = await ws(provider.accessToken), st = await ws(stranger.accessToken);
    cu.send({ t: "sub", ch: `booking:${b.id}` }); await cu.until((f) => f.t === "ack" && f.ch === `booking:${b.id}`);
    st.send({ t: "sub", ch: `booking:${b.id}` }); await st.until((f) => f.t === "error" && f.code === "forbidden");
    pr.send({ t: "loc", booking: b.id, lat: 33.58, lng: -7.63 });                  // Accepted → provider may share
    expect((await cu.until((f) => f.t === "msg")).data).toMatchObject({ type: "provider.location", lat: 33.58 });
    for (const c of ["start-trip", "arrive", "start-job", "complete"]) await post(`/v1/bookings/${b.id}/${c}`, undefined, provider.accessToken);
    await new Promise((r) => setTimeout(r, 2100));                                   // clear the rate limit window
    pr.send({ t: "loc", booking: b.id, lat: 33.6, lng: -7.6 });
    await pr.until((f) => f.t === "error" && f.code === "forbidden");              // job finished → no more location
    for (const x of [cu, pr, st]) x.s.close();
  });
});
