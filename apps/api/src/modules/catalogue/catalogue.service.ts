import { ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { bbox, fuzz, haversineM } from "../../domain/geo";
import { slotsFor, type Busy, type Rule } from "../../domain/availability";
import { rankHits, type Hit } from "../../domain/ranking";

export interface OfferInput { categoryId: string; title: string; description?: string; lat: number; lng: number; radiusM: number; basePriceCentimes: number; pricingModel: "fixed" | "hourly" | "quote"; recurringAllowed: boolean }
export interface OfferRow extends OfferInput { id: string; providerId: string; active: boolean }
export interface ProviderStats { rating: number; jobs: number; tier: number; cancelRate: number; responseMin: number; status: string }
export interface SearchQuery { lat: number; lng: number; radiusM: number; categoryId?: string; q?: string; limit: number }

export interface CatalogueRepo {
  createOffer(providerId: string, o: OfferInput): Promise<OfferRow>;
  getOffer(id: string): Promise<OfferRow | undefined>;
  setActive(id: string, active: boolean): Promise<void>;
  candidates(q: SearchQuery & { box: ReturnType<typeof bbox> }): Promise<(OfferRow & { stats: ProviderStats })[]>;
  rules(providerId: string): Promise<Rule[]>;
  setRules(providerId: string, rules: Rule[]): Promise<void>;
  busy(providerId: string, fromDate: string, days: number): Promise<Busy[]>;
  categoryTier(categoryId: string): Promise<number | undefined>;
  providerTier(providerId: string): Promise<number>;
  offersOf(providerId: string): Promise<OfferRow[]>;
  providerProfile(providerId: string): Promise<{ tier: number; status: string; rating: number; jobs: number } | undefined>;
}

@Injectable()
export class CatalogueService {
  constructor(@Inject("CATALOGUE_REPO") private repo: CatalogueRepo) {}

  async publish(providerId: string, o: OfferInput) {
    const need = await this.repo.categoryTier(o.categoryId);
    if (need === undefined) throw new UnprocessableEntityException("unknown category");
    const have = await this.repo.providerTier(providerId);
    if (have < need) throw new ForbiddenException(`category requires verification tier ${need} (you have ${have})`);
    return this.repo.createOffer(providerId, o);
  }

  offersOf(providerId: string) { return this.repo.offersOf(providerId); }
  async providerSummary(providerId: string) { return (await this.repo.providerProfile(providerId)) ?? { tier: 0, status: "none", rating: 0, jobs: 0 }; }

  async deactivate(providerId: string, id: string) {
    const o = await this.repo.getOffer(id);
    if (!o) throw new NotFoundException();
    if (o.providerId !== providerId) throw new ForbiddenException();
    await this.repo.setActive(id, false);
  }

  async search(q: SearchQuery, today: string) {
    const rows = await this.repo.candidates({ ...q, box: bbox(q.lat, q.lng, q.radiusM) });
    const needle = q.q?.trim().toLowerCase();
    const hits: (Hit & { offer: OfferRow })[] = [];
    for (const r of rows) {
      const distanceM = haversineM(q.lat, q.lng, r.lat, r.lng);
      if (distanceM > q.radiusM || !r.active || r.stats.status !== "active") continue;
      const text = needle ? `${r.title} ${r.description ?? ""}`.toLowerCase() : "";
      if (needle && !text.includes(needle)) continue;
      const rules = await this.repo.rules(r.providerId);
      const available = slotsFor(rules, await this.repo.busy(r.providerId, today, 7), today, 7, 60).length > 0;
      hits.push({ id: r.id, distanceM, rating: r.stats.rating, jobs: r.stats.jobs, tier: r.stats.tier, availableThisWeek: available, responseMin: r.stats.responseMin, cancelRate: r.stats.cancelRate, textScore: needle ? 1 : 0, offer: r });
    }
    return rankHits(hits, q.radiusM).slice(0, q.limit).map((h) => ({
      id: h.offer.id, title: h.offer.title, categoryId: h.offer.categoryId, priceCentimes: h.offer.basePriceCentimes, pricingModel: h.offer.pricingModel,
      distanceM: Math.round(h.distanceM / 50) * 50, rating: h.rating, jobs: h.jobs, tier: h.tier, availableThisWeek: h.availableThisWeek,
      location: fuzz(h.offer.lat, h.offer.lng), providerId: h.offer.providerId,
    }));
  }

  async slots(offerId: string, fromDate: string, days: number, durationMin: number) {
    const o = await this.repo.getOffer(offerId);
    if (!o) throw new NotFoundException();
    return slotsFor(await this.repo.rules(o.providerId), await this.repo.busy(o.providerId, fromDate, days), fromDate, days, durationMin);
  }

  async setAvailability(providerId: string, rules: Rule[]) {
    for (const r of rules) if (r.weekday < 0 || r.weekday > 6 || r.startMin < 0 || r.endMin > 1440 || r.startMin >= r.endMin) throw new UnprocessableEntityException("invalid availability rule");
    return this.repo.setRules(providerId, rules);
  }
}
