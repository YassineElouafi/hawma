import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, FlatList, I18nManager, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, loadTokens, post, saveTokens, setOnLogout, accessToken } from "./src/api";
import { DEFAULT_CENTER, WS_URL } from "./src/config";
import { DICT, LANGS, type Key, type Lang } from "./src/i18n";
import { C, R, shadow } from "./src/theme";
import { distanceM, etaMin } from "./src/geo";
import { Avatar, Badge, Button, Card, CardSkeleton, Divider, Empty, FadeIn, Field, Row, SectionTitle, Segmented, Sheet, Stepper, stateTone } from "./src/ui";

I18nManager.allowRTL(false); // direction is handled per-view so switching language needs no restart

import { CATS, LangCtx, emojiOf, useT } from "./src/lang";
import { ProviderOffers, ProviderToday } from "./src/provider";

interface Hit { id: string; title: string; categoryId: string; priceCentimes: number; pricingModel: string; distanceM: number; rating: number; jobs: number; tier: number; availableThisWeek: boolean; providerId: string }
interface Booking { id: string; state: string; mode: string; providerId: string | null; customerId: string; totalCentimes: number; paymentMethod: string; lat?: number; lng?: number; createdAt?: string }
interface Live { lat: number; lng: number; at: number }
const ACTIVE = ["Requested", "Offered", "Accepted", "EnRoute", "Arrived", "InProgress"];

export default function App() {
  const [lang, setLangState] = useState<Lang>("fr"); const [ready, setReady] = useState(false); const [authed, setAuthed] = useState(false);
  useEffect(() => { (async () => { const l = (await SecureStore.getItemAsync("lang")) as Lang | null; if (l) setLangState(l); setOnLogout(() => setAuthed(false)); setAuthed(!!(await loadTokens())); setReady(true); })(); }, []);
  const setLang = (l: Lang) => { setLangState(l); SecureStore.setItemAsync("lang", l); };
  const value = useMemo(() => ({ lang, setLang, rtl: lang !== "fr", t: (k: Key) => DICT[lang][k] ?? DICT.fr[k] }), [lang]);
  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={value}>
        <View style={{ flex: 1, backgroundColor: authed ? C.bg : C.emerald, direction: value.rtl ? "rtl" : "ltr" }}>
          <StatusBar style={authed ? "dark" : "light"} />
          {!ready ? null : authed ? <Main onLogout={async () => { await saveTokens(null); setAuthed(false); }} /> : <Login onDone={() => setAuthed(true)} />}
        </View>
      </LangCtx.Provider>
    </SafeAreaProvider>
  );
}

/* ---------- login ---------- */
function LangPills({ onDark }: { onDark?: boolean }) {
  const { lang, setLang } = useT();
  return <View style={{ flexDirection: "row", gap: 6 }}>{LANGS.map((l) => <Pressable key={l.id} onPress={() => setLang(l.id)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.pill, backgroundColor: lang === l.id ? C.saffron : onDark ? "#ffffff22" : C.hairline }}><Text style={{ fontWeight: "700", fontSize: 13, color: lang === l.id ? C.emerald : onDark ? "#fff" : C.mute }}>{l.label}</Text></Pressable>)}</View>;
}

