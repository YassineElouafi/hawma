import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CalendarCheck, Home, LogOut, MapPin, Receipt, Search, Star, User, X } from "lucide-react";
import { useI18n, LANGS, type Lang } from "@/i18n";
import { Avatar, Card, Empty, OBtn, Pill, Segmented, Skeleton, stateTone } from "@/components/arc/primitives";
import { Toaster, useToast } from "@/components/arc/overlays";
import { cn } from "@/lib/utils";
import { api, ApiError, isAuthed, onAuthChange, post, save } from "./api";

const CATS = [["cleaning", "✨"], ["diy", "🔧"], ["garden", "🌿"], ["tutoring", "📚"], ["errands", "🛒"], ["rides", "🚗"], ["pets", "🐾"], ["lending", "📦"]] as const;
const emojiOf = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? "•";
const T: Record<Lang, Record<string, string>> = {
  fr: { tag: "Ton quartier, ton équipe.", phone: "Numéro de téléphone", send: "Recevoir le code", code: "Code à 6 chiffres", verify: "Valider", devCode: "Code de test (pilote)", bad: "Numéro marocain invalide", wrong: "Code incorrect ou expiré", net: "Connexion impossible",
    hello: "Bonjour 👋", find: "De quoi as-tu besoin ?", search: "Rechercher un service…", all: "Tout", near: "Près de chez toi", empty: "Aucun service trouvé.", book: "Réserver", booked: "Demande envoyée ✔", cash: "Paiement cash à la fin", mad: "MAD", km: "km", verified: "Vérifié", avail: "Disponible cette semaine",
    home: "Accueil", bookings: "Réservations", profile: "Profil", active: "En cours", past: "Terminées", noActive: "Aucune réservation en cours", noPast: "Historique vide", cancel: "Annuler", confirm: "Confirmer", rate: "Noter", rated: "Merci pour ton avis ✔", rateTitle: "Comment s'est passé le service ?", sendRating: "Envoyer",
    language: "Langue", logout: "Se déconnecter", account: "Compte", back: "Retour", reviews: "avis", jobs: "missions", c_cleaning: "Ménage", c_diy: "Bricolage", c_garden: "Jardin", c_tutoring: "Cours", c_errands: "Courses", c_rides: "Transport", c_pets: "Animaux", c_lending: "Prêt",
    s_Requested: "En attente", s_Accepted: "Acceptée", s_EnRoute: "En route", s_Arrived: "Arrivé", s_InProgress: "En cours", s_Completed: "Terminée", s_Confirmed: "Confirmée", s_Settled: "Réglée", s_Cancelled: "Annulée", s_Declined: "Refusée", s_Disputed: "Litige", s_Expired: "Expirée", s_Refunded: "Remboursée", s_Offered: "Proposée" },
  ar: { tag: "حيّك، فريقك.", phone: "رقم الهاتف", send: "أرسل الرمز", code: "رمز من 6 أرقام", verify: "تأكيد", devCode: "رمز تجريبي", bad: "رقم مغربي غير صالح", wrong: "الرمز خاطئ أو منتهي", net: "تعذّر الاتصال",
    hello: "مرحبا 👋", find: "ماذا تحتاج؟", search: "ابحث عن خدمة…", all: "الكل", near: "قريب منك", empty: "لا خدمات.", book: "احجز", booked: "تم إرسال الطلب ✔", cash: "الدفع نقدا عند الانتهاء", mad: "درهم", km: "كلم", verified: "موثّق", avail: "متاح هذا الأسبوع",
    home: "الرئيسية", bookings: "الحجوزات", profile: "حسابي", active: "جارية", past: "منتهية", noActive: "لا حجوزات جارية", noPast: "السجل فارغ", cancel: "إلغاء", confirm: "تأكيد", rate: "قيّم", rated: "شكرا على تقييمك ✔", rateTitle: "كيف كانت الخدمة؟", sendRating: "إرسال",
    language: "اللغة", logout: "تسجيل الخروج", account: "الحساب", back: "رجوع", reviews: "تقييم", jobs: "مهمة", c_cleaning: "تنظيف", c_diy: "إصلاحات", c_garden: "حديقة", c_tutoring: "دروس", c_errands: "مشتريات", c_rides: "نقل", c_pets: "حيوانات", c_lending: "إعارة",
    s_Requested: "قيد الانتظار", s_Accepted: "مقبولة", s_EnRoute: "في الطريق", s_Arrived: "وصل", s_InProgress: "قيد التنفيذ", s_Completed: "منتهية", s_Confirmed: "مؤكدة", s_Settled: "مسوّاة", s_Cancelled: "ملغاة", s_Declined: "مرفوضة", s_Disputed: "نزاع", s_Expired: "منتهية", s_Refunded: "مستردة", s_Offered: "مقترحة" },
  da: {} as Record<string, string>,
};
T.da = { ...T.ar, tag: "حومتك، فريقك.", send: "صيفط ليا الكود", code: "كود من 6 أرقام", wrong: "الكود غالط ولا سالا", hello: "السلام 👋", find: "شنو محتاج؟", search: "قلّب على خدمة…", all: "كلشي", cash: "خلّص كاش فالأخير", booked: "تصيفطات الطلب ✔", c_diy: "بريكولاج", c_cleaning: "نقاء", c_garden: "جردة", c_errands: "كورسات", c_lending: "تسليف", noActive: "ما كاين حتى حجز جاري", logout: "خروج", s_Requested: "كيتسنّى", s_EnRoute: "فالطريق", s_Completed: "سالات" };

