import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, I18nManager, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, loadTokens, post, saveTokens, setOnLogout, accessToken } from "./src/api";
import { DEFAULT_CENTER, WS_URL } from "./src/config";
import { DICT, LANGS, type Key, type Lang } from "./src/i18n";
import { C } from "./src/theme";

I18nManager.allowRTL(false); // direction is handled per-view so switching language needs no restart

/* ---------- language ---------- */
const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; rtl: boolean }>(null!);
const useT = () => useContext(LangCtx);
const CATS = [["cleaning", "✨"], ["diy", "🔧"], ["garden", "🌿"], ["tutoring", "📚"], ["errands", "🛒"], ["rides", "🚗"], ["pets", "🐾"], ["lending", "📦"]] as const;

interface Hit { id: string; title: string; categoryId: string; priceCentimes: number; pricingModel: string; distanceM: number; rating: number; jobs: number; tier: number; availableThisWeek: boolean; providerId: string }
interface Booking { id: string; state: string; mode: string; providerId: string | null; customerId: string; totalCentimes: number; paymentMethod: string }

export default function App() {
  const [lang, setLangState] = useState<Lang>("fr");
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    (async () => {
      const l = (await SecureStore.getItemAsync("lang")) as Lang | null; if (l) setLangState(l);
      setOnLogout(() => setAuthed(false));
      setAuthed(!!(await loadTokens())); setReady(true);
    })();
  }, []);
  const setLang = (l: Lang) => { setLangState(l); SecureStore.setItemAsync("lang", l); };
  const value = useMemo(() => ({ lang, setLang, rtl: lang !== "fr", t: (k: Key) => DICT[lang][k] ?? DICT.fr[k] }), [lang]);
  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={value}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.emerald, direction: value.rtl ? "rtl" : "ltr" }}>
          {!ready ? <ActivityIndicator color={C.saffron} style={{ flex: 1 }} /> : authed ? <Main onLogout={async () => { await saveTokens(null); setAuthed(false); }} /> : <Login onDone={() => setAuthed(true)} />}
        </View>
      </LangCtx.Provider>
    </SafeAreaProvider>
  );
}

/* ---------- login ---------- */
function Login({ onDone }: { onDone: () => void }) {
  const { t, lang, setLang } = useT(); const ins = useSafeAreaInsets();
  const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [dev, setDev] = useState("");
  const send = async () => {
    setBusy(true); setErr("");
    try { const r = await post("/v1/auth/otp/request", { phone }, false); setDev(r.devCode ?? ""); if (r.devCode) setCode(r.devCode); setStep("code"); }
    catch (e) { setErr(e instanceof ApiError && e.status === 400 ? t("badPhone") : e instanceof ApiError ? e.message : t("network")); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr("");
    try { const r = await post("/v1/auth/otp/verify", { phone, code }, false); await saveTokens(r); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? t("wrongCode") : t("network")); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, paddingTop: ins.top + 24, paddingHorizontal: 24 }}>
      <View style={st.logo}><Text style={st.logoTxt}>ح</Text></View>
      <Text style={st.h1}>Hawma</Text><Text style={st.tag}>{t("tag")}</Text>
      <LangSwitch />
      <Text style={st.lbl}>{t("phone")}</Text>
      <TextInput style={st.input} value={phone} onChangeText={setPhone} placeholder={t("phoneHint")} placeholderTextColor="#ffffff66" keyboardType="phone-pad" editable={step === "phone"} />
      {step === "code" && <>
        <Text style={st.lbl}>{t("code")}</Text>
        <TextInput style={st.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
        {!!dev && <Text style={st.dev}>{t("codeSentDev")} {dev}</Text>}
      </>}
      {!!err && <Text style={st.err}>{err}</Text>}
      <Btn label={step === "phone" ? t("sendCode") : t("verify")} onPress={step === "phone" ? send : verify} busy={busy} disabled={step === "phone" ? phone.length < 8 : code.length !== 6} dark />
    </KeyboardAvoidingView>
  );
}

function LangSwitch() {
  const { lang, setLang } = useT();
  return <View style={st.langRow}>{LANGS.map((l) => <Pressable key={l.id} onPress={() => setLang(l.id)} style={[st.langBtn, lang === l.id && { backgroundColor: C.saffron }]}><Text style={{ color: lang === l.id ? C.emerald : "#fff", fontWeight: "700" }}>{l.label}</Text></Pressable>)}</View>;
}