function Login({ onDone }: { onDone: () => void }) {
  const { t } = useT(); const ins = useSafeAreaInsets();
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ paddingTop: ins.top + 20, paddingHorizontal: 24, paddingBottom: 36, flex: 0.9, justifyContent: "space-between" }}>
        <LangPills onDark />
        <View>
          <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: C.saffron, alignItems: "center", justifyContent: "center", ...shadow }}><Text style={{ fontSize: 40, fontWeight: "800", color: C.emerald }}>ح</Text></View>
          <Text style={{ color: "#fff", fontSize: 44, fontWeight: "800", marginTop: 20, letterSpacing: -1 }}>Hawma</Text>
          <Text style={{ color: C.saffron, fontSize: 19, marginTop: 4, fontWeight: "600" }}>{t("tag")}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(ins.bottom, 20) + 10 }}>
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 8 }} />
        <Field label={t("phone")} value={phone} onChangeText={setPhone} placeholder={t("phoneHint")} keyboardType="phone-pad" editable={step === "phone"} />
        {step === "code" && <>
          <Field label={t("code")} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} style={{ letterSpacing: 6, textAlign: "center", fontSize: 22, fontWeight: "700" }} />
          {!!dev && <View style={{ marginTop: 10 }}><Badge label={`${t("codeSentDev")} ${dev}`} t="amber" /></View>}
        </>}
        {!!err && <Text style={{ color: C.terracotta, marginTop: 12, fontWeight: "600" }}>{err}</Text>}
        <Button label={step === "phone" ? t("sendCode") : t("verify")} onPress={step === "phone" ? send : verify} busy={busy} disabled={step === "phone" ? phone.length < 8 : code.length !== 6} style={{ marginTop: 20 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- main ---------- */
type Tab = "home" | "bookings" | "profile" | "today" | "offers";
function Main({ onLogout }: { onLogout: () => void }) {
  const { t } = useT(); const ins = useSafeAreaInsets();
  const [mode, setMode] = useState<"customer" | "provider">("customer");
  useEffect(() => { SecureStore.getItemAsync("mode").then((m) => { if (m === "provider") { setMode("provider"); setTab("today"); } }); }, []); // eslint-disable-line
  const switchMode = (m: "customer" | "provider") => { setMode(m); SecureStore.setItemAsync("mode", m); setTab(m === "provider" ? "today" : "home"); };
  const [tab, setTab] = useState<Tab>("home"); const [where, setWhere] = useState(DEFAULT_CENTER); const [located, setLocated] = useState(false);
  const useMyLocation = async () => { const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== "granted") return; const pos = await Location.getCurrentPositionAsync({}); setWhere({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocated(true); };
  const tabs: [Tab, string, string][] = mode === "provider" ? [["today", "📅", t("today")], ["offers", "🛠️", t("offers")], ["profile", "👤", t("profile")]] : [["home", "🏠", t("home")], ["bookings", "🧾", t("bookings")], ["profile", "👤", t("profile")]];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "today" && <ProviderToday insetTop={ins.top} />}
        {tab === "offers" && <ProviderOffers insetTop={ins.top} />}
        {tab === "home" && <Home where={where} located={located} insetTop={ins.top} />}
        {tab === "bookings" && <Bookings insetTop={ins.top} />}
        {tab === "profile" && <Profile insetTop={ins.top} mode={mode} onSwitch={switchMode} onLogout={onLogout} located={located} useMyLocation={useMyLocation} />}
      </View>
      <View style={[{ flexDirection: "row", backgroundColor: C.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 8, paddingBottom: Math.max(ins.bottom, 10) }]}>
        {tabs.map(([k, i, l]) => (
          <Pressable key={k} style={{ flex: 1, alignItems: "center", gap: 3 }} onPress={() => setTab(k)}>
            <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: R.pill, backgroundColor: tab === k ? C.emeraldSoft : "transparent" }}><Text style={{ fontSize: 20, opacity: tab === k ? 1 : 0.55 }}>{i}</Text></View>
            <Text style={{ fontSize: 11, fontWeight: tab === k ? "800" : "600", color: tab === k ? C.emerald : C.faint }}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const LargeTitle = ({ top, title, sub, right }: { top: number; title: string; sub?: string; right?: React.ReactNode }) => (
  <View style={{ paddingTop: top + 14, paddingHorizontal: 20, paddingBottom: 6, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
    <View style={{ flex: 1 }}>{sub ? <Text style={{ color: C.mute, fontWeight: "600", fontSize: 14 }}>{sub}</Text> : null}<Text style={{ fontSize: 32, fontWeight: "800", color: C.ink, letterSpacing: -0.8 }}>{title}</Text></View>{right}
  </View>
);

/* ---------- home ---------- */
function UrgentBanner({ where }: { where: { lat: number; lng: number } }) {
  const { t } = useT(); const [open, setOpen] = useState(false); const [cat, setCat] = useState("errands"); const [price, setPrice] = useState("30"); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await post("/v1/dispatch-requests", { lat: where.lat, lng: where.lng, categoryId: cat, totalCentimes: Math.round((Number(price) || 0) * 100), paymentMethod: "cash" }); setOpen(false); Alert.alert(t("urgentSent")); }
    catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } finally { setBusy(false); }
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => ({ marginTop: 14, borderRadius: R.lg, backgroundColor: C.emerald, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.9 : 1 })}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.saffron, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 24 }}>⚡</Text></View>
        <View style={{ flex: 1 }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{t("urgent")}</Text><Text style={{ color: "#ffffffb0", marginTop: 2, fontSize: 12.5 }}>{t("urgentHint")}</Text></View><Text style={{ color: C.saffron, fontSize: 22 }}>›</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>⚡ {t("urgent")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>{CATS.filter(([id]) => ["errands", "rides", "diy", "pets"].includes(id)).map(([id, e]) => <Pressable key={id} onPress={() => setCat(id)} style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.pill, backgroundColor: cat === id ? C.emerald : C.card, borderWidth: 1, borderColor: cat === id ? C.emerald : C.border }}><Text style={{ fontWeight: "700", color: cat === id ? "#fff" : C.ink }}>{e} {t(`c_${id}` as Key)}</Text></Pressable>)}</ScrollView>
        <Field label={t("priceMad")} value={price} onChangeText={setPrice} keyboardType="numeric" />
        <Button label={t("requestNow")} icon="⚡" onPress={go} busy={busy} style={{ marginTop: 18 }} />
      </Sheet>
    </>
  );
}

