import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import type { Bus } from "./bus";

export interface GatewayDeps {
  bus: Bus;
  authenticate(token: string): Promise<string>;                                        // → userId, throws if invalid
  canSubscribe(userId: string, channel: string): Promise<boolean>;                     // participant check
  canPublishLocation(userId: string, bookingId: string): Promise<boolean>;             // only the assigned provider, while the job is active
  authTimeoutMs?: number; maxSubs?: number; locMinIntervalMs?: number; heartbeatMs?: number;
}

interface Client { ws: WebSocket; userId?: string; subs: Map<string, () => Promise<void>>; lastLoc: number; alive: boolean }

/**
 * Realtime gateway. Protocol (JSON text frames):
 *   C→S {t:"auth",token}  {t:"sub",ch}  {t:"unsub",ch}  {t:"loc",booking,lat,lng}  {t:"ping"}
 *   S→C {t:"ready",userId} {t:"msg",ch,data} {t:"ack",ch} {t:"error",code,detail} {t:"pong"}
 * Channels: user:{id} (auto-subscribed), booking:{id}, conversation:{id}. A user can never join another user's channel.
 */
export function attachGateway(server: Server | { port: number }, d: GatewayDeps) {
  const wss = new WebSocketServer("port" in server ? { port: server.port } : { server, path: "/ws" });
  const clients = new Set<Client>();
  const send = (c: Client, o: unknown) => { if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(o)); };
  const err = (c: Client, code: string, detail?: string) => send(c, { t: "error", code, detail });
  const maxSubs = d.maxSubs ?? 50, minLoc = d.locMinIntervalMs ?? 2000;

  async function join(c: Client, ch: string) {
    if (c.subs.has(ch)) return send(c, { t: "ack", ch });
    if (c.subs.size >= maxSubs) return err(c, "too_many_subscriptions");
    if (!/^(user|booking|conversation):[0-9a-f-]{36}$/.test(ch)) return err(c, "bad_channel");
    if (!(await d.canSubscribe(c.userId!, ch))) return err(c, "forbidden", ch);
    c.subs.set(ch, await d.bus.subscribe(ch, (data) => send(c, { t: "msg", ch, data })));
    send(c, { t: "ack", ch });
  }

  wss.on("connection", (ws) => {
    const c: Client = { ws, subs: new Map(), lastLoc: 0, alive: true };
    clients.add(c);
    const timer = setTimeout(() => { if (!c.userId) { err(c, "auth_timeout"); ws.close(4001, "auth timeout"); } }, d.authTimeoutMs ?? 5000);
    ws.on("pong", () => { c.alive = true; });
    ws.on("message", async (raw) => {
      let m: { t?: string; [k: string]: unknown };
      try { m = JSON.parse(String(raw)); } catch { return err(c, "bad_json"); }
      try {
        if (m.t === "auth") {
          if (c.userId) return err(c, "already_authenticated");
          c.userId = await d.authenticate(String(m.token ?? ""));
          clearTimeout(timer);
          await join(c, `user:${c.userId}`); // personal channel is always allowed (canSubscribe must accept own id)
          return send(c, { t: "ready", userId: c.userId });
        }
        if (!c.userId) return err(c, "unauthenticated");
        if (m.t === "ping") return send(c, { t: "pong" });
        if (m.t === "sub") return join(c, String(m.ch));
        if (m.t === "unsub") { const u = c.subs.get(String(m.ch)); if (u) { await u(); c.subs.delete(String(m.ch)); } return send(c, { t: "ack", ch: m.ch }); }
        if (m.t === "loc") {
          const lat = Number(m.lat), lng = Number(m.lng), booking = String(m.booking);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err(c, "bad_location");
          const now = Date.now();
          if (now - c.lastLoc < minLoc) return err(c, "rate_limited");
          if (!(await d.canPublishLocation(c.userId, booking))) return err(c, "forbidden", booking);
          c.lastLoc = now;
          return void (await d.bus.publish(`booking:${booking}`, { type: "provider.location", lat, lng, at: new Date(now).toISOString() }));
        }
        err(c, "unknown_type");
      } catch (e) {
        err(c, c.userId ? "internal" : "auth_failed", e instanceof Error ? e.message : undefined);
        if (!c.userId) ws.close(4003, "auth failed");
      }
    });
    ws.on("close", async () => { clearTimeout(timer); clients.delete(c); for (const u of c.subs.values()) await u().catch(() => {}); c.subs.clear(); });
  });

  const hb = setInterval(() => { for (const c of clients) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); } }, d.heartbeatMs ?? 30_000);
  wss.on("close", () => clearInterval(hb));
  return { wss, close: () => new Promise<void>((res) => { clearInterval(hb); for (const c of clients) c.ws.terminate(); wss.close(() => res()); }) };
}
