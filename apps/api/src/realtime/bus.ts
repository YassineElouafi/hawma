import type { Redis } from "ioredis";

/** Pub/sub fabric for realtime fan-out (docs §4.4). In-memory for dev/tests, Redis in production. */
export interface Bus {
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, cb: (message: unknown) => void): Promise<() => Promise<void>>;
}

export class MemoryBus implements Bus {
  private subs = new Map<string, Set<(m: unknown) => void>>();
  async publish(channel: string, message: unknown) { for (const cb of this.subs.get(channel) ?? []) cb(structuredClone(message)); }
  async subscribe(channel: string, cb: (m: unknown) => void) {
    if (!this.subs.has(channel)) this.subs.set(channel, new Set());
    this.subs.get(channel)!.add(cb);
    return async () => { this.subs.get(channel)?.delete(cb); };
  }
}

/** One shared subscriber connection; local callbacks are multiplexed per channel. */
export class RedisBus implements Bus {
  private local = new Map<string, Set<(m: unknown) => void>>();
  constructor(private pub: Redis, private sub: Redis, private prefix = "hawma:rt:") {
    this.sub.on("message", (ch: string, raw: string) => {
      const name = ch.slice(this.prefix.length);
      let msg: unknown; try { msg = JSON.parse(raw); } catch { return; }
      for (const cb of this.local.get(name) ?? []) cb(msg);
    });
  }
  async publish(channel: string, message: unknown) { await this.pub.publish(this.prefix + channel, JSON.stringify(message)); }
  async subscribe(channel: string, cb: (m: unknown) => void) {
    let set = this.local.get(channel);
    if (!set) { set = new Set(); this.local.set(channel, set); await this.sub.subscribe(this.prefix + channel); }
    set.add(cb);
    return async () => {
      set!.delete(cb);
      if (set!.size === 0) { this.local.delete(channel); await this.sub.unsubscribe(this.prefix + channel); }
    };
  }
}