function Home({ where, located, insetTop }: { where: { lat: number; lng: number }; located: boolean; insetTop: number }) {
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
      <FlatList data={hits ?? []} keyExtractor={(h) => h.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={busy && !!hits} onRefresh={load} tintColor={C.emerald} />}
        ListHeaderComponent={<>
          <LargeTitle top={insetTop} sub={t("hello")} title={t("findHelp")} right={<View style={{ backgroundColor: C.emeraldSoft, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 6 }}><Text style={{ color: C.emerald, fontWeight: "700", fontSize: 12.5 }}>📍 {located ? "GPS" : "Maarif"}</Text></View>} />
          <View style={{ marginHorizontal: 4, marginTop: 10, flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 16 }}>🔍</Text><TextInput style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 10, fontSize: 15.5, color: C.ink }} value={q} onChangeText={setQ} placeholder={t("search")} placeholderTextColor={C.faint} />
            {!!q && <Pressable onPress={() => setQ("")}><Text style={{ color: C.faint, fontSize: 16 }}>✕</Text></Pressable>}
          </View>
          <UrgentBanner where={where} />
          <SectionTitle title={t("categories")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
            {[["all", "✦"], ...CATS].map(([id, e]) => {
              const on = cat === id;
              return <Pressable key={id} onPress={() => setCat(id)} style={{ width: "25%", padding: 4 }}>
                <View style={{ alignItems: "center", paddingVertical: 12, borderRadius: R.lg, backgroundColor: on ? C.emerald : C.card, borderWidth: 1, borderColor: on ? C.emerald : C.hairline }}>
                  <Text style={{ fontSize: 24 }}>{e}</Text><Text numberOfLines={1} style={{ marginTop: 6, fontSize: 11.5, fontWeight: "700", color: on ? "#fff" : C.ink }}>{id === "all" ? t("all") : t(`c_${id}` as Key)}</Text>
                </View></Pressable>;
            })}
          </View>
          <SectionTitle title={t("near")} right={hits ? `${hits.length}` : undefined} />
        </>}
        ListEmptyComponent={hits ? <Empty emoji="🔎" title={t("empty")} /> : <View>{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}</View>}
        renderItem={({ item, index }) => <FadeIn delay={Math.min(index, 8) * 40}><HitCard h={item} onPress={() => setSel(item)} /></FadeIn>} />
      <Detail hit={sel} onClose={() => setSel(null)} />
    </View>
  );
}

