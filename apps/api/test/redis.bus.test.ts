import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Redis from "ioredis";
import { RedisBus } from "../src/realtime/bus";

const url = process.env.REDIS_URL;
(url ? describe : describe.skip)("RedisBus (real Redis)", () => {
  let pub: Redis, sub: Redis, bus: RedisBus;
  beforeAll(() => { pub = new Redis(url!); sub = new Redis(url!); bus = new RedisBus(pub, sub, `t${Date.now()}:`); });
  afterAll(async () => { await pub.quit(); await sub.quit(); });
  it("fans out to multiple local subscribers and stops after unsubscribe", async () => {
    const a: unknown[] = [], b: unknown[] = [];
    const ua = await bus.subscribe("booking:1", (m) => a.push(m)), ub = await bus.subscribe("booking:1", (m) => b.push(m));
    await bus.publish("booking:1", { n: 1 });
    await new Promise((r) => setTimeout(r, 150));
    expect(a).toEqual([{ n: 1 }]); expect(b).toEqual([{ n: 1 }]);
    await ua(); await bus.publish("booking:1", { n: 2 });
    await new Promise((r) => setTimeout(r, 150));
    expect(a).toHaveLength(1); expect(b).toHaveLength(2);
    await ub();
  });
  it("does not leak across channels", async () => {
    const got: unknown[] = []; const u = await bus.subscribe("booking:A", (m) => got.push(m));
    await bus.publish("booking:B", { x: 1 }); await new Promise((r) => setTimeout(r, 100));
    expect(got).toEqual([]); await u();
  });
});
