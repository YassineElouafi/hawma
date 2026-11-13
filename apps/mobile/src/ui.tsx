import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Dimensions, ScrollView, Animated, Easing, Modal, Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { Text } from "./text";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, SCENES, sceneOf, shadow, shadowSm } from "./theme";

/* ---------- Button ---------- */
type BtnVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export function Button({ label, onPress, variant = "primary", busy, disabled, icon, style, small }: { label: string; onPress: () => void; variant?: BtnVariant; busy?: boolean; disabled?: boolean; icon?: string; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const v = { primary: [C.ink, "#fff", C.ink], accent: [C.saffron, C.ink, C.saffron], outline: [C.card, C.ink, C.card], ghost: ["transparent", C.emerald, "transparent"], danger: [C.terracotta, "#fff", C.terracotta] }[variant];
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [{ backgroundColor: v[0], borderColor: v[2], borderWidth: 1, borderRadius: R.pill, paddingVertical: small ? 10 : 18, paddingHorizontal: small ? 18 : 26, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: disabled ? 0.45 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, variant === "outline" && shadowSm, style]}>
      {busy ? <ActivityIndicator color={v[1]} /> : <>{icon ? <Text style={{ fontSize: small ? 14 : 17 }}>{icon}</Text> : null}<Text style={{ color: v[1], fontWeight: "700", fontSize: small ? 13 : 16 }}>{label}</Text></>}
    </Pressable>
  );
}

/* ---------- Card / Badge / Avatar ---------- */
export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) => {
  const body = [{ backgroundColor: C.card, borderRadius: R.lg, padding: 16 }, shadowSm, style];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [...body, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>{children}</Pressable> : <View style={body}>{children}</View>;
};
const tone = { neutral: [C.hairline, C.mute], green: [C.greenSoft, C.green], red: [C.terracottaSoft, C.terracotta], amber: [C.amberSoft, C.amber], blue: [C.blueSoft, C.blue], violet: [C.violetSoft, C.violet], accent: [C.emeraldSoft, C.emerald] } as const;
export type Tone = keyof typeof tone;
export const Badge = ({ label, t = "neutral", dot }: { label: string; t?: Tone; dot?: boolean }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: tone[t][0], borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" }}>
    {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone[t][1] }} />}<Text style={{ color: tone[t][1], fontSize: 11.5, fontWeight: "700" }}>{label}</Text>
  </View>
);
export const stateTone = (s: string): Tone => (({ Requested: "amber", Offered: "amber", Accepted: "blue", EnRoute: "blue", Arrived: "blue", InProgress: "violet", Completed: "green", Confirmed: "green", Settled: "green", Disputed: "red", Cancelled: "red", Declined: "red", Expired: "neutral", Refunded: "amber" }) as Record<string, Tone>)[s] ?? "neutral";
const hues = ["#0f5c4d", "#2f6fe0", "#6c4fd6", "#d9552b", "#b7791f", "#1f8a8a", "#c2417a"];
export function Avatar({ id, label, size = 44, emoji }: { id: string; label?: string; size?: number; emoji?: string }) {
  const bg = hues[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: emoji ? C.saffronSoft : bg, alignItems: "center", justifyContent: "center" }}>{emoji ? <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.38 }}>{(label ?? id).slice(0, 2).toUpperCase()}</Text>}</View>;
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#0000000d", borderRadius: R.pill, padding: 4 }}>
      {options.map((o) => <Pressable key={o.id} onPress={() => onChange(o.id)} style={[{ flex: 1, paddingVertical: 11, borderRadius: R.pill, alignItems: "center" }, value === o.id && { backgroundColor: C.ink }]}><Text style={{ fontWeight: "700", fontSize: 13.5, color: value === o.id ? "#fff" : C.mute }}>{o.label}</Text></Pressable>)}
    </View>
  );
}

/* ---------- Field ---------- */
export function Field({ label, style, ...p }: TextInputProps & { label?: string }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <View style={{ marginTop: 14 }}>
      {label ? <Text style={{ color: C.mute, fontWeight: "700", fontSize: 12.5, marginBottom: 8, marginLeft: 8 }}>{label}</Text> : null}
      <TextInput {...p} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }} placeholderTextColor={C.faint}
        style={[{ backgroundColor: C.card, borderRadius: R.pill, borderWidth: 2, borderColor: focus ? C.ink : "transparent", paddingHorizontal: 22, paddingVertical: 16, fontSize: 17, color: C.ink, fontFamily: "PlusJakartaSans_600SemiBold" }, style]} />
    </View>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ w = "100%", h = 14, r = 8, style }: { w?: number | string; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.45)).current;
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(a, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true })])); l.start(); return () => l.stop(); }, [a]);
  return <Animated.View style={[{ width: w as number, height: h, borderRadius: r, backgroundColor: C.border, opacity: a }, style]} />;
}
export const CardSkeleton = () => <Card style={{ flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 10 }}><Skeleton w={52} h={52} r={16} /><View style={{ flex: 1, gap: 8 }}><Skeleton w="70%" h={14} /><Skeleton w="45%" h={11} /></View><Skeleton w={44} h={18} /></Card>;

/* ---------- Empty state ---------- */
export const Empty = ({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) => (
  <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 30 }}>
    <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: C.emeraldSoft, alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Text style={{ fontSize: 30 }}>{emoji}</Text></View>
    <Text style={{ fontSize: 17, fontWeight: "800", color: C.ink, textAlign: "center" }}>{title}</Text>{hint ? <Text style={{ color: C.mute, textAlign: "center", marginTop: 6, lineHeight: 20 }}>{hint}</Text> : null}
  </View>
);