function HitCard({ h, onPress }: { h: Hit; onPress: () => void }) {
  const { t } = useT();
  return (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <Avatar id={h.providerId} emoji={emojiOf(h.categoryId)} size={54} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: "800", fontSize: 16, color: C.ink }}>{h.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}>
          <Text style={{ color: C.ink, fontWeight: "700", fontSize: 12.5 }}>⭐ {h.rating.toFixed(1)}<Text style={{ color: C.mute, fontWeight: "500" }}> ({h.jobs})</Text></Text>
          <Text style={{ color: C.mute, fontSize: 12.5 }}>· {(h.distanceM / 1000).toFixed(1)} {t("km")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 7 }}>{h.tier >= 1 && <Badge label={`✔ ${t("verified")}`} t="accent" />}{h.availableThisWeek && <Badge label={t("available")} t="green" dot />}</View>
      </View>
      <View style={{ alignItems: "flex-end" }}><Text style={{ fontWeight: "800", fontSize: 18, color: C.emerald }}>{h.priceCentimes ? h.priceCentimes / 100 : "🤝"}</Text>{h.priceCentimes ? <Text style={{ color: C.mute, fontSize: 11 }}>{t("mad")}</Text> : <Text style={{ color: C.mute, fontSize: 11 }}>{t("free")}</Text>}</View>
    </Card>
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
    <Sheet visible={!!hit} onClose={onClose}>
      {hit && <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar id={hit.providerId} emoji={emojiOf(hit.categoryId)} size={64} />
          <View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: "800", color: C.ink, letterSpacing: -0.4 }}>{hit.title}</Text><View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>{hit.tier >= 1 && <Badge label={`✔ ${t("verified")}`} t="accent" />}{hit.availableThisWeek && <Badge label={t("available")} t="green" dot />}</View></View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
          {[[t("rating"), `⭐ ${hit.rating.toFixed(1)}`], [t("jobs"), String(hit.jobs)], [t("distance"), `${(hit.distanceM / 1000).toFixed(1)} ${t("km")}`]].map(([l, v]) => (
            <Card key={l} style={{ flex: 1, alignItems: "center", padding: 12 }}><Text style={{ color: C.mute, fontSize: 11.5, fontWeight: "600" }}>{l}</Text><Text style={{ color: C.ink, fontWeight: "800", fontSize: 17, marginTop: 4 }}>{v}</Text></Card>
          ))}
        </View>
        <Card style={{ marginTop: 12 }}>
          <Row emoji="💰" label={t("priceFrom")} value={hit.priceCentimes ? `${hit.priceCentimes / 100} ${t("mad")}` : t("free")} /><Divider />
          <Row emoji="💵" label={t("payment")} value={t("cash")} /><Divider />
          <Row emoji="🚀" label={t("whatNext")} />
          <Text style={{ color: C.mute, marginTop: -4, paddingLeft: 48, paddingBottom: 6, lineHeight: 19 }}>{t("whatNextText")}</Text>
        </Card>
        <Button label={t("book")} icon="📅" onPress={book} busy={busy} style={{ marginTop: 16 }} />
        <Button label={t("back")} variant="ghost" onPress={onClose} style={{ marginTop: 4 }} />
      </>}
    </Sheet>
  );
}