interface Hit { id: string; title: string; categoryId: string; priceCentimes: number; distanceM: number; rating: number; jobs: number; tier: number; availableThisWeek: boolean; providerId: string }
interface Booking { id: string; state: string; providerId: string | null; customerId: string; totalCentimes: number; paymentMethod: string }
const ACTIVE = ["Requested", "Offered", "Accepted", "EnRoute", "Arrived", "InProgress"];
const CENTER = { lat: 33.5883, lng: -7.635 };

export default function WebApp() {
  const [authed, setAuthed] = useState(isAuthed()); useEffect(() => { const off = onAuthChange(() => setAuthed(isAuthed())); return () => { off(); }; }, []);
  const { rtl } = useI18n();
  return <div className="ops-root min-h-dvh" dir={rtl ? "rtl" : "ltr"}><Toaster>{authed ? <Main /> : <Login />}</Toaster></div>;
}

function useTr() { const { lang } = useI18n(); return (k: string) => T[lang][k] ?? T.fr[k] ?? k; }
function LangPills({ dark }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  return <div className={cn("inline-flex rounded-full p-0.5 text-xs font-semibold", dark ? "bg-white/10" : "bg-ops-hover")}>{LANGS.map((l) => <button key={l.id} onClick={() => setLang(l.id)} className={cn("rounded-full px-3 py-1.5 transition", lang === l.id ? "bg-saffron text-emerald-950" : dark ? "text-white/70" : "text-ops-muted")}>{l.label}</button>)}</div>;
}

function Login() {
  const tr = useTr(); const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [step, setStep] = useState<"phone" | "code">("phone"); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [dev, setDev] = useState("");
  const field = "h-12 w-full rounded-xl border border-ops-border bg-ops-card px-4 text-lg outline-none transition focus:border-ops-accent focus:ring-4 focus:ring-ops-ring";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      if (step === "phone") { const r = await post("/v1/auth/otp/request", { phone }, false); setDev(r.devCode ?? ""); if (r.devCode) setCode(r.devCode); setStep("code"); }
      else save(await post("/v1/auth/otp/verify", { phone, code }, false));
    } catch (x) { setErr(x instanceof ApiError ? (x.status === 400 && step === "phone" ? tr("bad") : step === "code" ? tr("wrong") : x.message) : tr("net")); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-emerald-950">
      <div className="zellige flex flex-1 flex-col justify-between p-6 text-white">
        <LangPills dark />
        <div><div className="grid h-16 w-16 place-items-center rounded-2xl bg-saffron font-display text-4xl font-bold text-emerald-950 shadow-xl">ح</div><h1 className="mt-5 font-display text-5xl font-semibold tracking-tight">Hawma</h1><p className="mt-2 text-xl font-medium text-saffron">{tr("tag")}</p></div>
      </div>
      <form onSubmit={submit} className="rounded-t-[2rem] bg-ops-bg p-6 pb-10">
        <label htmlFor="w-phone" className="mb-1.5 block text-[13px] font-medium text-ops-muted">{tr("phone")}</label>
        <input id="w-phone" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={step === "code"} className={field} />
        {step === "code" && <><label htmlFor="w-code" className="mb-1.5 mt-4 block text-[13px] font-medium text-ops-muted">{tr("code")}</label>
          <input id="w-code" dir="ltr" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={cn(field, "text-center text-2xl font-semibold tracking-[0.5em]")} />
          {dev && <Pill tone="amber" className="mt-3">{tr("devCode")}: {dev}</Pill>}</>}
        {err && <p role="alert" className="mt-4 rounded-lg bg-ops-red/10 px-3 py-2 text-ops-red">{err}</p>}
        <OBtn variant="primary" className="mt-6 h-12 w-full rounded-full text-base" disabled={busy || (step === "phone" ? phone.length < 8 : code.length !== 6)}>{step === "phone" ? tr("send") : tr("verify")}</OBtn>
      </form>
    </div>
  );
}

