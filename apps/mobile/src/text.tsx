import React from "react";
import { StyleSheet, Text as RNText, type TextProps } from "react-native";

/** Drop-in Text that maps fontWeight to the bundled Plus Jakarta Sans (Latin) or Cairo (Arabic script) faces. */
let arabic = false;
export const setArabicFont = (v: boolean) => { arabic = v; };
const LATIN: Record<string, string> = { "400": "PlusJakartaSans_400Regular", "500": "PlusJakartaSans_500Medium", "600": "PlusJakartaSans_600SemiBold", "700": "PlusJakartaSans_700Bold", "800": "PlusJakartaSans_800ExtraBold" };
const ARAB: Record<string, string> = { "400": "Cairo_400Regular", "500": "Cairo_500Medium", "600": "Cairo_600SemiBold", "700": "Cairo_700Bold", "800": "Cairo_800ExtraBold" };
const pick = (w: unknown) => { const n = w === "bold" ? 700 : w === "normal" || w == null ? 400 : Number(w); return String(n >= 800 ? 800 : n >= 700 ? 700 : n >= 600 ? 600 : n >= 500 ? 500 : 400); };
export function Text({ style, ...p }: TextProps) {
  const f = StyleSheet.flatten(style) ?? {};
  return <RNText {...p} style={[style, { fontFamily: (arabic ? ARAB : LATIN)[pick(f.fontWeight)], fontWeight: "normal" }]} />;
}