/* ---------- bookings ---------- */
function Bookings({ insetTop }: { insetTop: number }) {
  const { t } = useT(); const [reportFor, setReportFor] = useState<Booking | null>(null); const [reportText, setReportText] = useState(""); const [reporting, setReporting] = useState(false); const [rateFor, setRateFor] = useState<Booking | null>(null); const [stars, setStars] = useState(5); const [note, setNote] = useState(""); const [rating, setRating] = useState(false); const [items, setItems] = useState<Booking[] | null>(null); const [busy, setBusy] = useState(false); const [live, setLive] = useState<Record<string, Live>>({}); const [detail, setDetail] = useState<Booking | null>(null); const [seg, setSeg] = useState<"active" | "past">("active");
  const load = useCallback(async () => { setBusy(true); try { setItems(await api("/v1/bookings")); } catch { setItems([]); } finally { setBusy(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    const tok = accessToken(); if (!tok) return;
    const s = new WebSocket(WS_URL); ws.current = s;
    s.onopen = () => s.send(JSON.stringify({ t: "auth", token: tok }));
    s.onmessage = (e) => { try { const m = JSON.parse(String(e.data)); if (m.t === "msg" && m.data?.type?.startsWith?.("booking.")) load(); if (m.t === "msg" && m.data?.type === "provider.location") setLive((x) => ({ ...x, [m.ch]: { lat: m.data.lat, lng: m.data.lng, at: Date.now() } })); } catch {} };
    return () => s.close();
  }, [load]);
  useEffect(() => { const s = ws.current; if (!s || s.readyState !== 1 || !items) return; for (const b of items) s.send(JSON.stringify({ t: "sub", ch: `booking:${b.id}` })); }, [items]);
  const shown = (items ?? []).filter((b) => (seg === "active" ? ACTIVE.includes(b.state) : !ACTIVE.includes(b.state)));
  return (
    <View style={{ flex: 1 }}>
      <LargeTitle top={insetTop} title={t("bookings")} />
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}><Segmented value={seg} onChange={setSeg} options={[{ id: "active", label: t("active") }, { id: "past", label: t("past") }]} /></View>
      <FlatList data={shown} keyExtractor={(b) => b.id} contentContainerStyle={{ padding: 16, paddingTop: 14 }} refreshControl={<RefreshControl refreshing={busy && !!items} onRefresh={load} tintColor={C.emerald} />}
        ListEmptyComponent={items ? (seg === "active" ? <Empty emoji="🧾" title={t("noActive")} hint={t("noActiveHint")} /> : <Empty emoji="🗂️" title={t("noPast")} />) : <View>{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</View>}
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, 8) * 40}>
            <Card style={{ marginBottom: 10 }} onPress={() => setDetail(item)}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View><Text style={{ fontWeight: "800", fontSize: 16, color: C.ink }}>#{item.id.slice(0, 8)}</Text><Text style={{ color: C.mute, marginTop: 3, fontSize: 12.5 }}>{item.totalCentimes / 100} {t("mad")} · 💵 {item.paymentMethod}</Text></View>
                <Badge label={t(`s_${item.state}` as Key)} t={stateTone(item.state)} dot />
              </View>
              {ACTIVE.includes(item.state) && <Stepper state={item.state} />}
              {["Requested", "Accepted"].includes(item.state) && <Button label={t("cancelBooking")} variant="outline" small style={{ marginTop: 12 }} onPress={async () => { try { await post(`/v1/bookings/${item.id}/cancel`); load(); } catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } }} />}
              {item.state === "Completed" && <Button label={`⚠️ ${t("report")}`} variant="outline" small style={{ marginTop: 12 }} onPress={() => { setReportText(""); setReportFor(item); }} />}
              {item.state === "Disputed" && <Text style={{ color: C.amber, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>⏳ {t("s_Disputed_hint")}</Text>}
              {item.state === "Completed" && <Button label={t("confirmDone")} small style={{ marginTop: 12 }} onPress={async () => { try { await post(`/v1/bookings/${item.id}/confirm`); load(); } catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } }} />}
              {["Confirmed", "Settled"].includes(item.state) && <Button label={`⭐ ${t("rate")}`} variant="outline" small style={{ marginTop: 12 }} onPress={() => { setStars(5); setNote(""); setRateFor(item); }} />}
              {live[`booking:${item.id}`] && <Text style={{ color: C.green, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>📡 {t("liveOn")}</Text>}
            </Card>
          </FadeIn>
        )} />
      <BookingDetail booking={detail ? (items ?? []).find((b) => b.id === detail.id) ?? detail : null} live={detail ? live[`booking:${detail.id}`] : undefined} onClose={() => setDetail(null)} onCancel={async (id) => { try { await post(`/v1/bookings/${id}/cancel`); setDetail(null); load(); } catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } }} />
      <Sheet visible={!!reportFor} onClose={() => setReportFor(null)}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>⚠️ {t("reportTitle")}</Text><Text style={{ color: C.mute, marginTop: 6, lineHeight: 20 }}>{t("reportHint")}</Text>
        <Field label={t("report")} value={reportText} onChangeText={setReportText} multiline style={{ minHeight: 110, fontSize: 15 }} />
        <Button label={t("reportSend")} busy={reporting} disabled={reportText.trim().length < 10} style={{ marginTop: 16 }} onPress={async () => {
          if (!reportFor) return; setReporting(true);
          try { await post(`/v1/bookings/${reportFor.id}/disputes`, { reason: reportText.trim() }); setReportFor(null); Alert.alert(t("reportSent")); load(); }
          catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } finally { setReporting(false); }
        }} />
      </Sheet>
      <Sheet visible={!!rateFor} onClose={() => setRateFor(null)}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink, textAlign: "center" }}>{t("rateTitle")}</Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 }}>
          {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setStars(n)} accessibilityLabel={`${n}`}><Text style={{ fontSize: 38, opacity: n <= stars ? 1 : 0.25 }}>⭐</Text></Pressable>)}
        </View>
        <Field label={t("rateComment")} value={note} onChangeText={setNote} multiline style={{ minHeight: 80, fontSize: 15 }} />
        <Button label={t("sendRating")} busy={rating} style={{ marginTop: 18 }} onPress={async () => {
          if (!rateFor) return; setRating(true);
          try { await post(`/v1/bookings/${rateFor.id}/reviews`, { rating: stars, comment: note.trim() || undefined }); setRateFor(null); Alert.alert(t("thanks")); }
          catch (e) { Alert.alert(e instanceof ApiError && e.status === 409 ? t("alreadyRated") : e instanceof ApiError ? e.message : t("network")); setRateFor(null); } finally { setRating(false); }
        }} />
      </Sheet>
    </View>
  );
}

