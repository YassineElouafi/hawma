import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { api, ApiError, accessToken, currentUserId, post } from "./api";
import { DEFAULT_CENTER, WS_URL } from "./config";
import type { Key } from "./i18n";
import { CATS, emojiOf, useT } from "./lang";
import { C, R } from "./theme";
import { Avatar, Badge, Button, Card, CardSkeleton, Empty, FadeIn, Field, Row, SectionTitle, Sheet, Stepper, stateTone } from "./ui";

interface Booking { id: string; state: string; customerId: string; providerId: string | null; totalCentimes: number; paymentMethod: string }
interface Offer { id: string; title: string; categoryId: string; basePriceCentimes: number; active: boolean }
interface Summary { tier: number; status: string; rating: number; jobs: number }
interface Verification { id: string; status: string; tier: number; reason?: string }
const NEXT: Record<string, [string, Key] | undefined> = { Accepted: ["start-trip", "startTrip"], EnRoute: ["arrive", "arrive"], Arrived: ["start-job", "startJob"], InProgress: ["complete", "complete"] };
const SHARING = ["Accepted", "EnRoute", "Arrived", "InProgress"];

export const LargeTitle = ({ top, title, sub }: { top: number; title: string; sub?: string }) => (
  <View style={{ paddingTop: top + 14, paddingHorizontal: 20, paddingBottom: 6 }}>{sub ? <Text style={{ color: C.mute, fontWeight: "600", fontSize: 14 }}>{sub}</Text> : null}<Text style={{ fontSize: 32, fontWeight: "800", color: C.ink, letterSpacing: -0.8 }}>{title}</Text></View>
);

/** Shares the provider's position over the realtime gateway while a job is active (server enforces who/when/rate). */
function useLocationSharing(jobIds: string[], enabled: boolean) {
  const ws = useRef<WebSocket | null>(null); const key = jobIds.join(",");
  useEffect(() => {
    if (!enabled || !jobIds.length) return;
    let sub: Location.LocationSubscription | undefined; let dead = false;
    const tok = accessToken(); if (!tok) return;
    const s = new WebSocket(WS_URL); ws.current = s; let ready = false;
    s.onopen = () => s.send(JSON.stringify({ t: "auth", token: tok }));
    s.onmessage = (e) => { try { if (JSON.parse(String(e.data)).t === "ready") ready = true; } catch {} };
    (async () => {
      const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== "granted" || dead) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 }, (pos) => {
        if (!ready || s.readyState !== 1) return;
        for (const id of jobIds) s.send(JSON.stringify({ t: "loc", booking: id, lat: pos.coords.latitude, lng: pos.coords.longitude }));
      });
    })();
    return () => { dead = true; sub?.remove(); s.close(); };
  }, [key, enabled]); // eslint-disable-line
}

const DOC_KINDS = ["cin_front", "cin_back", "selfie"] as const;
function DocUploader({ verificationId, onChange }: { verificationId: string; onChange: () => void }) {
  const { t } = useT(); const [done, setDone] = useState<Record<string, boolean>>({}); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api(`/v1/verifications/${verificationId}/documents`).then((d: { kind: string }[]) => setDone(Object.fromEntries(d.map((x) => [x.kind, true])))).catch(() => {}); }, [verificationId]);
  const pick = async (kind: (typeof DOC_KINDS)[number], source: "camera" | "gallery") => {
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.4, base64: true, allowsEditing: false };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const b64 = res.canceled ? undefined : res.assets[0]?.base64; if (!b64) return;
    setBusy(kind);
    try { await post(`/v1/verifications/${verificationId}/documents`, { kind, data: b64 }); setDone((d) => ({ ...d, [kind]: true })); onChange(); }
    catch (e) { Alert.alert(e instanceof ApiError && e.status === 413 ? t("tooLarge") : e instanceof ApiError ? e.message : t("uploadFail")); } finally { setBusy(null); }
  };
  const choose = (kind: (typeof DOC_KINDS)[number]) => Alert.alert(t(`d_${kind}` as Key), undefined, [{ text: t("camera"), onPress: () => pick(kind, "camera") }, { text: t("gallery"), onPress: () => pick(kind, "gallery") }, { text: "✕", style: "cancel" }]);
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontWeight: "800", color: C.ink, fontSize: 16 }}>{t("docsTitle")}</Text><Text style={{ color: C.mute, marginTop: 4, lineHeight: 19 }}>{t("docsHint")}</Text>
      {DOC_KINDS.map((k) => (
        <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: done[k] ? C.greenSoft : C.emeraldSoft, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>{done[k] ? "✅" : k === "selfie" ? "🤳" : "🪪"}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: C.ink }}>{t(`d_${k}` as Key)}</Text>{done[k] && <Text style={{ color: C.green, fontSize: 12, fontWeight: "600" }}>{t("uploaded")}</Text>}</View>
          <Button label={done[k] ? t("retake") : t("addPhoto")} variant={done[k] ? "outline" : "primary"} small busy={busy === k} onPress={() => choose(k)} />
        </View>
      ))}
    </View>
  );
}

