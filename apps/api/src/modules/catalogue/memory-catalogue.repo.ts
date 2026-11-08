import { randomUUID } from "node:crypto";
import type { CatalogueRepo, OfferInput, OfferRow, ProviderStats } from "./catalogue.service";
import type { Rule, Busy } from "../../domain/availability";

/** Dev/test repo. Production uses PgCatalogueRepo. */
export class MemoryCatalogueRepo implements CatalogueRepo {
  offers = new Map<string, OfferRow>(); stats = new Map<string, ProviderStats>(); ruleMap = new Map<string, Rule[]>(); busyMap = new Map<string, Busy[]>();
  tiers: Record<string, number> = { cleaning: 2, tutoring: 1, errands: 1 };
  async createOffer(providerId: string, o: OfferInput) { const row = { ...o, id: randomUUID(), providerId, active: true }; this.offers.set(row.id, row); return row; }
  async getOffer(id: string) { return this.offers.get(id); }
  async setActive(id: string, active: boolean) { const o = this.offers.get(id); if (o) o.active = active; }
  async candidates(q: { box: { minLat: number; maxLat: number; minLng: number; maxLng: number }; categoryId?: string }) {
    return [...this.offers.values()].filter((o) => (!q.categoryId || o.categoryId === q.categoryId) && o.lat >= q.box.minLat && o.lat <= q.box.maxLat && o.lng >= q.box.minLng && o.lng <= q.box.maxLng)
      .map((o) => ({ ...o, stats: this.stats.get(o.providerId) ?? { rating: 0, jobs: 0, tier: 0, cancelRate: 0, responseMin: 60, status: "active" } }));
  }
  async rules(p: string) { return this.ruleMap.get(p) ?? []; }
  async setRules(p: string, r: Rule[]) { this.ruleMap.set(p, r); }
  async busy(p: string) { return this.busyMap.get(p) ?? []; }
  async categoryTier(c: string) { return this.tiers[c]; }
  async providerTier(p: string) { return this.stats.get(p)?.tier ?? 0; }
}
