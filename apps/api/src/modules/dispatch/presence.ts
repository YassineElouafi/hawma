import type { Redis } from "ioredis";
import { haversineM } from "../../domain/geo";

export interface PresenceStore {
  heartbeat(providerId: string, lat: number, lng: number, ttlS?: number): Promise<void>;
  offline(providerId: string): Promise<void>;
  nearby(lat: number, lng: number, radiusM: number, limit?: number): Promise<{ id: string; distanceM: number }[]>;
}
export const PRESENCE_TTL_S = 45; // a provider is "online" only while heartbeats keep arriving (app sends one every ~15 s)

export class MemoryPresence implements PresenceStore {
  private m = new Map<string, { lat: number; lng: number; exp: number }>();
  constructor(private now: () => number = Date.now) {}
  async heartbeat(id: string, lat: number, lng: number, ttl = PRESENCE_TTL_S) { this.m.set(id, { lat, lng, exp: this.now() + ttl * 1000 }); }
  async offline(id: string) { this.m.delete(id); }
  async nearby(lat: number, lng: number, radiusM: number, limit = 50) {
    return [...this.m.entries()].filter(([, v]) => v.exp > this.now()).map(([id, v]) => ({ id, distanceM: haversineM(lat, lng, v.lat, v.lng) }))
      .filter((x) => x.distanceM <= radiusM).sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
  }
}

/** Redis GEO index + a TTL key per provider (GEO members cannot expire on their own, so liveness is checked via the TTL key). */
export class RedisPresence implements PresenceStore {
  constructor(private r: Redis, private prefix = "hawma:presence:") {}
  private geo = () => this.prefix + "geo";
  async heartbeat(id: string, lat: number, lng: number, ttl = PRESENCE_TTL_S) { await this.r.multi().geoadd(this.geo(), lng, lat, id).set(this.prefix + "alive:" + id, "1", "EX", ttl).exec(); }
  async offline(id: string) { await this.r.multi().zrem(this.geo(), id).del(this.prefix + "alive:" + id).exec(); }
  async nearby(lat: number, lng: number, radiusM: number, limit = 50) {
    const raw = (await this.r.geosearch(this.geo(), "FROMLONLAT", lng, lat, "BYRADIUS", radiusM, "m", "ASC", "COUNT", limit * 2, "WITHDIST")) as [string, string][];
    if (!raw.length) return [];
    const alive = await this.r.mget(...raw.map(([id]) => this.prefix + "alive:" + id));
    const out: { id: string; distanceM: number }[] = [];
    raw.forEach(([id, d], i) => { if (alive[i]) out.push({ id, distanceM: Number(d) }); else void this.r.zrem(this.geo(), id); });
    return out.slice(0, limit);
  }
}
