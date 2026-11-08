import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as s from "./schema";

/** Demo marketplace data for pilots/demos. Idempotent (keyed by fake +2125000000NN phones). Never runs implicitly. */
const DEMO = [
  { n: 1, name: "Amina K.", cat: "cleaning", title: "Ménage & repassage", d: "Appartement, 3 h minimum. Produits fournis.", price: 12000, rating: 4.9, jobs: 41, dx: .004, dy: .003, tier: 2 },
  { n: 2, name: "Redouane M.", cat: "tutoring", title: "Maths lycée / bac", d: "Prof de maths, cours à domicile ou en ligne.", price: 10000, rating: 4.8, jobs: 27, dx: -.006, dy: .002, tier: 1 },
  { n: 3, name: "Omar S.", cat: "diy", title: "Plomberie & électricité", d: "Fuites, prises, lustres, chauffe-eau.", price: 15000, rating: 4.6, jobs: 18, dx: .009, dy: -.004, tier: 2 },
  { n: 4, name: "Salma B.", cat: "garden", title: "Entretien de jardin", d: "Tonte, taille, arrosage.", price: 20000, rating: 4.7, jobs: 12, dx: -.003, dy: -.008, tier: 1 },
  { n: 5, name: "Youssef A.", cat: "errands", title: "Courses & colis en scooter", d: "Je récupère tes courses ou colis.", price: 3000, rating: 4.5, jobs: 64, dx: .012, dy: .006, tier: 1 },
  { n: 6, name: "Nadia O.", cat: "tutoring", title: "Français & anglais enfants", d: "Soutien scolaire primaire/collège.", price: 8000, rating: 4.7, jobs: 22, dx: -.014, dy: -.002, tier: 1 },
  { n: 7, name: "Hicham T.", cat: "lending", title: "Prêt perceuse & échelle", d: "Je prête mon matériel, caution symbolique.", price: 0, rating: 4.8, jobs: 15, dx: .002, dy: -.012, tier: 1 },
];
export async function seedDemo(db: PostgresJsDatabase, center = { lat: 33.5883, lng: -7.635 }) {
  let created = 0;
  for (const p of DEMO) {
    const phone = `+2125000000${String(p.n).padStart(2, "0")}`;
    const [existing] = await db.select().from(s.users).where(eq(s.users.phone, phone));
    if (existing) continue;
    const [u] = await db.insert(s.users).values({ phone, displayName: p.name }).returning();
    await db.insert(s.providers).values({ userId: u.id, kycTier: p.tier, status: "active", ratingAvg: p.rating, jobsCompleted: p.jobs, lat: center.lat + p.dy, lng: center.lng + p.dx });
    await db.insert(s.offers).values({ providerId: u.id, categoryId: p.cat, titleI18n: { fr: p.title }, descriptionI18n: { fr: p.d }, lat: center.lat + p.dy, lng: center.lng + p.dx, radiusM: 8000, pricingModel: p.cat === "tutoring" ? "hourly" : "fixed", basePriceCentimes: p.price, recurringAllowed: p.cat === "cleaning" || p.cat === "tutoring" });
    await db.insert(s.availability).values([1, 2, 3, 4, 5, 6].map((weekday) => ({ providerId: u.id, weekday, startMin: 540, endMin: 1080 })));
    created++;
  }
  return { created, total: DEMO.length };
}