/* ---------- main ---------- */
function Main({ onLogout }: { onLogout: () => void }) {
  const { t } = useT(); const ins = useSafeAreaInsets();
  const [tab, setTab] = useState<"home" | "bookings" | "profile">("home");
  const [where, setWhere] = useState(DEFAULT_CENTER); const [located, setLocated] = useState(false);
  const useMyLocation = async () => {
    const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({}); setWhere({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocated(true);
  };
  const tabs = [["home", "🏠", t("home")], ["bookings", "📋", t("bookings")], ["profile", "👤", t("profile")]] as const;
  return (
    <View style={{ flex: 1 }}>
      <View style={[st.header, { paddingTop: ins.top + 10 }]}><View style={st.logoSm}><Text style={{ color: C.emerald, fontSize: 20, fontWeight: "800" }}>ح</Text></View><Text style={st.headerTitle}>Hawma</Text></View>
      <View style={{ flex: 1, backgroundColor: C.sand }}>
        {tab === "home" && <Home where={where} />}
        {tab === "bookings" && <Bookings />}
        {tab === "profile" && <Profile onLogout={onLogout} located={located} useMyLocation={useMyLocation} />}
      </View>
      <View style={[st.tabs, { paddingBottom: Math.max(ins.bottom, 8) }]}>
        {tabs.map(([k, i, l]) => <Pressable key={k} style={st.tab} onPress={() => setTab(k)}><Text style={{ fontSize: 20, opacity: tab === k ? 1 : 0.5 }}>{i}</Text><Text style={{ fontSize: 11, color: tab === k ? C.saffron : "#ffffffaa", fontWeight: tab === k ? "700" : "500" }}>{l}</Text></Pressable>)}
      </View>
    </View>
  );
}

/* ---------- home ---------- */
function Home({ where }: { where: { lat: number; lng: number } }) {
  const { t } = useT();
  const [q, setQ] = useState(""); const [cat, setCat] = useState<string>("all"); const [hits, setHits] = useState<Hit[] | null>(null); const [busy, setBusy] = useState(false); const [sel, setSel] = useState<Hit | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try { const p = new URLSearchParams({ lat: String(where.lat), lng: String(where.lng), radiusM: "10000", limit: "30" }); if (cat !== "all") p.set("categoryId", cat); if (q.trim()) p.set("q", q.trim()); setHits(await api(`/v1/search?${p}`, { auth: false })); }
    catch { setHits([]); } finally { setBusy(false); }
  }, [where, cat, q]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 14, paddingBottom: 6 }}>
        <TextInput style={st.search} value={q} onChangeText={setQ} placeholder={t("search")} placeholderTextColor={C.mute} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {[["all", "✦"], ...CATS].map(([id, e]) => <Pressable key={id} onPress={() => setCat(id)} style={[st.chip, cat === id && st.chipOn]}><Text style={{ color: cat === id ? "#fff" : C.ink, fontWeight: "600" }}>{e} {id === "all" ? t("all") : t(`c_${id}` as Key)}</Text></Pressable>)}
        </ScrollView>
      </View>
      <FlatList data={hits ?? []} keyExtractor={(h) => h.id} contentContainerStyle={{ padding: 14, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}
        ListHeaderComponent={<Text style={st.h2}>{t("near")}</Text>}
        ListEmptyComponent={hits ? <Text style={st.empty}>{t("empty")}</Text> : <ActivityIndicator color={C.emerald} />}
        renderItem={({ item }) => <HitCard h={item} onPress={() => setSel(item)} />} />
      <Detail hit={sel} onClose={() => setSel(null)} />
    </View>
  );
}

function HitCard({ h, onPress }: { h: Hit; onPress: () => void }) {
  const { t } = useT(); const emoji = CATS.find((c) => c[0] === h.categoryId)?.[1] ?? "•";
  return (
    <Pressable onPress={onPress} style={st.card}>
      <View style={st.avatar}><Text style={{ fontSize: 24 }}>{emoji}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.cardTitle} numberOfLines={1}>{h.title}</Text>
        <Text style={st.meta}>⭐ {h.rating.toFixed(1)} ({h.jobs}) · 📍 {(h.distanceM / 1000).toFixed(1)} {t("km")}{h.tier >= 1 ? ` · ✔ ${t("verified")}` : ""}</Text>
        {h.availableThisWeek && <Text style={st.avail}>● {t("available")}</Text>}
      </View>
      <Text style={st.price}>{h.priceCentimes ? `${h.priceCentimes / 100}\n${t("mad")}` : t("free")}</Text>
    </Pressable>
  );
}

