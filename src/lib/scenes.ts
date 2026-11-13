/** Image-led cards without photos: every category gets a rich "scene" (gradient + sun + illustration). */
export interface Scene { from: string; to: string; glow: string; emoji: string; label: string }
export const SCENES: Record<string, Scene> = {
  cleaning: { from: "#0b6f7a", to: "#86e0c9", glow: "#d8fff3", emoji: "✨", label: "cleaning" },
  diy:      { from: "#26346b", to: "#8fa9ee", glow: "#e4ebff", emoji: "🔧", label: "diy" },
  garden:   { from: "#175c34", to: "#b0de6c", glow: "#f1ffd6", emoji: "🌿", label: "garden" },
  tutoring: { from: "#4b2f99", to: "#c9b0ff", glow: "#f1e9ff", emoji: "📚", label: "tutoring" },
  errands:  { from: "#b9400c", to: "#fdc080", glow: "#fff0dc", emoji: "🛒", label: "errands" },
  rides:    { from: "#101827", to: "#6f8199", glow: "#dbe6f5", emoji: "🚗", label: "rides" },
  pets:     { from: "#8f3512", to: "#fcd84f", glow: "#fff6c9", emoji: "🐾", label: "pets" },
  lending:  { from: "#0f4743", to: "#62e8d8", glow: "#d5fffa", emoji: "📦", label: "lending" },
};
export const sceneOf = (cat: string): Scene => SCENES[cat] ?? { from: "#26302d", to: "#8fa39c", glow: "#e9f1ee", emoji: "•", label: cat };
