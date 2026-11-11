import { describe, expect, it } from "vitest";
import { DispatchService, MemoryOfferRepo, OFFER_TTL_MS, type ProviderPort } from "../src/modules/dispatch/dispatch.service";
import { MemoryPresence } from "../src/modules/dispatch/presence";
import { MemoryBus } from "../src/realtime/bus";
import { BookingsService, MemoryBookingRepo } from "../src/modules/bookings/bookings.service";

const MAARIF = { lat: 33.5883, lng: -7.635 };
const at = (dMeters: number) => ({ lat: MAARIF.lat + dMeters / 111_320, lng: MAARIF.lng });

function setup() {
  let t = 1_700_000_000_000; const now = () => t;
  const presence = new MemoryPresence(now), bus = new MemoryBus(), repo = new MemoryBookingRepo(), bookings = new BookingsService(repo, now);
  const profiles = new Map<string, { tier: number; status: string; rating: number; cancelRate: number; acceptance: number }>();
  const port: ProviderPort = {
    profile: async (id) => profiles.get(id),
    busy: async (id) => (await repo.listAll(undefined, 1000)).some((b) => b.providerId === id && ["Accepted", "EnRoute", "Arrived", "InProgress"].includes(b.state)),
    requiredTier: async (c) => ({ errands: 1, cleaning: 2 } as Record<string, number>)[c ?? ""] ?? 1,
  };
  const svc = new DispatchService(new MemoryOfferRepo(), presence, bus, port, bookings, now);
  const events: { ch: string; msg: any }[] = []; const watch = async (ch: string) => { await bus.subscribe(ch, (m) => events.push({ ch, msg: m })); };
  const provider = async (id: string, dM: number, o: Partial<{ tier: number; status: string; rating: number }> = {}) => { profiles.set(id, { tier: 1, status: "active", rating: 4.5, cancelRate: 0, acceptance: 1, ...o }); await presence.heartbeat(id, at(dM).lat, at(dM).lng); };
  return { svc, bookings, presence, events, watch, provider, advance: (ms: number) => { t += ms; }, request: (c = "cust") => svc.request(c, { ...MAARIF, categoryId: "errands", totalCentimes: 3000, paymentMethod: "cash" }) };
}

describe("dispatch service", () => {
  it("offers to the best eligible online provider and notifies only them", async () => {
    const s = setup(); await s.watch("user:near"); await s.watch("user:far");
    await s.provider("near", 400); await s.provider("far", 2000); await s.provider("offline", 100); await s.presence.offline("offline");
    await s.provider("lowtier", 50, { tier: 0 }); await s.provider("pending", 60, { status: "pending" });
    const b = await s.request();
    const offers = await s.svc.pending("near"); expect(offers).toHaveLength(1);
    expect(await s.svc.pending("far")).toHaveLength(0);
    expect(s.events.filter((e) => e.ch === "user:near").map((e) => e.msg.type)).toEqual(["dispatch.offer"]);
    expect(offers[0].bookingId).toBe(b.id);
  });

  it("accepting claims the booking; the offer cannot be reused or taken by someone else", async () => {
    const s = setup(); await s.provider("p1", 300); await s.provider("p2", 900);
    const b = await s.request(); const [o] = await s.svc.pending("p1");
    await expect(s.svc.accept("p2", o.id)).rejects.toThrow(/Forbidden/i);
    const done = await s.svc.accept("p1", o.id); expect(done).toMatchObject({ state: "Accepted", providerId: "p1" });
    await expect(s.svc.accept("p1", o.id)).rejects.toThrow(/no longer available/);
    expect(await s.svc.pending("p2")).toHaveLength(0);                       // nobody else is offered an accepted job
    expect((await s.bookings.getAny(b.id)).providerId).toBe("p1");
  });

  it("reject moves to the next candidate; timeouts do too; each provider is asked at most once", async () => {
    const s = setup(); await s.provider("a", 200); await s.provider("b", 500); await s.provider("c", 800);
    const b = await s.request();
    const [oa] = await s.svc.pending("a"); await s.svc.reject("a", oa.id);
    expect(await s.svc.pending("b")).toHaveLength(1);
    s.advance(OFFER_TTL_MS + 1000); for (const id of ["a", "b", "c"]) await s.presence.heartbeat(id, MAARIF.lat, MAARIF.lng); // still online
    expect(await s.svc.tick()).toBe(1);                                        // b's offer expired
    expect(await s.svc.pending("c")).toHaveLength(1);
    await expect(s.svc.accept("b", (await (s.svc as any).offers.forBooking(b.id)).find((o: any) => o.providerId === "b").id)).rejects.toThrow(/no longer available/);
    const [oc] = await s.svc.pending("c"); expect((await s.svc.accept("c", oc.id)).providerId).toBe("c");
  });

  it("expired offers cannot be accepted even before the tick runs", async () => {
    const s = setup(); await s.provider("p", 300); await s.request(); const [o] = await s.svc.pending("p");
    s.advance(OFFER_TTL_MS + 1); await expect(s.svc.accept("p", o.id)).rejects.toThrow(/no longer available/);
  });

  it("widens the search radius, and expires the booking + tells the customer when nobody is left", async () => {
    const s = setup(); await s.watch("user:cust");
    await s.provider("faraway", 5000);                                          // outside the 3 km start radius, inside the widened 6 km
    const b = await s.request(); expect(await s.svc.pending("faraway")).toHaveLength(1);
    const [o] = await s.svc.pending("faraway"); await s.svc.reject("faraway", o.id);
    expect((await s.bookings.getAny(b.id)).state).toBe("Expired");
    expect(s.events.some((e) => e.ch === "user:cust" && e.msg.type === "dispatch.unfilled")).toBe(true);
    const none = setup(); const nb = await none.request("c2"); expect((await none.bookings.getAny(nb.id)).state).toBe("Expired");
  });

  it("stale presence (no heartbeat) is not offered work; busy providers are skipped", async () => {
    const s = setup(); await s.provider("stale", 200); s.advance(60_000);
    await s.provider("busy", 300);
    const other = await s.bookings.create("someone", { mode: "catalogue", providerId: "busy", totalCentimes: 100, paymentMethod: "cash" }); await s.bookings.command(other.id, "accept", "busy");
    await s.provider("free", 900);
    await s.request("cust2");
    expect(await s.svc.pending("stale")).toHaveLength(0); expect(await s.svc.pending("busy")).toHaveLength(0); expect(await s.svc.pending("free")).toHaveLength(1);
  });

  it("concurrent matching never creates two open offers for one booking", async () => {
    const s = setup(); await s.provider("a", 200); await s.provider("b", 400);
    const b = await s.request(); await Promise.all([s.svc.matchNext(b.id), s.svc.matchNext(b.id), s.svc.matchNext(b.id)]);
    const open = (await (s.svc as any).offers.forBooking(b.id)).filter((o: any) => o.status === "offered"); expect(open).toHaveLength(1);
  });

  it("a customer is never offered their own request", async () => {
    const s = setup(); await s.provider("me", 100); await s.provider("other", 500); const b = await s.request("me");
    expect(await s.svc.pending("me")).toHaveLength(0); expect(await s.svc.pending("other")).toHaveLength(1); expect(b.customerId).toBe("me");
  });
});

