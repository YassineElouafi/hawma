import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { C, R, shadow, shadowSm } from "./theme";

/* ---------- Button ---------- */
type BtnVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export function Button({ label, onPress, variant = "primary", busy, disabled, icon, style, small }: { label: string; onPress: () => void; variant?: BtnVariant; busy?: boolean; disabled?: boolean; icon?: string; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const v = { primary: [C.emerald, "#fff", C.emerald], accent: [C.saffron, C.emerald, C.saffron], outline: [C.card, C.emerald, C.border], ghost: ["transparent", C.emerald, "transparent"], danger: [C.terracotta, "#fff", C.terracotta] }[variant];
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [{ backgroundColor: v[0], borderColor: v[2], borderWidth: 1, borderRadius: R.pill, paddingVertical: small ? 9 : 15, paddingHorizontal: small ? 16 : 22, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: disabled ? 0.45 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, variant === "primary" && shadowSm, style]}>
      {busy ? <ActivityIndicator color={v[1]} /> : <>{icon ? <Text style={{ fontSize: small ? 14 : 17 }}>{icon}</Text> : null}<Text style={{ color: v[1], fontWeight: "700", fontSize: small ? 13 : 16 }}>{label}</Text></>}
    </Pressable>
  );
}

/* ---------- Card / Badge / Avatar ---------- */
export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) => {
  const body = [{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.hairline, padding: 14 }, shadowSm, style];
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
  return <View style={{ width: size, height: size, borderRadius: size * 0.34, backgroundColor: emoji ? C.saffronSoft : bg, alignItems: "center", justifyContent: "center" }}>{emoji ? <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.38 }}>{(label ?? id).slice(0, 2).toUpperCase()}</Text>}</View>;
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: C.hairline, borderRadius: R.pill, padding: 3 }}>
      {options.map((o) => <Pressable key={o.id} onPress={() => onChange(o.id)} style={[{ flex: 1, paddingVertical: 8, borderRadius: R.pill, alignItems: "center" }, value === o.id && { backgroundColor: C.card, ...shadowSm }]}><Text style={{ fontWeight: "700", fontSize: 13, color: value === o.id ? C.emerald : C.mute }}>{o.label}</Text></Pressable>)}
    </View>
  );
}

/* ---------- Field ---------- */
export function Field({ label, style, ...p }: TextInputProps & { label?: string }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <View style={{ marginTop: 14 }}>
      {label ? <Text style={{ color: C.mute, fontWeight: "600", fontSize: 12.5, marginBottom: 6 }}>{label}</Text> : null}
      <TextInput {...p} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }} placeholderTextColor={C.faint}
        style={[{ backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: focus ? C.emerald2 : C.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: C.ink }, style]} />
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
      <Pressable style={{ flex: 1, backgroundColor: "#0b3d3377" }} onPress={onClose} />
      <Animated.View style={[{ backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, transform: [{ translateY: y }] }, shadow]}>
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 14 }} />{children}
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
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: n <= i ? C.emerald2 : C.border }} />
          {n < STEPS.length - 1 && <View style={{ flex: 1, height: 2, backgroundColor: n < i ? C.emerald2 : C.border }} />}
        </React.Fragment>
      ))}
    </View>
  );
}
