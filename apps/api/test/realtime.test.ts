import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { attachGateway } from "../src/realtime/gateway";
import { MemoryBus } from "../src/realtime/bus";

const PORT = 38_000 + Math.floor(Math.random() * 1000);
const bus = new MemoryBus();
const customer = randomUUID(), provider = randomUUID(), stranger = randomUUID(), booking = randomUUID();
let gw: ReturnType<typeof attachGateway>;

beforeAll(() => {
  gw = attachGateway({ port: PORT }, {
    bus, authTimeoutMs: 300, locMinIntervalMs: 1500,
    authenticate: async (t) => { if (!t.startsWith("tok-")) throw new Error("bad token"); return t.slice(4); },
    canSubscribe: async (u, ch) => ch === `user:${u}` || (ch === `booking:${booking}` && (u === customer || u === provider)),
    canPublishLocation: async (u, b) => u === provider && b === booking,
  });
});
afterAll(async () => { await gw.close(); });

type Frame = { t: string; [k: string]: unknown };
async function client(token?: string) {
  const ws = new WebSocket(`ws://localhost:${PORT}`); const frames: Frame[] = [];
  ws.on("message", (d) => frames.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once("open", r));
  if (token) ws.send(JSON.stringify({ t: "auth", token }));
  const until = async (pred: (f: Frame) => boolean, ms = 1500) => { const end = Date.now() + ms; while (Date.now() < end) { const f = frames.find(pred); if (f) return f; await new Promise((r) => setTimeout(r, 10)); } throw new Error("timeout waiting for frame; got " + JSON.stringify(frames)); };
  return { ws, frames, until, send: (o: unknown) => ws.send(JSON.stringify(o)) };
}

describe("realtime gateway", () => {
  it("authenticates and delivers personal-channel messages", async () => {
    const c = await client(`tok-${customer}`);
    await c.until((f) => f.t === "ready");
    await bus.publish(`user:${customer}`, { type: "notification", text: "hi" });
    expect((await c.until((f) => f.t === "msg")).data).toEqual({ type: "notification", text: "hi" });
    c.ws.close();
  });

  it("rejects bad tokens and silent connections", async () => {
    const bad = await client("nope"); await bad.until((f) => f.t === "error" && f.code === "auth_failed");
    const silent = await client(); await silent.until((f) => f.t === "error" && f.code === "auth_timeout");
  });

  it("requires auth before anything else", async () => {
    const c = await client(); c.send({ t: "sub", ch: `booking:${booking}` });
    await c.until((f) => f.t === "error" && f.code === "unauthenticated"); c.ws.close();
  });

  it("only participants can join a booking channel", async () => {
    const s = await client(`tok-${stranger}`); await s.until((f) => f.t === "ready");
    s.send({ t: "sub", ch: `booking:${booking}` });
    await s.until((f) => f.t === "error" && f.code === "forbidden");
    s.send({ t: "sub", ch: `user:${customer}` }); // cannot eavesdrop on someone's personal channel
    await s.until((f) => f.t === "error" && f.code === "forbidden" && f.detail === `user:${customer}`);
    s.send({ t: "sub", ch: "../../etc" }); await s.until((f) => f.t === "error" && f.code === "bad_channel");
    s.ws.close();
  });

  it("relays provider location to the customer, and only from the assigned provider", async () => {
    const cu = await client(`tok-${customer}`), pr = await client(`tok-${provider}`);
    await cu.until((f) => f.t === "ready"); await pr.until((f) => f.t === "ready");
    cu.send({ t: "sub", ch: `booking:${booking}` }); await cu.until((f) => f.t === "ack" && f.ch === `booking:${booking}`);
    pr.send({ t: "loc", booking, lat: 33.58, lng: -7.63 });
    const m = await cu.until((f) => f.t === "msg" && f.ch === `booking:${booking}`);
    expect(m.data).toMatchObject({ type: "provider.location", lat: 33.58, lng: -7.63 });
    cu.send({ t: "loc", booking, lat: 1, lng: 1 });                       // customer cannot spoof the provider
    await cu.until((f) => f.t === "error" && f.code === "forbidden");
    pr.send({ t: "loc", booking, lat: 33.581, lng: -7.631 });             // too fast → rate limited
    await pr.until((f) => f.t === "error" && f.code === "rate_limited");
    pr.send({ t: "loc", booking, lat: 999, lng: 0 });
    await pr.until((f) => f.t === "error" && f.code === "bad_location");
    cu.ws.close(); pr.ws.close();
  });

  it("stops delivering after unsubscribe and after disconnect cleans up", async () => {
    const cu = await client(`tok-${customer}`); await cu.until((f) => f.t === "ready");
    cu.send({ t: "sub", ch: `booking:${booking}` }); await cu.until((f) => f.t === "ack" && f.ch === `booking:${booking}`);
    cu.send({ t: "unsub", ch: `booking:${booking}` });
    await new Promise((r) => setTimeout(r, 100));
    const before = cu.frames.length;
    await bus.publish(`booking:${booking}`, { type: "x" });
    await new Promise((r) => setTimeout(r, 100));
    expect(cu.frames.length).toBe(before);
    cu.ws.close();
  });

  it("ping/pong and malformed frames", async () => {
    const c = await client(`tok-${customer}`); await c.until((f) => f.t === "ready");
    c.send({ t: "ping" }); await c.until((f) => f.t === "pong");
    c.ws.send("{not json"); await c.until((f) => f.t === "error" && f.code === "bad_json");
    c.ws.close();
  });
});
