import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CalendarDays, ChevronRight, Home, LogOut, MapPin, Receipt, Star, User, X, Zap, ArrowLeft, ShieldCheck, Clock } from "lucide-react";
import { useI18n, LANGS } from "@/i18n";
import { cn } from "@/lib/utils";
import { ArrowBtn, Avatar, Card, Chip, CTA, FloatingTabs, GSheet, IconBtn, RatingPill, SceneArt, SearchBar, Section, Skeleton, Tag, UnderLink } from "@/components/glide/ui";
import { SlotPicker, type Slot } from "./SlotPicker";
import { CATS, emojiOf, T } from "./strings";
import { accessToken, api, ApiError, isAuthed, onAuthChange, post, save } from "./api";

interface Hit { id: string; title: string; categoryId: string; priceCentimes: number; pricingModel?: string; distanceM: number; rating: number; jobs: number; tier: number; availableThisWeek: boolean; providerId: string }
interface Booking { id: string; offerId?: string | null; durationMin?: number; localDate?: string | null; startMin?: number | null; categoryId?: string | null; state: string; mode?: string; providerId: string | null; customerId: string; totalCentimes: number; paymentMethod: string; lat?: number; lng?: number }
interface Live { lat: number; lng: number; at: number }
const distM = (aLat: number, aLng: number, bLat: number, bLng: number) => { const r = (d: number) => (d * Math.PI) / 180, R = 6371000, dLat = r(bLat - aLat), dLng = r(bLng - aLng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
const etaMin = (m: number) => Math.max(1, Math.round(m / 333));
const STEPS = ["Requested", "Accepted", "EnRoute", "Arrived", "InProgress", "Completed"];
const ACTIVE = ["Requested", "Offered", "Accepted", "EnRoute", "Arrived", "InProgress"];
const CENTER = { lat: 33.5883, lng: -7.635 };

function useTr() { const { lang } = useI18n(); return (k: string) => T[lang][k] ?? T.fr[k] ?? k; }

/** Realtime connection to the API gateway: follows the booking channels and keeps the last provider position per booking. */
function useLive(ids: string[], onEvent: () => void) {
  const [live, setLive] = useState<Record<string, Live>>({}); const ws = useRef<WebSocket | null>(null); const ready = useRef(false); const subscribed = useRef(new Set<string>());
  useEffect(() => {
    const tok = accessToken(); if (!tok) return;
    const s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`); ws.current = s;
    s.onopen = () => s.send(JSON.stringify({ t: "auth", token: tok }));
    s.onmessage = (e) => { try { const m = JSON.parse(String(e.data)); if (m.t === "ready") { ready.current = true; subscribed.current.clear(); } if (m.t === "msg") { if (m.data?.type === "provider.location") setLive((x) => ({ ...x, [m.ch.replace("booking:", "")]: { lat: m.data.lat, lng: m.data.lng, at: Date.now() } })); else if (String(m.data?.type).startsWith("booking.") || String(m.data?.type).startsWith("dispatch.")) onEvent(); } } catch { /* ignore malformed frames */ } };
    return () => { ready.current = false; s.close(); };
  }, []); // eslint-disable-line
  useEffect(() => { const s = ws.current; if (!s || s.readyState !== 1 || !ready.current) return; for (const id of ids) if (!subscribed.current.has(id)) { s.send(JSON.stringify({ t: "sub", ch: `booking:${id}` })); subscribed.current.add(id); } });
  return live;
}

/* ---------- tiny toast ---------- */
const ToastCtx = createContext<(m: string, tone?: "ok" | "err") => void>(() => {});
const useToast = () => useContext(ToastCtx);
function Toasts({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; m: string; tone: "ok" | "err" }[]>([]);
  const push = useCallback((m: string, tone: "ok" | "err" = "ok") => { const id = Date.now() + Math.random(); setItems((x) => [...x, { id, m, tone }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200); }, []);
  return (<ToastCtx.Provider value={push}>{children}
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] mx-auto flex max-w-[480px] flex-col items-center gap-2 px-5" role="status" aria-live="polite">
      <AnimatePresence>{items.map((t) => <motion.div key={t.id} layout initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} className={cn("pointer-events-auto rounded-full px-5 py-3 text-[14px] font-semibold text-white shadow-g-float", t.tone === "ok" ? "bg-g-ink" : "bg-g-danger")}>{t.m}</motion.div>)}</AnimatePresence>
    </div></ToastCtx.Provider>);
}

export default function WebApp() {
  const [authed, setAuthed] = useState(isAuthed()); useEffect(() => { const off = onAuthChange(() => setAuthed(isAuthed())); return () => { off(); }; }, []);
  const { rtl } = useI18n();
  return <div className="glide min-h-dvh" dir={rtl ? "rtl" : "ltr"}><Toasts>{authed ? <Main /> : <Login />}</Toasts></div>;
}

function LangPills({ dark }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  return <div className={cn("inline-flex rounded-full p-1 text-[13px] font-bold", dark ? "bg-white/15 backdrop-blur" : "bg-black/5")}>{LANGS.map((l) => <button key={l.id} onClick={() => setLang(l.id)} className={cn("rounded-full px-4 py-2 transition", lang === l.id ? (dark ? "bg-white text-g-ink" : "bg-g-ink text-white") : dark ? "text-white/85" : "text-g-mute")}>{l.label}</button>)}</div>;
}

/* ---------- login ---------- */
function Login() {
  const tr = useTr(); const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [step, setStep] = useState<"phone" | "code">("phone"); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [dev, setDev] = useState("");
  const field = "h-14 w-full rounded-full bg-g-bg px-6 text-[17px] font-semibold outline-none ring-2 ring-transparent transition placeholder:font-medium placeholder:text-g-mute focus:bg-white focus:ring-g-ink";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      if (step === "phone") { const r = await post("/v1/auth/otp/request", { phone }, false); setDev(r.devCode ?? ""); if (r.devCode) setCode(r.devCode); setStep("code"); }
      else save(await post("/v1/auth/otp/verify", { phone, code }, false));
    } catch (x) { setErr(x instanceof ApiError ? (x.status === 400 && step === "phone" ? tr("bad") : step === "code" ? tr("wrong") : x.message) : tr("net")); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-g-bg">
      <SceneArt cat="lending" shade={false} emojiSize={170} className="relative h-[46dvh] min-h-[320px] shrink-0 rounded-b-[2.5rem] bg-g-ink">
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/55" />
        <div className="relative z-10 flex items-start justify-between p-5"><LangPills dark /></div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-7 text-white">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-[1.4rem] bg-white font-display text-4xl font-extrabold text-g-ink shadow-g-float">ح</div>
          <h1 className="text-[44px] leading-[1.02]">Hawma</h1><p className="mt-2 text-[19px] font-semibold text-white/90">{tr("tag")}</p>
        </div>
      </SceneArt>
      <form onSubmit={submit} className="flex flex-1 flex-col px-6 pb-10 pt-7">
        <label htmlFor="w-phone" className="mb-2 text-[13px] font-bold uppercase tracking-wide text-g-mute">{tr("phone")}</label>
        <input id="w-phone" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={step === "code"} className={field} />
        {step === "code" && <><label htmlFor="w-code" className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wide text-g-mute">{tr("code")}</label>
          <input id="w-code" dir="ltr" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={cn(field, "text-center text-2xl tracking-[0.5em]")} />
          {dev && <Tag tone="amber" className="mt-3 self-start">{tr("devCode")}: {dev}</Tag>}</>}
        {err && <p role="alert" className="mt-4 rounded-2xl bg-g-danger-soft px-4 py-3 text-[14px] font-semibold text-g-danger">{err}</p>}
        <CTA className="mt-auto" disabled={busy || (step === "phone" ? phone.length < 8 : code.length !== 6)}>{step === "phone" ? tr("send") : tr("verify")}</CTA>
      </form>
    </div>
  );
}

/* ---------- shell ---------- */
type Tab = "home" | "bookings" | "profile";
function Main() {
  const tr = useTr(); const [tab, setTab] = useState<Tab>("home");
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-g-bg">
      <main className="pb-32">{tab === "home" ? <Explore /> : tab === "bookings" ? <Bookings /> : <Profile />}</main>
      <FloatingTabs value={tab} onChange={setTab} items={[{ id: "home", icon: <Home size={23} />, label: tr("home") }, { id: "bookings", icon: <Receipt size={23} />, label: tr("bookings") }, { id: "profile", icon: <User size={23} />, label: tr("profile") }]} />
    </div>
  );
}

const PageTitle = ({ sub, children, right }: { sub?: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-start justify-between px-5 pb-2 pt-9"><div>{sub && <div className="text-[15px] font-semibold text-g-mute">{sub}</div>}<h1 className="text-[30px] leading-[1.1]">{children}</h1></div>{right}</div>
);

/* ---------- home ---------- */
function Explore() {
  const tr = useTr(); const { lang } = useI18n(); const toast = useToast();
  const [q, setQ] = useState(""); const [cat, setCat] = useState("all"); const [radius, setRadius] = useState(10); const [onlyAvail, setOnlyAvail] = useState(false); const [filters, setFilters] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null); const [sel, setSel] = useState<Hit | null>(null); const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const h = setTimeout(async () => { try { const p = new URLSearchParams({ lat: String(CENTER.lat), lng: String(CENTER.lng), radiusM: String(radius * 1000), limit: "30" }); if (cat !== "all") p.set("categoryId", cat); if (q.trim()) p.set("q", q.trim()); setHits(await api(`/v1/search?${p}`, { auth: false })); } catch { setHits([]); } }, 250);
    return () => clearTimeout(h);
  }, [q, cat, radius]);
  const shown = (hits ?? []).filter((h) => !onlyAvail || h.availableThisWeek);
  const top = [...shown].sort((a, b) => b.rating - a.rating).slice(0, 5);
  const list = showAll ? shown : shown.slice(0, 6);
  void lang; void toast;
  return (
    <>
      <PageTitle sub={tr("hello")} right={<Avatar id="me" label="H" size={52} />}>{tr("find")}</PageTitle>
      <div className="px-5"><SearchBar value={q} onChange={setQ} placeholder={tr("search")} onFilter={() => setFilters(true)} filterLabel={tr("filters")} /></div>
      <div className="no-scrollbar mt-5 flex gap-2.5 overflow-x-auto px-5">
        {[["all", ""], ...CATS].map(([id, e]) => <Chip key={id} on={cat === id} onClick={() => setCat(id)}>{e && <span className="me-1.5">{e}</span>}{id === "all" ? tr("all") : tr("c_" + id)}</Chip>)}
      </div>

      <UrgentBanner />

      {!hits ? <div className="mt-8 px-5"><Skeleton className="h-[360px] w-full" /></div> : top.length > 0 && (
        <Section title={tr("topRated")}>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5">
            {top.map((h, i) => (
              <motion.button key={h.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => setSel(h)} aria-label={h.title}
                className="relative aspect-[4/5] w-[78%] shrink-0 snap-center overflow-hidden rounded-[2rem] text-start shadow-g-card active:scale-[.985]">
                <SceneArt cat={h.categoryId} emojiSize={150} className="absolute inset-0" />
                <span className="absolute end-4 top-4 z-10"><Tag tone="neutral" className="bg-white/20 text-white backdrop-blur">{emojiOf(h.categoryId)} {tr("c_" + h.categoryId)}</Tag></span>
                <div className="absolute inset-x-0 bottom-0 z-10 p-5 text-white">
                  <div className="text-[13px] font-semibold text-white/80">{(h.distanceM / 1000).toFixed(1)} {tr("km")} · {h.priceCentimes / 100} {tr("mad")}</div>
                  <div className="mt-1 text-[26px] font-extrabold leading-[1.1] tracking-tight">{h.title}</div>
                  <RatingPill value={h.rating} count={h.jobs} onDark className="mt-2.5" />
                  <div className="mt-4 flex items-center justify-between rounded-full bg-black/55 p-1.5 ps-6 backdrop-blur"><span className="text-[15px] font-bold">{tr("seeMore")}</span><span className="grid h-11 w-11 place-items-center rounded-full bg-white text-g-ink"><ChevronRight size={20} className="rtl:rotate-180" /></span></div>
                </div>
              </motion.button>
            ))}
          </div>
        </Section>
      )}

      <Section title={tr("near")} action={shown.length > 6 && <UnderLink onClick={() => setShowAll((s) => !s)}>{tr("seeAll")}</UnderLink>}>
        <div className="space-y-4 px-5">
          {!hits && [0, 1].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
          {list.map((h, i) => (
            <motion.button key={h.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.05 }} onClick={() => setSel(h)} aria-label={h.title} className="block w-full rounded-[2rem] bg-white p-2.5 text-start shadow-g-card transition active:scale-[.99]">
              <SceneArt cat={h.categoryId} emojiSize={96} className="aspect-[16/10] w-full rounded-[1.5rem]" />
              <div className="flex items-end justify-between gap-3 px-3.5 pb-3.5 pt-4">
                <div className="min-w-0">
                  <div className="truncate text-[19px] font-extrabold tracking-tight">{h.title}</div>
                  <div className="mt-1 text-[14px] font-medium text-g-mute">{(h.distanceM / 1000).toFixed(1)} {tr("km")} <span className="mx-1">•</span> {tr("fromPrice")} {h.priceCentimes / 100} {tr("mad")}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><RatingPill value={h.rating} count={h.jobs} />{h.tier >= 1 && <Tag tone="accent"><BadgeCheck size={12} />{tr("verified")}</Tag>}{h.availableThisWeek && <Tag tone="green">{tr("avail")}</Tag>}</div>
                </div>
                <ArrowBtn as-child aria-hidden tabIndex={-1} />
              </div>
            </motion.button>
          ))}
          {hits && shown.length === 0 && <Card className="p-8 text-center text-g-mute">{tr("empty")}</Card>}
        </div>
      </Section>

      <AnimatePresence>{sel && <ProviderSheet key={sel.id} hit={sel} onClose={() => setSel(null)} />}</AnimatePresence>
      <AnimatePresence>{filters && (
        <GSheet open onClose={() => setFilters(false)} title={tr("filters")}>
          <h3 className="text-[22px]">{tr("filters")}</h3>
          <div className="mt-5 text-[13px] font-bold uppercase tracking-wide text-g-mute">{tr("radiusLabel")}</div>
          <div className="mt-3 flex flex-wrap gap-2.5">{[1, 3, 5, 10, 25].map((r) => <Chip key={r} on={radius === r} onClick={() => setRadius(r)}>{r} {tr("km")}</Chip>)}</div>
          <button onClick={() => setOnlyAvail((v) => !v)} role="switch" aria-checked={onlyAvail} className="mt-6 flex w-full items-center justify-between rounded-full bg-white px-6 py-4 shadow-g-card"><span className="text-[15px] font-bold">{tr("onlyAvailable")}</span><span className={cn("relative h-8 w-14 rounded-full transition", onlyAvail ? "bg-g-ink" : "bg-black/15")}><span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", onlyAvail ? "start-7" : "start-1")} /></span></button>
          <CTA className="mt-6" onClick={() => setFilters(false)}>{tr("apply")}</CTA>
        </GSheet>)}</AnimatePresence>
    </>
  );
}

function UrgentBanner() {
  const tr = useTr(); const toast = useToast(); const [open, setOpen] = useState(false); const [cat, setCat] = useState("errands"); const [price, setPrice] = useState("30"); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const pos = await new Promise<{ lat: number; lng: number }>((res) => { if (!navigator.geolocation) return res(CENTER); navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(CENTER), { timeout: 4000 }); });
      await post("/v1/dispatch-requests", { ...pos, categoryId: cat, totalCentimes: Math.round((Number(price) || 0) * 100), paymentMethod: "cash" }); toast(tr("urgentSent")); setOpen(false);
    } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="mt-6 px-5"><button onClick={() => setOpen(true)} className="flex w-full items-center gap-4 rounded-full bg-g-ink p-2.5 ps-3 text-start text-white shadow-g-card transition active:scale-[.985]">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-g-saffron text-g-ink"><Zap size={26} fill="currentColor" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[16px] font-extrabold leading-tight">{tr("urgent")}</span><span className="block truncate text-[13px] font-medium text-white/70">{tr("urgentHint")}</span></span>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-g-ink"><ChevronRight size={20} className="rtl:rotate-180" /></span></button></div>
      <AnimatePresence>{open && (
        <GSheet open onClose={() => setOpen(false)} title={tr("urgent")}>
          <h3 className="flex items-center gap-2 text-[22px]"><Zap size={22} className="text-g-saffron" fill="currentColor" />{tr("urgent")}</h3>
          <div className="mt-5 flex flex-wrap gap-2.5">{["errands", "rides", "diy", "pets"].map((id) => <Chip key={id} on={cat === id} onClick={() => setCat(id)}>{emojiOf(id)} {tr("c_" + id)}</Chip>)}</div>
          <label htmlFor="u-price" className="mb-2 mt-6 block text-[13px] font-bold uppercase tracking-wide text-g-mute">{tr("price")}</label>
          <input id="u-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="h-14 w-full rounded-full bg-white px-6 text-[18px] font-bold shadow-g-card outline-none ring-2 ring-transparent focus:ring-g-ink" />
          <CTA className="mt-6" disabled={busy} onClick={go}><Zap size={18} fill="currentColor" />{tr("requestNow")}</CTA>
        </GSheet>)}</AnimatePresence>
    </>
  );
}

/* ---------- provider sheet (booking) ---------- */
function ProviderSheet({ hit, onClose }: { hit: Hit; onClose: () => void }) {
  const tr = useTr(); const toast = useToast(); const [dur, setDur] = useState(60); const [slot, setSlot] = useState<Slot | null>(null); const [busy, setBusy] = useState(false);
  const hourly = hit.pricingModel === "hourly"; const price = hourly ? Math.round((hit.priceCentimes * dur) / 60) : hit.priceCentimes;
  const book = async () => { if (!slot) return; setBusy(true); try { await post("/v1/bookings", { mode: "catalogue", offerId: hit.id, slot, durationMin: dur, paymentMethod: "cash" }); toast(tr("booked")); onClose(); } catch (e) { toast(e instanceof ApiError && e.status === 409 ? tr("slotTaken") : e instanceof ApiError ? e.message : tr("net"), "err"); setSlot(null); } finally { setBusy(false); } };
  return (
    <GSheet open onClose={onClose} title={hit.title} tall>
      <SceneArt cat={hit.categoryId} emojiSize={130} className="relative -mx-1 h-56 rounded-[1.75rem]">
        <IconBtn aria-label={tr("back")} onClick={onClose} className="absolute start-3 top-3 z-10"><ArrowLeft size={20} className="rtl:rotate-180" /></IconBtn>
      </SceneArt>
      <div className="mt-5 flex items-start justify-between gap-3"><h2 className="text-[26px] leading-[1.1]">{hit.title}</h2><RatingPill value={hit.rating} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold text-g-mute">{hit.jobs} {tr("jobs")}</span><span className="text-g-faint">•</span><span className="inline-flex items-center gap-1 text-[14px] font-semibold text-g-mute"><MapPin size={14} />{(hit.distanceM / 1000).toFixed(1)} {tr("km")}</span>
        {hit.tier >= 1 && <Tag tone="accent"><BadgeCheck size={12} />{tr("verified")}</Tag>}{hit.availableThisWeek && <Tag tone="green">{tr("avail")}</Tag>}</div>

      {hourly && <div className="mt-6 flex items-center gap-2.5"><span className="text-[14px] font-bold text-g-mute">{tr("durationLabel")}</span>{[60, 120, 180].map((d) => <Chip key={d} on={dur === d} onClick={() => setDur(d)} className="px-4 py-2.5">{d / 60}{tr("hours")}</Chip>)}</div>}
      <h3 className="mt-6 flex items-center gap-2 text-[18px]"><CalendarDays size={18} />{tr("chooseTime")}</h3>
      <SlotPicker offerId={hit.id} durationMin={dur} value={slot} onChange={setSlot} emptyText={tr("noSlots")} />

      <Card className="mt-6 divide-y divide-g-line"><div className="flex items-center justify-between px-5 py-4"><span className="text-[15px] font-semibold text-g-mute">{tr("total")}</span><span className="text-[20px] font-extrabold">{price / 100} {tr("mad")}</span></div><div className="flex items-center justify-between px-5 py-4"><span className="text-[15px] font-semibold text-g-mute">💵</span><span className="text-[14px] font-bold">{tr("cash")}</span></div></Card>
      <CTA className="mt-5" disabled={busy || !slot} onClick={book}>{tr("book")}</CTA>
    </GSheet>
  );
}

/* ---------- bookings ---------- */
const stateTone = (s: string): "neutral" | "accent" | "green" | "danger" | "amber" => (["Cancelled", "Declined", "Disputed", "Expired"].includes(s) ? "danger" : ["Settled", "Confirmed", "Completed"].includes(s) ? "green" : ["Requested", "Offered"].includes(s) ? "amber" : "accent");

function Bookings() {
  const tr = useTr(); const toast = useToast(); const [items, setItems] = useState<Booking[] | null>(null); const [detail, setDetail] = useState<string | null>(null); const [seg, setSeg] = useState<"active" | "past">("active");
  const [resched, setResched] = useState<Booking | null>(null); const [newSlot, setNewSlot] = useState<Slot | null>(null); const [report, setReport] = useState<Booking | null>(null); const [reportText, setReportText] = useState(""); const [rate, setRate] = useState<Booking | null>(null); const [stars, setStars] = useState(5); const [note, setNote] = useState("");
  const load = useCallback(async () => { try { setItems(await api("/v1/bookings")); } catch { setItems([]); } }, []);
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);
  const live = useLive((items ?? []).map((b) => b.id), load);
  const run = async (id: string, cmd: string) => { try { await post(`/v1/bookings/${id}/${cmd}`); load(); } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } };
  const shown = (items ?? []).filter((b) => (seg === "active") === ACTIVE.includes(b.state));
  return (
    <>
      <PageTitle>{tr("bookings")}</PageTitle>
      <div className="px-5"><div className="inline-flex rounded-full bg-black/5 p-1">{(["active", "past"] as const).map((k) => <button key={k} onClick={() => setSeg(k)} aria-pressed={seg === k} className={cn("rounded-full px-6 py-2.5 text-[14px] font-bold transition", seg === k ? "bg-g-ink text-white" : "text-g-mute")}>{tr(k)}</button>)}</div></div>
      <div className="mt-5 space-y-3.5 px-5">
        {!items && <Skeleton className="h-36 w-full" />}
        {shown.map((b) => (
          <motion.div key={b.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card onClick={() => setDetail(b.id)} className="cursor-pointer p-5 transition active:scale-[.99]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5"><span className="grid h-14 w-14 place-items-center rounded-[1.2rem] bg-g-bg text-[26px]">{emojiOf(b.categoryId ?? "")}</span><div><div className="text-[17px] font-extrabold">#{b.id.slice(0, 8)}</div><div className="mt-0.5 text-[14px] font-medium text-g-mute">{b.totalCentimes / 100} {tr("mad")} · 💵</div></div></div>
                <Tag tone={stateTone(b.state)}>{tr("s_" + b.state)}</Tag>
              </div>
              {b.state === "Disputed" && <div className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-[#8a5a00]"><Clock size={14} />{tr("underReview")}</div>}
              <div className="mt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {["Requested", "Accepted"].includes(b.state) && b.offerId && b.durationMin && <Chip className="py-2.5" onClick={() => { setNewSlot(null); setResched(b); }}>{tr("reschedule")}</Chip>}
                {["Requested", "Accepted"].includes(b.state) && <Chip className="py-2.5" onClick={() => run(b.id, "cancel")}>{tr("cancel")}</Chip>}
                {b.state === "Completed" && <Chip on className="py-2.5" onClick={() => run(b.id, "confirm")}>{tr("confirm")}</Chip>}
                {b.state === "Completed" && <Chip className="py-2.5" onClick={() => { setReportText(""); setReport(b); }}>⚠️ {tr("report")}</Chip>}
                {["Confirmed", "Settled"].includes(b.state) && <Chip className="py-2.5" onClick={() => { setStars(5); setNote(""); setRate(b); }}><Star size={14} className="me-1 inline" />{tr("rate")}</Chip>}
              </div>
            </Card>
          </motion.div>
        ))}
        {items && shown.length === 0 && <Card className="p-10 text-center"><div className="text-4xl">🧾</div><p className="mt-3 text-[15px] font-semibold text-g-mute">{seg === "active" ? tr("noActive") : tr("noPast")}</p></Card>}
      </div>

      <AnimatePresence>{detail && <BookingDetail key={detail} booking={(items ?? []).find((b) => b.id === detail) ?? null} live={live[detail]} onClose={() => setDetail(null)} onCancel={async (id) => { await run(id, "cancel"); setDetail(null); }} />}</AnimatePresence>

      <AnimatePresence>{resched && (
        <GSheet open onClose={() => setResched(null)} title={tr("reschedule")}>
          <h3 className="text-[22px]">{tr("reschedule")}</h3>
          <SlotPicker offerId={resched.offerId!} durationMin={resched.durationMin!} value={newSlot} onChange={setNewSlot} emptyText={tr("noSlots")} />
          <CTA className="mt-6" disabled={!newSlot} onClick={async () => { try { await post(`/v1/bookings/${resched.id}/reschedule`, { slot: newSlot }); toast(tr("rescheduled")); load(); } catch (e) { toast(e instanceof ApiError && e.status === 409 ? tr("slotTaken") : e instanceof ApiError ? e.message : tr("net"), "err"); } setResched(null); }}>{tr("reschedule")}</CTA>
        </GSheet>)}</AnimatePresence>

      <AnimatePresence>{report && (
        <GSheet open onClose={() => setReport(null)} title={tr("reportTitle")}>
          <h3 className="text-[22px]">⚠️ {tr("reportTitle")}</h3><p className="mt-2 text-[14px] font-medium text-g-mute">{tr("reportHint")}</p>
          <textarea aria-label={tr("report")} value={reportText} onChange={(e) => setReportText(e.target.value)} rows={4} className="mt-4 w-full resize-none rounded-[1.5rem] bg-white p-5 text-[15px] font-medium shadow-g-card outline-none ring-2 ring-transparent focus:ring-g-ink" />
          <CTA className="mt-5" disabled={reportText.trim().length < 10} onClick={async () => { try { await post(`/v1/bookings/${report.id}/disputes`, { reason: reportText.trim() }); toast(tr("reportSent")); load(); } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } setReport(null); }}>{tr("reportSend")}</CTA>
        </GSheet>)}</AnimatePresence>

      <AnimatePresence>{rate && (
        <GSheet open onClose={() => setRate(null)} title={tr("rateTitle")}>
          <h3 className="text-center text-[22px]">{tr("rateTitle")}</h3>
          <div className="mt-5 flex justify-center gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n}`} onClick={() => setStars(n)} className="transition active:scale-90"><Star size={42} strokeWidth={1.8} className={n <= stars ? "fill-g-saffron text-g-saffron" : "text-g-faint"} /></button>)}</div>
          <textarea aria-label={tr("rate")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-5 w-full resize-none rounded-[1.5rem] bg-white p-5 text-[15px] font-medium shadow-g-card outline-none ring-2 ring-transparent focus:ring-g-ink" />
          <CTA className="mt-5" onClick={async () => { try { await post(`/v1/bookings/${rate.id}/reviews`, { rating: stars, comment: note.trim() || undefined }); toast(tr("rated")); } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } setRate(null); }}>{tr("sendRating")}</CTA>
        </GSheet>)}</AnimatePresence>
    </>
  );
}

