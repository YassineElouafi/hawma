import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";
import type { CatalogueRepo, OfferInput, OfferRow, ProviderStats, SearchQuery } from "./catalogue.service";
import type { Rule, Busy } from "../../domain/availability";

type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number };
const toOffer = (r: typeof s.offers.$inferSelect): OfferRow => ({
  id: r.id, providerId: r.providerId, categoryId: r.categoryId, title: (r.titleI18n as { fr: string }).fr,
  description: (r.descriptionI18n as { fr?: string } | null)?.fr, lat: r.lat, lng: r.lng, radiusM: r.radiusM,
  pricingModel: r.pricingModel as OfferRow["pricingModel"], basePriceCentimes: r.basePriceCentimes, recurringAllowed: r.recurringAllowed, active: r.active,
});

/** Read model note: `candidates` and `busy` read provider_profile / booking tables read-only (documented cross-module read model). */
export class PgCatalogueRepo implements CatalogueRepo {
  constructor(private db: PostgresJsDatabase) {}

  async createOffer(providerId: string, o: OfferInput) {
    const [r] = await this.db.insert(s.offers).values({
      providerId, categoryId: o.categoryId, titleI18n: { fr: o.title }, descriptionI18n: o.description ? { fr: o.description } : null,
      lat: o.lat, lng: o.lng, radiusM: o.radiusM, pricingModel: o.pricingModel, basePriceCentimes: o.basePriceCentimes, recurringAllowed: o.recurringAllowed,
    }).returning();
    return toOffer(r);
  }
  async getOffer(id: string) { const [r] = await this.db.select().from(s.offers).where(eq(s.offers.id, id)); return r && toOffer(r); }
  async setActive(id: string, active: boolean) { await this.db.update(s.offers).set({ active }).where(eq(s.offers.id, id)); }

  async candidates(q: SearchQuery & { box: Box }) {
    const rows = await this.db.select({ o: s.offers, p: s.providers }).from(s.offers)
      .innerJoin(s.providers, eq(s.providers.userId, s.offers.providerId))
      .where(and(eq(s.offers.active, true), gte(s.offers.lat, q.box.minLat), lte(s.offers.lat, q.box.maxLat), gte(s.offers.lng, q.box.minLng), lte(s.offers.lng, q.box.maxLng),
        q.categoryId ? eq(s.offers.categoryId, q.categoryId) : undefined))
      .limit(500);
    return rows.map(({ o, p }) => ({ ...toOffer(o), stats: { rating: p.ratingAvg, jobs: p.jobsCompleted, tier: p.kycTier, cancelRate: p.cancelRate, responseMin: 15, status: p.status } as ProviderStats }));
  }

  async rules(providerId: string): Promise<Rule[]> {
    return (await this.db.select().from(s.availability).where(eq(s.availability.providerId, providerId))).map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin }));
  }
  async setRules(providerId: string, rules: Rule[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(s.availability).where(eq(s.availability.providerId, providerId));
      if (rules.length) await tx.insert(s.availability).values(rules.map((r) => ({ providerId, ...r })));
    });
  }
  async busy(providerId: string, fromDate: string, days: number): Promise<Busy[]> {
    const rows = await this.db.execute<{ d: string; s: number; e: number }>(sql`
      select to_char(local_at, 'YYYY-MM-DD') as d,
             (extract(hour from local_at) * 60 + extract(minute from local_at))::int as s,
             (extract(hour from local_at) * 60 + extract(minute from local_at))::int + duration_min as e
      from (select scheduled_at at time zone 'Africa/Casablanca' as local_at, duration_min
            from booking.booking
            where provider_id = ${providerId} and scheduled_at is not null
              and state not in ('Declined','Expired','Cancelled','Refunded')
              and scheduled_at >= (${fromDate}::date - interval '1 day')
              and scheduled_at <  (${fromDate}::date + (${days} || ' days')::interval + interval '1 day')) x`);
    return [...rows].map((r) => ({ date: r.d, startMin: r.s, endMin: r.e }));
  }
  async categoryTier(id: string) { const [r] = await this.db.select({ t: s.categories.requiredTier }).from(s.categories).where(eq(s.categories.id, id)); return r?.t; }
  async providerTier(id: string) { const [r] = await this.db.select({ t: s.providers.kycTier }).from(s.providers).where(eq(s.providers.userId, id)); return r?.t ?? 0; }
}