export function ProviderToday({ insetTop }: { insetTop: number }) {
  const { t } = useT(); const me = currentUserId();
  const [sum, setSum] = useState<Summary | null>(null); const [ver, setVer] = useState<Verification[] | null>(null); const [jobs, setJobs] = useState<Booking[] | null>(null);
  const [online, setOnline] = useState(true); const [busy, setBusy] = useState(false); const [acting, setActing] = useState<string | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try { const [s, v, b] = await Promise.all([api("/v1/me/provider"), api("/v1/verifications/mine"), api("/v1/bookings")]); setSum(s); setVer(v); setJobs(b.filter((x: Booking) => x.providerId === me)); } catch {} finally { setBusy(false); }
  }, [me]);
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  const act = async (id: string, cmd: string) => { setActing(id); try { await post(`/v1/bookings/${id}/${cmd}`); await load(); } catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } finally { setActing(null); } };
  const active = (jobs ?? []).filter((j) => SHARING.includes(j.state)); const requests = (jobs ?? []).filter((j) => j.state === "Requested");
  useLocationSharing(active.map((j) => j.id), online);

  const apply = async () => { try { await post("/v1/verifications", { tier: 1, documents: ["cin_front", "cin_back", "selfie"] }); await load(); } catch (e) { Alert.alert(e instanceof ApiError ? e.message : t("network")); } };
  const verified = (sum?.status === "active" && sum.tier >= 1);
  const latest = ver?.[0];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={busy && !!sum} onRefresh={load} tintColor={C.emerald} />}>
      <LargeTitle top={insetTop} title={t("today")} sub={verified ? `⭐ ${sum!.rating.toFixed(1)} · ${sum!.jobs} ${t("jobs")}` : undefined} />
      <View style={{ paddingHorizontal: 16 }}>
        {!sum ? <><CardSkeleton /><CardSkeleton /></> : !verified ? (
          <Card style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{t("becomeProvider")}</Text><Text style={{ color: C.mute, marginTop: 6, lineHeight: 20 }}>{t("becomeProviderHint")}</Text>
            {latest ? <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}><Text style={{ fontWeight: "700", color: C.ink }}>{t("vStatus")}</Text><Badge label={t(`v_${latest.status}` as Key)} t={latest.status === "approved" ? "green" : latest.status === "rejected" ? "red" : "amber"} dot /></View> : null}
            {latest?.reason ? <Text style={{ color: C.terracotta, marginTop: 8 }}>{latest.reason}</Text> : null}
            {latest && (latest.status === "in_review" || latest.status === "submitted") && <DocUploader verificationId={latest.id} onChange={load} />}
            {(!latest || latest.status === "rejected") && <Button label={t("applyVerify")} icon="🛡️" onPress={apply} style={{ marginTop: 16 }} />}
          </Card>
        ) : (
          <>
            <Card style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 17, color: C.ink }}>{online ? t("online") : t("offline")}</Text><Text style={{ color: C.mute, marginTop: 3, fontSize: 12.5 }}>{t("onlineHint")}</Text></View>
              <Switch value={online} onValueChange={setOnline} trackColor={{ true: C.emerald2, false: C.border }} thumbColor="#fff" />
            </Card>
            <SectionTitle title={t("activeJob")} />
            {active.length === 0 ? <Card><Text style={{ color: C.mute }}>—</Text></Card> : active.map((j) => (
              <Card key={j.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ fontWeight: "800", fontSize: 16, color: C.ink }}>#{j.id.slice(0, 8)}</Text><Badge label={t(`s_${j.state}` as Key)} t={stateTone(j.state)} dot /></View>
                <Text style={{ color: C.mute, marginTop: 4 }}>{j.totalCentimes / 100} {t("mad")} · 💵</Text><Stepper state={j.state} />
                {online && <Text style={{ color: C.green, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>📡 {t("sharing")}</Text>}
                {NEXT[j.state] && <Button label={t(NEXT[j.state]![1])} busy={acting === j.id} onPress={() => act(j.id, NEXT[j.state]![0])} style={{ marginTop: 14 }} />}
              </Card>
            ))}
            <SectionTitle title={t("requests")} right={requests.length ? String(requests.length) : undefined} />
            {requests.length === 0 ? <Empty emoji="📭" title={t("noRequests")} /> : requests.map((j, i) => (
              <FadeIn key={j.id} delay={i * 50}><Card style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Avatar id={j.customerId} size={46} /><View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 16, color: C.ink }}>{j.totalCentimes / 100} {t("mad")}</Text><Text style={{ color: C.mute, fontSize: 12.5, marginTop: 2 }}>💵 {j.paymentMethod} · #{j.id.slice(0, 6)}</Text></View></View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}><Button label={t("decline")} variant="outline" small style={{ flex: 1 }} onPress={() => act(j.id, "decline")} /><Button label={t("accept")} small style={{ flex: 1 }} busy={acting === j.id} onPress={() => act(j.id, "accept")} /></View>
              </Card></FadeIn>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

export function ProviderOffers({ insetTop }: { insetTop: number }) {
  const { t } = useT(); const [items, setItems] = useState<Offer[] | null>(null); const [sheet, setSheet] = useState(false);
  const [cat, setCat] = useState("tutoring"); const [title, setTitle] = useState(""); const [price, setPrice] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setItems(await api("/v1/offers/mine")); } catch { setItems([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const publish = async () => {
    setBusy(true);
    try { await post("/v1/offers", { categoryId: cat, title: title.trim(), lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, basePriceCentimes: Math.round((Number(price) || 0) * 100), pricingModel: cat === "tutoring" ? "hourly" : "fixed" }); setSheet(false); setTitle(""); setPrice(""); Alert.alert(t("offerPublished")); load(); }
    catch (e) { Alert.alert(e instanceof ApiError && e.status === 403 ? t("needVerified") : e instanceof ApiError ? e.message : t("network")); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1 }}>
      <LargeTitle top={insetTop} title={t("offers")} />
      <FlatList data={items ?? []} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={items ? <Empty emoji="🛠️" title={t("noOffers")} hint={t("noOffersHint")} /> : <CardSkeleton />}
        renderItem={({ item }) => <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}><Avatar id={item.id} emoji={emojiOf(item.categoryId)} size={48} /><View style={{ flex: 1 }}><Text style={{ fontWeight: "800", color: C.ink, fontSize: 16 }}>{item.title}</Text><Text style={{ color: C.mute, marginTop: 3 }}>{t(`c_${item.categoryId}` as Key)}</Text></View><Text style={{ fontWeight: "800", color: C.emerald, fontSize: 17 }}>{item.basePriceCentimes / 100}<Text style={{ fontSize: 11, color: C.mute }}> {t("mad")}</Text></Text></Card>} />
      <View style={{ padding: 16, paddingTop: 0 }}><Button label={t("newOffer")} icon="＋" onPress={() => setSheet(true)} /></View>
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{t("newOffer")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>{CATS.map(([id, e]) => <Pressable key={id} onPress={() => setCat(id)} style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.pill, backgroundColor: cat === id ? C.emerald : C.card, borderWidth: 1, borderColor: cat === id ? C.emerald : C.border }}><Text style={{ fontWeight: "700", color: cat === id ? "#fff" : C.ink }}>{e} {t(`c_${id}` as Key)}</Text></Pressable>)}</ScrollView>
        <Field label={t("offerTitle")} value={title} onChangeText={setTitle} /><Field label={t("priceMad")} value={price} onChangeText={setPrice} keyboardType="numeric" />
        <Button label={t("publish")} onPress={publish} busy={busy} disabled={title.trim().length < 3} style={{ marginTop: 20 }} />
      </Sheet>
    </View>
  );
}