type Tab = "home" | "bookings" | "profile";
function Main() {
  const tr = useTr(); const [tab, setTab] = useState<Tab>("home");
  const tabs: [Tab, typeof Home, string][] = [["home", Home, tr("home")], ["bookings", Receipt, tr("bookings")], ["profile", User, tr("profile")]];
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-ops-bg shadow-2xl">
      <main className="flex-1 pb-24">{tab === "home" ? <Explore /> : tab === "bookings" ? <Bookings /> : <Profile />}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] border-t border-ops-border bg-ops-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        {tabs.map(([k, I, l]) => <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className="flex flex-1 flex-col items-center gap-1 text-[11px] font-semibold">
          <span className={cn("relative grid h-8 w-14 place-items-center rounded-full transition-colors", tab === k ? "text-ops-accent" : "text-ops-muted")}>{tab === k && <motion.span layoutId="wtab" className="absolute inset-0 rounded-full bg-ops-accent/12" />}<I size={20} className="relative" /></span><span className={tab === k ? "text-ops-accent" : "text-ops-muted"}>{l}</span></button>)}
      </nav>
    </div>
  );
}

const Title = ({ sub, children }: { sub?: string; children: React.ReactNode }) => <div className="px-5 pb-2 pt-8">{sub && <div className="text-[13px] font-medium text-ops-muted">{sub}</div>}<h1 className="text-[28px] font-bold leading-tight tracking-tight">{children}</h1></div>;

