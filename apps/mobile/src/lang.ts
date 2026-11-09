import { createContext, useContext } from "react";
import type { Key, Lang } from "./i18n";

export const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; rtl: boolean }>(null!);
export const useT = () => useContext(LangCtx);
export const CATS = [["cleaning", "✨"], ["diy", "🔧"], ["garden", "🌿"], ["tutoring", "📚"], ["errands", "🛒"], ["rides", "🚗"], ["pets", "🐾"], ["lending", "📦"]] as const;
export const emojiOf = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? "•";