/* ---------- booking detail: searching radar, provider card, live ETA ---------- */
function Radar() {
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => { const loops = rings.map((v, i) => Animated.loop(Animated.sequence([Animated.delay(i * 600), Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true })]))); loops.forEach((l) => l.start()); return () => loops.forEach((l) => l.stop()); }, [rings]);
  return (
    <View style={{ height: 150, alignItems: "center", justifyContent: "center" }}>
      {rings.map((v, i) => <Animated.View key={i} style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: C.emerald2, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.4] }) }] }} />)}
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.emerald, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 28 }}>📍</Text></View>
    </View>
  );
}

function BookingDetail({ booking, live, onClose, onCancel }: { booking: Booking | null; live?: Live; onClose: () => void; onCancel: (id: string) => void }) {
  const { t } = useT(); const [prov, setProv] = useState<{ name: string | null; rating: number; jobs: number; tier: number } | null>(null);
  const pid = booking?.providerId;
  useEffect(() => { setProv(null); if (booking && pid) api(`/v1/bookings/${booking.id}/provider`).then(setProv).catch(() => {}); }, [booking?.id, pid]); // eslint-disable-line
  if (!booking) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;
  const searching = booking.mode === "dispatch" && booking.state === "Requested";
  const unfilled = booking.mode === "dispatch" && booking.state === "Expired";
  const d = live && booking.lat != null && booking.lng != null ? distanceM(live.lat, live.lng, booking.lat, booking.lng) : null;
  return (
    <Sheet visible onClose={onClose}>
      {searching ? <><Radar /><Text style={{ fontSize: 22, fontWeight: "800", color: C.ink, textAlign: "center" }}>{t("searching")}</Text><Text style={{ color: C.mute, textAlign: "center", marginTop: 6, lineHeight: 20 }}>{t("searchingHint")}</Text></>
        : unfilled ? <Empty emoji="😕" title={t("unfilledTitle")} hint={t("unfilledHint")} />
        : <>
          <Text style={{ fontSize: 13, color: C.mute, fontWeight: "700" }}>{t("yourProvider")}</Text>
          {pid ? <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 }}><Avatar id={pid} size={56} label={(prov?.name ?? "H").slice(0, 2)} /><View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 18, color: C.ink }}>{prov?.name ?? t("providerAnon")}</Text><Text style={{ color: C.mute, marginTop: 3 }}>⭐ {(prov?.rating ?? 0).toFixed(1)} · {prov?.jobs ?? 0} {t("jobs")}</Text></View>{(prov?.tier ?? 0) >= 1 && <Badge label={`✔ ${t("verified")}`} t="accent" />}</Card> : null}
          <View style={{ marginTop: 14 }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ fontWeight: "800", color: C.ink }}>{t(`s_${booking.state}` as Key)}</Text><Badge label={t(`s_${booking.state}` as Key)} t={stateTone(booking.state)} dot /></View><Stepper state={booking.state} /></View>
          {d != null && ["Accepted", "EnRoute", "Arrived"].includes(booking.state) && <Card style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.greenSoft }}><Text style={{ fontSize: 26 }}>🛵</Text><View><Text style={{ fontWeight: "800", color: C.ink, fontSize: 17 }}>{t("arrivesIn")} {etaMin(d)} {t("minShort")}</Text><Text style={{ color: C.mute, marginTop: 2 }}>{(d / 1000).toFixed(1)} {t("km")} {t("away")}</Text></View></Card>}
        </>}
      <Text style={{ color: C.mute, marginTop: 14, textAlign: "center" }}>{booking.totalCentimes / 100} {t("mad")} · 💵 {t("cash")}</Text>
      {["Requested", "Accepted"].includes(booking.state) && <Button label={t("cancelBooking")} variant="outline" onPress={() => onCancel(booking.id)} style={{ marginTop: 14 }} />}
      <Button label={t("back")} variant="ghost" onPress={onClose} style={{ marginTop: 4 }} />
    </Sheet>
  );
}