function Explore() {
  const tr = useTr(); const toast = useToast(); const [q, setQ] = useState(""); const [cat, setCat] = useState("all"); const [hits, setHits] = useState<Hit[] | null>(null); const [sel, setSel] = useState<Hit | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = setTimeout(async () => { try { const p = new URLSearchParams({ lat: String(CENTER.lat), lng: String(CENTER.lng), radiusM: "10000", limit: "30" }); if (cat !== "all") p.set("categoryId", cat); if (q.trim()) p.set("q", q.trim()); setHits(await api(`/v1/search?${p}`, { auth: false })); } catch { setHits([]); } }, 250);
    return () => clearTimeout(h);
  }, [q, cat]);
  const book = async () => { if (!sel) return; setBusy(true); try { await post("/v1/bookings", { mode: "catalogue", providerId: sel.providerId, totalCentimes: sel.priceCentimes, paymentMethod: "cash" }); toast(tr("booked")); setSel(null); } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } finally { setBusy(false); } };
  return (
    <>
      <Title sub={tr("hello")}>{tr("find")}</Title>
      <div className="px-5"><div className="relative"><Search size={17} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ops-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("search")} aria-label={tr("search")} className="h-12 w-full rounded-full border border-ops-border bg-ops-card ps-11 pe-4 outline-none transition focus:border-ops-accent focus:ring-4 focus:ring-ops-ring" /></div></div>
      <div className="mt-5 grid grid-cols-4 gap-2 px-5">
        {[["all", "✦"], ...CATS].map(([id, e]) => <button key={id} onClick={() => setCat(id)} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-[11.5px] font-semibold transition", cat === id ? "border-ops-accent bg-ops-accent text-ops-accent-fg shadow-md" : "border-ops-border bg-ops-card hover:bg-ops-hover")}><span className="text-2xl">{e}</span>{id === "all" ? tr("all") : tr("c_" + id)}</button>)}
      </div>
      <h2 className="px-5 pb-3 pt-7 text-xl font-bold">{tr("near")}</h2>
      <div className="space-y-2.5 px-5">
        {!hits && [0, 1, 2].map((i) => <Card key={i} className="flex items-center gap-3 p-3.5"><Skeleton className="h-[52px] w-[52px] rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></Card>)}
        {hits?.map((h, i) => (
          <motion.button key={h.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} onClick={() => setSel(h)} className="flex w-full items-center gap-3 rounded-2xl border border-ops-border bg-ops-card p-3.5 text-start shadow-sm transition hover:shadow-md active:scale-[.99]">
            <Avatar id={h.providerId} label={emojiOf(h.categoryId)} size={52} />
            <div className="min-w-0 flex-1"><div className="truncate font-bold">{h.title}</div><div className="mt-1 flex items-center gap-2 text-xs text-ops-muted"><span className="flex items-center gap-1 font-semibold text-ops-fg"><Star size={12} className="fill-saffron text-saffron" />{h.rating.toFixed(1)}</span>({h.jobs})<span>·</span><MapPin size={12} />{(h.distanceM / 1000).toFixed(1)} {tr("km")}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{h.tier >= 1 && <Pill tone="accent"><BadgeCheck size={11} />{tr("verified")}</Pill>}{h.availableThisWeek && <Pill tone="green" dot>{tr("avail")}</Pill>}</div></div>
            <div className="text-end"><div className="text-lg font-bold text-ops-accent">{h.priceCentimes / 100}</div><div className="text-[11px] text-ops-muted">{tr("mad")}</div></div>
          </motion.button>
        ))}
        {hits?.length === 0 && <Empty icon={<Search size={18} />} title={tr("empty")} />}
      </div>
      <AnimatePresence>{sel && (<>
        <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSel(null)} />
        <motion.div role="dialog" aria-label={sel.title} className="ops-root fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-[2rem] bg-ops-bg p-5 pb-8 shadow-2xl" initial={{ y: 400 }} animate={{ y: 0 }} exit={{ y: 400 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}>
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ops-border" />
          <div className="flex items-center gap-3.5"><Avatar id={sel.providerId} label={emojiOf(sel.categoryId)} size={60} /><div className="flex-1"><h3 className="text-xl font-bold leading-tight">{sel.title}</h3><div className="mt-1.5 flex gap-1.5">{sel.tier >= 1 && <Pill tone="accent"><BadgeCheck size={11} />{tr("verified")}</Pill>}{sel.availableThisWeek && <Pill tone="green" dot>{tr("avail")}</Pill>}</div></div><OBtn variant="ghost" size="sm" aria-label={tr("back")} onClick={() => setSel(null)}><X size={16} /></OBtn></div>
          <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">{[[tr("reviews"), `⭐ ${sel.rating.toFixed(1)}`], [tr("jobs"), String(sel.jobs)], ["📍", `${(sel.distanceM / 1000).toFixed(1)} ${tr("km")}`]].map(([l, v]) => <Card key={l} className="py-3"><div className="text-[11.5px] text-ops-muted">{l}</div><div className="mt-0.5 font-bold">{v}</div></Card>)}</div>
          <Card className="mt-3 divide-y divide-ops-border"><div className="flex justify-between px-4 py-3"><span className="text-ops-muted">{tr("mad")}</span><b>{sel.priceCentimes / 100} {tr("mad")}</b></div><div className="flex justify-between px-4 py-3"><span className="text-ops-muted">💵</span><b>{tr("cash")}</b></div></Card>
          <OBtn variant="primary" className="mt-5 h-12 w-full rounded-full text-base" disabled={busy} onClick={book}><CalendarCheck size={18} />{tr("book")}</OBtn>
        </motion.div></>)}</AnimatePresence>
    </>
  );
}

function Bookings() {
  const tr = useTr(); const toast = useToast(); const [items, setItems] = useState<Booking[] | null>(null); const [seg, setSeg] = useState<"active" | "past">("active"); const [rate, setRate] = useState<Booking | null>(null); const [stars, setStars] = useState(5); const [note, setNote] = useState("");
  const load = useCallback(async () => { try { setItems(await api("/v1/bookings")); } catch { setItems([]); } }, []);
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);
  const run = async (id: string, cmd: string) => { try { await post(`/v1/bookings/${id}/${cmd}`); load(); } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } };
  const shown = (items ?? []).filter((b) => (seg === "active") === ACTIVE.includes(b.state));
  return (
    <>
      <Title>{tr("bookings")}</Title>
      <div className="px-5"><Segmented value={seg} onChange={setSeg} options={[{ id: "active", label: tr("active") }, { id: "past", label: tr("past") }]} /></div>
      <div className="mt-4 space-y-2.5 px-5">
        {!items && <Skeleton className="h-24" />}
        {shown.map((b) => (
          <Card key={b.id} className="p-4">
            <div className="flex items-center justify-between"><div><div className="font-bold">#{b.id.slice(0, 8)}</div><div className="mt-0.5 text-xs text-ops-muted">{b.totalCentimes / 100} {tr("mad")} · 💵</div></div><Pill tone={stateTone(b.state)} dot>{tr("s_" + b.state)}</Pill></div>
            <div className="mt-3 flex gap-2">
              {["Requested", "Accepted"].includes(b.state) && <OBtn size="sm" onClick={() => run(b.id, "cancel")}>{tr("cancel")}</OBtn>}
              {b.state === "Completed" && <OBtn size="sm" variant="primary" onClick={() => run(b.id, "confirm")}>{tr("confirm")}</OBtn>}
              {["Confirmed", "Settled"].includes(b.state) && <OBtn size="sm" onClick={() => { setStars(5); setNote(""); setRate(b); }}><Star size={13} />{tr("rate")}</OBtn>}
            </div>
          </Card>
        ))}
        {items && shown.length === 0 && <Empty icon={<Receipt size={18} />} title={seg === "active" ? tr("noActive") : tr("noPast")} />}
      </div>
      <AnimatePresence>{rate && (<>
        <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRate(null)} />
        <motion.div role="dialog" aria-label={tr("rateTitle")} className="ops-root fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-[2rem] bg-ops-bg p-6 pb-8 shadow-2xl" initial={{ y: 360 }} animate={{ y: 0 }} exit={{ y: 360 }}>
          <h3 className="text-center text-xl font-bold">{tr("rateTitle")}</h3>
          <div className="mt-4 flex justify-center gap-1.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n}`} onClick={() => setStars(n)}><Star size={36} className={n <= stars ? "fill-saffron text-saffron" : "text-ops-border"} /></button>)}</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-4 w-full resize-none rounded-xl border border-ops-border bg-ops-card p-3 outline-none focus:border-ops-accent focus:ring-4 focus:ring-ops-ring" />
          <OBtn variant="primary" className="mt-4 h-12 w-full rounded-full text-base" onClick={async () => { try { await post(`/v1/bookings/${rate.id}/reviews`, { rating: stars, comment: note.trim() || undefined }); toast(tr("rated")); } catch (e) { toast(e instanceof ApiError ? e.message : tr("net"), "err"); } setRate(null); }}>{tr("sendRating")}</OBtn>
        </motion.div></>)}</AnimatePresence>
    </>
  );
}

function Profile() {
  const tr = useTr(); const [me, setMe] = useState<{ phone: string } | null>(null); const done = useRef(false);
  useEffect(() => { if (done.current) return; done.current = true; api("/v1/me").then(setMe).catch(() => {}); }, []);
  return (
    <>
      <Title>{tr("profile")}</Title>
      <div className="space-y-4 px-5">
        <Card className="flex items-center gap-4 p-4"><Avatar id={me?.phone ?? "me"} label={me?.phone?.slice(-2) ?? "··"} size={56} /><div><div className="text-lg font-bold" dir="ltr">{me?.phone ?? "…"}</div><div className="text-[13px] text-ops-muted">{tr("account")}</div></div></Card>
        <Card className="p-4"><div className="mb-3 text-[13px] font-medium text-ops-muted">{tr("language")}</div><LangPills /></Card>
        <OBtn variant="outline" className="h-12 w-full rounded-full text-ops-red" onClick={() => save(null)}><LogOut size={16} />{tr("logout")}</OBtn>
      </div>
    </>
  );
}