function BookingDetail({ booking, live, onClose, onCancel }: { booking: Booking | null; live?: Live; onClose: () => void; onCancel: (id: string) => void }) {
  const tr = useTr(); const [prov, setProv] = useState<{ name: string | null; rating: number; jobs: number; tier: number } | null>(null); const pid = booking?.providerId;
  useEffect(() => { setProv(null); if (booking && pid) api(`/v1/bookings/${booking.id}/provider`).then(setProv).catch(() => {}); }, [booking?.id, pid]); // eslint-disable-line
  if (!booking) return null;
  const searching = booking.mode === "dispatch" && booking.state === "Requested"; const unfilled = booking.mode === "dispatch" && booking.state === "Expired";
  const d = live && booking.lat != null && booking.lng != null && booking.lat !== 0 ? distM(live.lat, live.lng, booking.lat, booking.lng) : null;
  const step = Math.max(0, STEPS.indexOf(["Confirmed", "Settled"].includes(booking.state) ? "Completed" : booking.state));
  return (
    <GSheet open onClose={onClose} title={`#${booking.id.slice(0, 8)}`}>
      {searching ? (
        <div className="py-3 text-center"><div className="relative mx-auto grid h-40 w-40 place-items-center">{[0, 1, 2].map((i) => <motion.span key={i} className="absolute h-32 w-32 rounded-full border-2 border-g-ink" initial={{ scale: 0.3, opacity: 0.55 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }} />)}<span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-g-ink text-white"><MapPin size={30} /></span></div><h3 className="mt-2 text-[24px]">{tr("searching")}</h3><p className="mx-auto mt-2 max-w-[280px] text-[14px] font-medium text-g-mute">{tr("searchingHint")}</p></div>
      ) : unfilled ? <div className="py-6 text-center"><div className="text-5xl">😕</div><h3 className="mt-3 text-[22px]">{tr("unfilledTitle")}</h3><p className="mx-auto mt-2 max-w-[280px] text-[14px] font-medium text-g-mute">{tr("unfilledHint")}</p></div> : (
        <>
          <div className="text-[13px] font-bold uppercase tracking-wide text-g-mute">{tr("yourProvider")}</div>
          {pid && <Card className="mt-2.5 flex items-center gap-4 p-4"><Avatar id={pid} label={(prov?.name ?? "H").slice(0, 2)} size={58} /><div className="min-w-0 flex-1"><div className="truncate text-[19px] font-extrabold">{prov?.name ?? tr("anon")}</div><div className="mt-1"><RatingPill value={prov?.rating ?? 0} count={prov?.jobs ?? 0} /></div></div>{(prov?.tier ?? 0) >= 1 && <ShieldCheck size={24} className="text-g-accent" aria-label={tr("verified")} />}</Card>}
          <div className="mt-6 flex items-center justify-between"><span className="text-[18px] font-extrabold">{tr("s_" + booking.state)}</span><Tag tone={stateTone(booking.state)}>{tr("s_" + booking.state)}</Tag></div>
          <div className="mt-4 flex items-center">{STEPS.map((_, n) => <div key={n} className="flex flex-1 items-center last:flex-none"><span className={cn("h-3 w-3 rounded-full transition", n <= step ? "bg-g-ink" : "bg-black/15")} />{n < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 transition", n < step ? "bg-g-ink" : "bg-black/15")} />}</div>)}</div>
          {d != null && ["Accepted", "EnRoute", "Arrived"].includes(booking.state) && <Card className="mt-5 flex items-center gap-4 bg-g-green-soft p-5 shadow-none"><span className="text-3xl">🛵</span><div><div className="text-[18px] font-extrabold">{tr("arrivesIn")} {etaMin(d)} {tr("minShort")}</div><div className="text-[14px] font-medium text-g-mute">{(d / 1000).toFixed(1)} {tr("km")} {tr("away")}</div></div></Card>}
        </>
      )}
      <div className="mt-6 text-center text-[14px] font-semibold text-g-mute">{booking.totalCentimes / 100} {tr("mad")} · 💵 {tr("cash")}</div>
      <div className="mt-5 flex gap-3">{["Requested", "Accepted"].includes(booking.state) && <CTA tone="danger" className="h-14 flex-1" onClick={() => onCancel(booking.id)}>{tr("cancel")}</CTA>}<CTA tone="ghost" className="h-14 flex-1" onClick={onClose}>{tr("back")}</CTA></div>
    </GSheet>
  );
}

/* ---------- profile ---------- */
function Profile() {
  const tr = useTr(); const [me, setMe] = useState<{ phone: string } | null>(null); const done = useRef(false);
  useEffect(() => { if (done.current) return; done.current = true; api("/v1/me").then(setMe).catch(() => {}); }, []);
  return (
    <>
      <PageTitle>{tr("profile")}</PageTitle>
      <div className="space-y-4 px-5">
        <SceneArt cat="lending" shade={false} emojiSize={110} className="rounded-[2rem] p-6 text-white">
          <div className="relative z-10 flex items-center gap-4"><Avatar id={me?.phone ?? "me"} label={me?.phone?.slice(-2) ?? "··"} size={68} /><div><div className="text-[22px] font-extrabold" dir="ltr">{me?.phone ?? "…"}</div><div className="text-[14px] font-semibold text-white/80">{tr("account")}</div></div></div>
        </SceneArt>
        <Card className="p-5"><div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-g-mute">{tr("language")}</div><LangPills /></Card>
        <CTA tone="danger" onClick={() => save(null)}><LogOut size={18} />{tr("logout")}</CTA>
      </div>
      <X className="hidden" />
    </>
  );
}