/* ---------- profile ---------- */
function Profile({ insetTop, mode, onSwitch, onLogout, located, useMyLocation }: { insetTop: number; mode: "customer" | "provider"; onSwitch: (m: "customer" | "provider") => void; onLogout: () => void; located: boolean; useMyLocation: () => void }) {
  const { t } = useT(); const [me, setMe] = useState<{ phone: string } | null>(null);
  useEffect(() => { api("/v1/me").then(setMe).catch(() => {}); }, []);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
      <LargeTitle top={insetTop} title={t("profile")} />
      <View style={{ paddingHorizontal: 16 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 }}>
          <Avatar id={me?.phone ?? "me"} label={me?.phone?.slice(-2) ?? "··"} size={56} />
          <View><Text style={{ fontWeight: "800", fontSize: 18, color: C.ink }}>{me?.phone ?? "…"}</Text><Text style={{ color: C.mute, marginTop: 3 }}>{t("account")}</Text></View>
        </Card>
        <Card style={{ marginTop: 16, paddingVertical: 4 }}><Row emoji={mode === "provider" ? "🙋" : "🧰"} label={mode === "provider" ? t("modeCustomer") : t("modeProvider")} onPress={() => onSwitch(mode === "provider" ? "customer" : "provider")} /></Card>
        <SectionTitle title={t("language")} /><Card style={{ padding: 12 }}><LangPills /></Card>
        <SectionTitle title={t("location")} />
        <Card style={{ paddingVertical: 4 }}><Row emoji="📍" label={located ? "GPS" : t("usingCenter")} /><Divider /><Row emoji="🧭" label={t("useMyLocation")} onPress={useMyLocation} /></Card>
        <Card style={{ marginTop: 22, paddingVertical: 4 }}><Row emoji="🚪" label={t("logout")} onPress={onLogout} danger /></Card>
      </View>
    </ScrollView>
  );
}