function Detail({ hit, onClose }: { hit: Hit | null; onClose: () => void }) {
  const { t } = useT(); const [busy, setBusy] = useState(false);
  const book = async () => {
    if (!hit) return; setBusy(true);
    try { await post("/v1/bookings", { mode: "catalogue", providerId: hit.providerId, totalCentimes: hit.priceCentimes, paymentMethod: "cash" }); Alert.alert(t("booked")); onClose(); }
    catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } finally { setBusy(false); }
  };
  return (
    <Modal visible={!!hit} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      {hit && <View style={st.sheet}>
        <View style={st.grab} /><Text style={st.sheetTitle}>{hit.title}</Text>
        <Text style={st.meta}>⭐ {hit.rating.toFixed(1)} ({hit.jobs}) · 📍 {(hit.distanceM / 1000).toFixed(1)} {t("km")}</Text>
        <View style={st.pill}><Text>💵 {t("cash")}</Text></View>
        <View style={st.pill}><Text>💰 {hit.priceCentimes ? `${hit.priceCentimes / 100} ${t("mad")}` : t("free")}</Text></View>
        <Btn label={t("book")} onPress={book} busy={busy} />
        <Btn label={t("back")} onPress={onClose} ghost />
      </View>}
    </Modal>
  );
}

/* ---------- bookings (with live updates over WebSocket) ---------- */
function Bookings() {
  const { t } = useT(); const [items, setItems] = useState<Booking[] | null>(null); const [busy, setBusy] = useState(false); const [live, setLive] = useState<Record<string, string>>({});
  const load = useCallback(async () => { setBusy(true); try { setItems(await api("/v1/bookings")); } catch { setItems([]); } finally { setBusy(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    const tok = accessToken(); if (!tok) return;
    const s = new WebSocket(WS_URL); ws.current = s;
    s.onopen = () => s.send(JSON.stringify({ t: "auth", token: tok }));
    s.onmessage = (e) => {
      try { const m = JSON.parse(String(e.data)); if (m.t === "msg" && m.data?.type?.startsWith?.("booking.")) { load(); } if (m.t === "msg" && m.data?.type === "provider.location") setLive((x) => ({ ...x, [m.ch]: new Date().toLocaleTimeString() })); } catch {}
    };
    return () => s.close();
  }, [load]);
  useEffect(() => { // subscribe to each booking channel once the list is known
    const s = ws.current; if (!s || s.readyState !== 1 || !items) return;
    for (const b of items) s.send(JSON.stringify({ t: "sub", ch: `booking:${b.id}` }));
  }, [items]);
  return (
    <FlatList data={items ?? []} keyExtractor={(b) => b.id} contentContainerStyle={{ padding: 14 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}
      ListEmptyComponent={items ? <Text style={st.empty}>{t("noBookings")}</Text> : <ActivityIndicator color={C.emerald} />}
      renderItem={({ item }) => (
        <View style={st.card}>
          <View style={{ flex: 1 }}>
            <Text style={st.cardTitle}>#{item.id.slice(0, 8)}</Text>
            <Text style={st.meta}>{item.totalCentimes / 100} {t("mad")} · {item.paymentMethod}</Text>
            {live[`booking:${item.id}`] && <Text style={st.avail}>📡 {t("liveOn")} {live[`booking:${item.id}`]}</Text>}
          </View>
          <View style={[st.badge, badgeStyle(item.state)]}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{t(`s_${item.state}` as Key)}</Text></View>
        </View>
      )} />
  );
}
const badgeStyle = (s: string) => ({ backgroundColor: ["Cancelled", "Declined", "Expired", "Disputed"].includes(s) ? C.terracotta : ["Settled", "Confirmed", "Completed"].includes(s) ? "#2f7d5b" : C.emerald });

/* ---------- profile ---------- */
function Profile({ onLogout, located, useMyLocation }: { onLogout: () => void; located: boolean; useMyLocation: () => void }) {
  const { t, lang, setLang } = useT(); const [me, setMe] = useState<{ phone: string } | null>(null);
  useEffect(() => { api("/v1/me").then(setMe).catch(() => {}); }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.h2}>{t("account")}</Text><View style={st.pill}><Text>📞 {me?.phone ?? "…"}</Text></View>
      <Text style={[st.h2, { marginTop: 18 }]}>{t("language")}</Text>
      <View style={[st.langRow, { backgroundColor: C.emerald }]}>{LANGS.map((l) => <Pressable key={l.id} onPress={() => setLang(l.id)} style={[st.langBtn, lang === l.id && { backgroundColor: C.saffron }]}><Text style={{ color: lang === l.id ? C.emerald : "#fff", fontWeight: "700" }}>{l.label}</Text></Pressable>)}</View>
      <Text style={[st.h2, { marginTop: 18 }]}>{t("location")}</Text>
      <View style={st.pill}><Text>📍 {located ? "GPS" : t("usingCenter")}</Text></View>
      <Btn label={t("useMyLocation")} onPress={useMyLocation} ghost />
      <Btn label={t("logout")} onPress={onLogout} danger />
    </ScrollView>
  );
}

/* ---------- ui bits ---------- */
function Btn({ label, onPress, busy, disabled, dark, ghost, danger }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; dark?: boolean; ghost?: boolean; danger?: boolean }) {
  const bg = ghost ? "transparent" : danger ? C.terracotta : dark ? C.saffron : C.emerald; const fg = ghost ? C.emerald : dark ? C.emerald : "#fff";
  return <Pressable disabled={busy || disabled} onPress={onPress} style={[st.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1, borderWidth: ghost ? 2 : 0, borderColor: C.emerald }]}>{busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: "800", fontSize: 16 }}>{label}</Text>}</Pressable>;
}

