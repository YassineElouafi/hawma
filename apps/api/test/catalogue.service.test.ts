import { describe, expect, it } from "vitest";
import { CatalogueService, type OfferInput } from "../src/modules/catalogue/catalogue.service";
import { MemoryCatalogueRepo } from "../src/modules/catalogue/memory-catalogue.repo";

const maarif = { lat: 33.5883, lng: -7.635 };
const offer = (o: Partial<OfferInput> = {}): OfferInput => ({ categoryId: "tutoring", title: "Maths lycée", lat: maarif.lat, lng: maarif.lng, radiusM: 5000, basePriceCentimes: 10000, pricingModel: "hourly", recurringAllowed: true, ...o });
const stats = (o: object = {}) => ({ rating: 4.7, jobs: 30, tier: 2, cancelRate: 0.01, responseMin: 10, status: "active", ...o });

function setup() {
  const repo = new MemoryCatalogueRepo(); const svc = new CatalogueService(repo);
  return { repo, svc };
}

describe("catalogue", () => {
  it("enforces verification tier per category", async () => {
    const { repo, svc } = setup(); repo.stats.set("p1", stats({ tier: 1 }));
    await expect(svc.publish("p1", offer({ categoryId: "cleaning" }))).rejects.toThrow(/requires verification tier 2/);
    await expect(svc.publish("p1", offer({ categoryId: "nope" }))).rejects.toThrow(/unknown category/);
    await expect(svc.publish("p1", offer())).resolves.toMatchObject({ providerId: "p1" });
  });

  it("search honours radius, category and text, and hides inactive/unverified providers", async () => {
    const { repo, svc } = setup();
    repo.stats.set("near", stats()); repo.stats.set("far", stats()); repo.stats.set("pending", stats({ status: "pending" }));
    await svc.publish("near", offer({ title: "Maths lycée" }));
    await svc.publish("far", offer({ title: "Maths lycée", lat: maarif.lat + 0.2 }));        // ~22 km away
    await svc.publish("pending", offer({ title: "Maths lycée" }));
    const ch = await svc.publish("near", offer({ categoryId: "errands", title: "Courses" }));
    const r = await svc.search({ ...maarif, radiusM: 5000, limit: 10 }, "2026-11-10");
    expect(r.map((x) => x.providerId).sort()).toEqual(["near", "near"]);
    expect((await svc.search({ ...maarif, radiusM: 5000, categoryId: "errands", limit: 10 }, "2026-11-10")).map((x) => x.id)).toEqual([ch.id]);
    expect((await svc.search({ ...maarif, radiusM: 5000, q: "maths", limit: 10 }, "2026-11-10")).length).toBe(1);
    await svc.deactivate("near", ch.id);
    expect((await svc.search({ ...maarif, radiusM: 5000, limit: 10 }, "2026-11-10")).length).toBe(1);
  });

  it("never leaks the exact provider location", async () => {
    const { repo, svc } = setup(); repo.stats.set("p", stats());
    await svc.publish("p", offer({ lat: 33.58123, lng: -7.63456 }));
    const [r] = await svc.search({ ...maarif, radiusM: 5000, limit: 1 }, "2026-11-10");
    expect(r.location.lat).not.toBe(33.58123); expect(r.location.lng).not.toBe(-7.63456);
    expect(r.distanceM % 50).toBe(0);
  });

  it("available providers rank above unavailable ones at the same distance", async () => {
    const { repo, svc } = setup(); repo.stats.set("a", stats()); repo.stats.set("b", stats());
    await svc.publish("a", offer()); await svc.publish("b", offer());
    await svc.setAvailability("b", [{ weekday: 2, startMin: 540, endMin: 720 }]);
    const r = await svc.search({ ...maarif, radiusM: 5000, limit: 5 }, "2026-11-09");
    expect(r[0].providerId).toBe("b");
  });

  it("only the owner can deactivate; slots reflect availability and busy time", async () => {
    const { repo, svc } = setup(); repo.stats.set("p", stats());
    const o = await svc.publish("p", offer());
    await expect(svc.deactivate("someone", o.id)).rejects.toThrow();
    await svc.setAvailability("p", [{ weekday: 2, startMin: 540, endMin: 660 }]);
    repo.busyMap.set("p", [{ date: "2026-11-10", startMin: 540, endMin: 600 }]);
    expect((await svc.slots(o.id, "2026-11-10", 1, 60)).map((s) => s.startMin)).toEqual([600]);
  });

  it("rejects invalid availability", async () => {
    const { svc } = setup();
    await expect(svc.setAvailability("p", [{ weekday: 7, startMin: 0, endMin: 60 }])).rejects.toThrow();
    await expect(svc.setAvailability("p", [{ weekday: 1, startMin: 600, endMin: 600 }])).rejects.toThrow();
  });
});