/* ---------- Section title / list row ---------- */
export const SectionTitle = ({ title, right }: { title: string; right?: string }) => <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, marginBottom: 10 }}><Text style={{ fontSize: 19, fontWeight: "800", color: C.ink }}>{title}</Text>{right ? <Text style={{ color: C.mute, fontSize: 12.5 }}>{right}</Text> : null}</View>;
export const Row = ({ emoji, label, value, onPress, danger }: { emoji: string; label: string; value?: string; onPress?: () => void; danger?: boolean }) => (
  <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}>
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: danger ? C.terracottaSoft : C.emeraldSoft, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 17 }}>{emoji}</Text></View>
    <Text style={{ flex: 1, fontWeight: "600", color: danger ? C.terracotta : C.ink, fontSize: 15.5 }}>{label}</Text>{value ? <Text style={{ color: C.mute }}>{value}</Text> : null}{onPress && !danger ? <Text style={{ color: C.faint, fontSize: 18 }}>›</Text> : null}
  </Pressable>
);
export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />;

/* ---------- Bottom sheet ---------- */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const y = useRef(new Animated.Value(400)).current;
  useEffect(() => { if (visible) { y.setValue(400); Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start(); } }, [visible, y]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#11121488" }} onPress={onClose} />
      <Animated.View style={[{ backgroundColor: C.bg, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 34, transform: [{ translateY: y }] }, shadow]}>
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 14 }} /><ScrollView style={{ maxHeight: Dimensions.get("window").height * 0.82 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
}

/* ---------- Fade-in wrapper for list items ---------- */
export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [a, delay]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

/* ---------- Stepper (booking progress) ---------- */
const STEPS = ["Requested", "Accepted", "EnRoute", "Arrived", "InProgress", "Completed"];
export function Stepper({ state }: { state: string }) {
  const i = Math.max(0, STEPS.indexOf(state === "Confirmed" || state === "Settled" ? "Completed" : state));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
      {STEPS.map((_, n) => (
        <React.Fragment key={n}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: n <= i ? C.ink : "#0000001f" }} />
          {n < STEPS.length - 1 && <View style={{ flex: 1, height: 2, backgroundColor: n < i ? C.ink : "#0000001f" }} />}
        </React.Fragment>
      ))}
    </View>
  );
}

/* ---------- Glide extras ---------- */
export function SceneArt({ cat, height, radius = 28, emojiSize = 90, children, style }: { cat: string; height?: number; radius?: number; emojiSize?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const sc = sceneOf(cat); const f = useRef(new Animated.Value(0)).current;
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(f, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(f, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: true })])); l.start(); return () => l.stop(); }, [f]);
  return (
    <View style={[{ height, borderRadius: radius, overflow: "hidden", backgroundColor: sc.from }, style]}>
      <LinearGradient colors={[sc.from, sc.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", top: -40, right: -30, width: 190, height: 190, borderRadius: 95, backgroundColor: "#ffffff30" }} />
      <Animated.Text style={{ position: "absolute", top: "8%", right: "6%", fontSize: emojiSize, transform: [{ translateY: f.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }, { rotate: "-8deg" }] }}>{sc.emoji}</Animated.Text>
      <LinearGradient colors={["transparent", "#00000099"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" }} />
      {children}
    </View>
  );
}
export const Chip = ({ label, on, onPress, icon }: { label: string; on?: boolean; onPress: () => void; icon?: string }) => (
  <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 20, paddingVertical: 13, borderRadius: R.pill, backgroundColor: on ? C.ink : C.card, opacity: pressed ? 0.85 : 1, ...(on ? {} : shadowSm) })}>
    <Text style={{ fontWeight: "700", fontSize: 14.5, color: on ? "#fff" : C.ink }}>{icon ? icon + "  " : ""}{label}</Text>
  </Pressable>
);
export const RatingPill = ({ value, count, dark }: { value: number; count?: number; dark?: boolean }) => (
  <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: dark ? "#ffffff2e" : "#0000000d" }}>
    <Text style={{ fontSize: 13, color: C.saffron }}>★</Text><Text style={{ fontWeight: "800", fontSize: 13, color: dark ? "#fff" : C.ink }}>{value.toFixed(1)}{count != null ? <Text style={{ fontWeight: "500", color: dark ? "#ffffffbf" : C.mute }}> ({count})</Text> : null}</Text>
  </View>
);
export const ArrowDot = ({ dark, size = 44 }: { dark?: boolean; size?: number }) => <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? "#fff" : C.ink, alignItems: "center", justifyContent: "center" }}><Text style={{ color: dark ? C.ink : "#fff", fontSize: size * 0.46, fontWeight: "700" }}>›</Text></View>;
export const UnderLink = ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable onPress={onPress}><Text style={{ fontWeight: "700", fontSize: 14, color: C.ink, textDecorationLine: "underline" }}>{label}</Text></Pressable>;
export function FloatingTabs<T extends string>({ items, value, onChange, bottom }: { items: [T, string, string][]; value: T; onChange: (v: T) => void; bottom: number }) {
  return (
    <View style={[{ position: "absolute", left: 20, right: 20, bottom: Math.max(bottom, 12) + 6, flexDirection: "row", backgroundColor: C.ink, borderRadius: R.pill, padding: 7, gap: 4 }, shadow]}>
      {items.map(([k, i, l]) => (
        <Pressable key={k} accessibilityRole="button" accessibilityLabel={l} accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={{ flex: value === k ? 1.6 : 1, height: 54, borderRadius: R.pill, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: value === k ? "#fff" : "transparent" }}>
          <Text style={{ fontSize: 21, opacity: value === k ? 1 : 0.7 }}>{i}</Text>{value === k && <Text style={{ fontSize: 13.5, fontWeight: "800", color: C.ink }}>{l}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
export { SCENES };
