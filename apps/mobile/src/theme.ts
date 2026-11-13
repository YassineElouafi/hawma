// Glide palette: light-grey canvas, white cards, near-black primary. `emerald*` keys keep their names but now carry ink/accent so every screen follows.
export const C = {
  bg: "#f3f4f5", card: "#ffffff", border: "#e3e5e7", hairline: "#ebedee", ink: "#111214", mute: "#5d6268", faint: "#9aa0a6",
  emerald: "#111214", emerald2: "#0b5d4b", emeraldSoft: "#e9eaec", saffron: "#f2b84b", saffronSoft: "#fdf1d6", terracotta: "#b8401a", terracottaSoft: "#fbe9e2",
  green: "#0f6b45", greenSoft: "#e1f4ea", blue: "#2f5fc4", blueSoft: "#e4edfc", violet: "#6c4fd6", violetSoft: "#ece7fb", amber: "#8a5a00", amberSoft: "#fdf1d6", white: "#ffffff", accent: "#0b5d4b", accentSoft: "#e3f1ed",
};
export const R = { sm: 12, md: 20, lg: 28, xl: 34, pill: 999 };
export const shadow = { shadowColor: "#111214", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 };
export const shadowSm = { shadowColor: "#111214", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 };
export const SCENES: Record<string, { from: string; to: string; emoji: string }> = {
  cleaning: { from: "#0b6f7a", to: "#86e0c9", emoji: "✨" }, diy: { from: "#26346b", to: "#8fa9ee", emoji: "🔧" }, garden: { from: "#175c34", to: "#b0de6c", emoji: "🌿" }, tutoring: { from: "#4b2f99", to: "#c9b0ff", emoji: "📚" },
  errands: { from: "#b9400c", to: "#fdc080", emoji: "🛒" }, rides: { from: "#101827", to: "#6f8199", emoji: "🚗" }, pets: { from: "#8f3512", to: "#fcd84f", emoji: "🐾" }, lending: { from: "#0f4743", to: "#62e8d8", emoji: "📦" },
};
export const sceneOf = (cat: string) => SCENES[cat] ?? { from: "#26302d", to: "#8fa39c", emoji: "•" };