describe("dispatch fairness under load", () => {
  it("a provider holding an open offer is not offered a second job (no double booking)", async () => {
    const s = setup(); await s.provider("solo", 200);
    const b1 = await s.request("c1"); expect(await s.svc.pending("solo")).toHaveLength(1);
    const b2 = await s.request("c2");                                            // only provider holds an open offer → request is QUEUED, not failed
    expect((await s.bookings.getAny(b2.id)).state).toBe("Requested");
    expect((await s.bookings.getAny(b1.id)).state).toBe("Requested");
    const [o] = await s.svc.pending("solo"); await s.svc.accept("solo", o.id);
    expect((await s.bookings.getAny(b1.id)).providerId).toBe("solo");
    await s.svc.tick(); expect(await s.svc.pending("solo")).toHaveLength(0);     // solo is now on a job: b2 keeps waiting
    s.advance(121_000); await s.presence.heartbeat("solo", MAARIF.lat, MAARIF.lng); await s.svc.tick();
    expect((await s.bookings.getAny(b2.id)).state).toBe("Expired");              // gave up after the maximum wait
  });
  it("many requests and many providers: every provider ends up with at most one job", async () => {
    const s = setup(); for (let i = 0; i < 20; i++) await s.provider(`p${i}`, 100 + i * 50);
    const bs = await Promise.all(Array.from({ length: 30 }, (_, i) => s.request(`c${i}`)));
    for (let r = 0; r < 5; r++) for (let i = 0; i < 20; i++) { for (const o of await s.svc.pending(`p${i}`)) await s.svc.accept(`p${i}`, o.id).catch(() => {}); }
    const all = await Promise.all(bs.map((b) => s.bookings.getAny(b.id)));
    const per = new Map<string, number>(); for (const b of all) if (b.providerId) per.set(b.providerId, (per.get(b.providerId) ?? 0) + 1);
    expect(Math.max(0, ...per.values())).toBeLessThanOrEqual(1);
    expect(all.filter((b) => b.state === "Accepted").length).toBeLessThanOrEqual(20);
  });
});

describe("queued requests", () => {
  it("a queued request is offered as soon as a provider frees up", async () => {
    const s = setup(); await s.provider("solo", 200);
    const b1 = await s.request("c1"); const b2 = await s.request("c2");
    const [o1] = await s.svc.pending("solo"); await s.svc.reject("solo", o1.id);   // rejects b1; solo is free again
    await s.svc.tick();                                                          // the ticker offers the waiting request
    const pending = await s.svc.pending("solo"); expect(pending).toHaveLength(1);
    expect(pending[0].bookingId).toBe(b2.id);
  });
});

describe("cash-debt cap", () => {
  it("providers who owe more than 300 MAD in fees are not offered new jobs until they settle", async () => {
    const s = setup(); await s.provider("indebted", 100); await s.provider("clean", 400);
    (s.svc as any).providers.cashOwed = async (ids: string[]) => new Map(ids.map((id) => [id, id === "indebted" ? 31_000 : 0]));
    await s.request(); expect(await s.svc.pending("indebted")).toHaveLength(0); expect(await s.svc.pending("clean")).toHaveLength(1);
  });
});