const st = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.saffron, alignItems: "center", justifyContent: "center" }, logoTxt: { fontSize: 38, fontWeight: "800", color: C.emerald },
  logoSm: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.saffron, alignItems: "center", justifyContent: "center" },
  h1: { color: "#fff", fontSize: 40, fontWeight: "800", marginTop: 18 }, tag: { color: C.saffron, fontSize: 18, marginTop: 2, marginBottom: 14 },
  lbl: { color: "#ffffffaa", marginTop: 18, marginBottom: 6, fontWeight: "600" }, input: { backgroundColor: "#ffffff1f", color: "#fff", borderRadius: 14, padding: 14, fontSize: 18 },
  err: { color: "#ffb4a2", marginTop: 12 }, dev: { color: C.saffron, marginTop: 8 },
  langRow: { flexDirection: "row", backgroundColor: "#ffffff1f", borderRadius: 99, padding: 3, alignSelf: "flex-start", marginBottom: 6 }, langBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  header: { backgroundColor: C.emerald, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }, headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  tabs: { flexDirection: "row", backgroundColor: C.emerald, paddingTop: 8 }, tab: { flex: 1, alignItems: "center", gap: 2 },
  search: { backgroundColor: C.card, borderRadius: 99, borderWidth: 1, borderColor: C.border, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15, color: C.ink },
  chip: { backgroundColor: C.card, borderRadius: 99, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8, marginEnd: 8 }, chipOn: { backgroundColor: C.emerald, borderColor: C.emerald },
  h2: { fontSize: 22, fontWeight: "800", color: C.emerald, marginVertical: 8 }, empty: { textAlign: "center", color: C.mute, marginTop: 30 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.border },
  avatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#f2b84b44", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "700", fontSize: 16, color: C.ink }, meta: { color: C.mute, fontSize: 12, marginTop: 3 }, avail: { color: "#2f7d5b", fontSize: 12, marginTop: 3, fontWeight: "600" },
  price: { color: C.emerald, fontWeight: "800", textAlign: "center", fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "#072a2388" }, sheet: { backgroundColor: C.sand, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 12 }, sheetTitle: { fontSize: 24, fontWeight: "800", color: C.emerald, marginBottom: 4 },
  pill: { backgroundColor: "#ece5d6", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 8 },
  btn: { borderRadius: 99, paddingVertical: 15, alignItems: "center", marginTop: 14 }, badge: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
});
