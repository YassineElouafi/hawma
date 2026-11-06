export type Cat = "diy" | "clean" | "garden" | "tutor" | "errand" | "ride" | "pet" | "lend";
export const CATS: { id: Cat; emoji: string }[] = [
  { id: "diy", emoji: "🔧" }, { id: "clean", emoji: "✨" }, { id: "garden", emoji: "🌿" }, { id: "tutor", emoji: "📚" },
  { id: "errand", emoji: "🛒" }, { id: "ride", emoji: "🚗" }, { id: "pet", emoji: "🐾" }, { id: "lend", emoji: "📦" },
];
export const HOODS: Record<string, [number, number]> = {
  Maarif: [33.5883, -7.635], "Ain Diab": [33.595, -7.67], Californie: [33.559, -7.636], Gauthier: [33.59, -7.62],
  Oasis: [33.556, -7.613], Agdal: [33.9916, -6.8498], Gueliz: [31.634, -8.01], "Hay Riad": [33.957, -6.875],
};
export interface Listing {
  id: number; who: string; av: string; cat: Cat; title: string; desc: string; price: number; per: string;
  rating: number; n: number; dx: number; dy: number; ver: boolean; sup: boolean; pay: "cash" | "mobile"; weekly: boolean; mine?: boolean;
}
export const SEED: Listing[] = [
  { id: 1, who: "Amina K.", av: "👩", cat: "clean", title: "Ménage & repassage", desc: "Appartement, 3 h minimum. Produits fournis.", price: 120, per: "per_3h", rating: 4.9, n: 41, dx: .004, dy: .003, ver: true, sup: true, pay: "cash", weekly: true },
  { id: 2, who: "Redouane M.", av: "👨‍🏫", cat: "tutor", title: "Maths lycée / bac", desc: "Prof de maths, cours à domicile ou en ligne.", price: 100, per: "per_h", rating: 4.8, n: 27, dx: -.006, dy: .002, ver: true, sup: true, pay: "mobile", weekly: true },
  { id: 3, who: "Omar S.", av: "👨‍🔧", cat: "diy", title: "Plomberie & électricité", desc: "Fuites, prises, lustres, chauffe-eau. Déplacement inclus.", price: 150, per: "per_visit", rating: 4.6, n: 18, dx: .009, dy: -.004, ver: true, sup: false, pay: "cash", weekly: false },
  { id: 4, who: "Salma B.", av: "👩‍🌾", cat: "garden", title: "Entretien de jardin", desc: "Tonte, taille, arrosage.", price: 200, per: "per_visit", rating: 4.7, n: 12, dx: -.003, dy: -.008, ver: true, sup: false, pay: "cash", weekly: true },
  { id: 5, who: "Youssef A.", av: "🧑", cat: "errand", title: "Courses & colis", desc: "Je récupère tes courses ou colis en scooter.", price: 30, per: "per_errand", rating: 4.5, n: 64, dx: .012, dy: .006, ver: true, sup: true, pay: "mobile", weekly: false },
  { id: 6, who: "Khadija R.", av: "👩‍⚕️", cat: "pet", title: "Garde de chats & chiens", desc: "Promenade et garde à domicile.", price: 80, per: "per_day", rating: 4.9, n: 9, dx: -.011, dy: .009, ver: false, sup: false, pay: "cash", weekly: false },
  { id: 7, who: "Hicham T.", av: "👨", cat: "lend", title: "Prêt perceuse & échelle", desc: "Je prête mon matériel, caution symbolique.", price: 0, per: "", rating: 4.8, n: 15, dx: .002, dy: -.012, ver: true, sup: false, pay: "cash", weekly: false },
  { id: 8, who: "Nadia O.", av: "👩‍🏫", cat: "tutor", title: "Français & anglais enfants", desc: "Soutien scolaire primaire/collège.", price: 80, per: "per_h", rating: 4.7, n: 22, dx: -.014, dy: -.002, ver: true, sup: false, pay: "mobile", weekly: true },
  { id: 9, who: "Mehdi L.", av: "🧔", cat: "ride", title: "Trajet aéroport Mohammed V", desc: "Voiture confortable, 3 passagers max.", price: 250, per: "per_trip", rating: 4.6, n: 33, dx: .015, dy: .01, ver: true, sup: true, pay: "cash", weekly: false },
];
