import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, Banknote, CheckCircle2, Home, MapPin, MessageCircle, Mic, Plus, Repeat, Search, Send, ShieldCheck, Smartphone, Star, User, Users, Flag, ChevronRight } from "lucide-react";
import { useI18n, LANGS } from "@/i18n";
import { CATS, HOODS, SEED, type Cat, type Listing } from "@/data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Tab = "home" | "map" | "post" | "chat" | "me";
interface Msg { me?: boolean; t: string }
interface State {
  onboarded: boolean; hood: string; radius: number; mine: Listing[]; chats: Record<number, Msg[]>;
  verif: { phone: boolean; cin: boolean; photo: boolean }; group: boolean;
}
const INIT: State = { onboarded: false, hood: "Maarif", radius: 5, mine: [], chats: {}, verif: { phone: false, cin: false, photo: false }, group: false };

function useStore(demo: boolean) {
  const [s, set] = useState<State>(() => {
    if (demo) return { ...INIT, onboarded: true };
    try { return { ...INIT, ...JSON.parse(localStorage.getItem("hawma.state") || "{}") }; } catch { return INIT; }
  });
  useEffect(() => { if (!demo) localStorage.setItem("hawma.state", JSON.stringify(s)); }, [s, demo]);
  return [s, (p: Partial<State>) => set((x) => ({ ...x, ...p }))] as const;
}

type Item = Listing & { lat: number; lng: number; km: number };
const kmOf = (x: Listing) => (x.mine ? 0.1 : +Math.hypot(x.dx * 111, x.dy * 92).toFixed(1));

export default function App({ demo = false }: { demo?: boolean }) {
  const { t, lang, setLang, rtl } = useI18n();
  const [s, up] = useStore(demo);
  const [tab, setTab] = useState<Tab>("home");
  const [cat, setCat] = useState<Cat | "all">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [chat, setChat] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(shell.current), []);
  useEffect(() => { if (!demo && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, [demo]);

  const [c0, c1] = HOODS[s.hood];
  const all: Item[] = useMemo(() => [...s.mine, ...SEED].map((x) => ({ ...x, lat: x.mine ? c0 + x.dy : c0 + x.dy, lng: c1 + x.dx, km: kmOf(x) })), [s.mine, c0, c1]);
  const shown = all.filter((x) => x.km <= s.radius && (cat === "all" || x.cat === cat) && (x.title + x.desc + x.who).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.km - b.km);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const item = all.find((x) => x.id === sel);
  const chatItem = all.find((x) => x.id === chat);
  const catLabel = (c: Cat) => t("c_" + c);

  if (!s.onboarded) return <Onboarding onDone={(p) => { up({ ...p, onboarded: true }); }} />;

  const tabs: { id: Tab; icon: typeof Home }[] = [{ id: "home", icon: Home }, { id: "map", icon: MapPin }, { id: "post", icon: Plus }, { id: "chat", icon: MessageCircle }, { id: "me", icon: User }];

  return (
    <div ref={shell} dir={rtl ? "rtl" : "ltr"} className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="relative flex items-center gap-3 bg-primary px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-primary-foreground">
        <div className="zellige absolute inset-0 opacity-60" />
        <div className="relative flex flex-1 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-saffron font-display text-xl font-bold text-primary">ح</span>
          <div className="leading-tight"><div className="font-display text-lg font-semibold">Hawma</div><div className="flex items-center gap-1 text-[11px] opacity-70"><MapPin size={10} />{s.hood} · {s.radius} km</div></div>
        </div>
        <div className="relative flex rounded-full bg-white/10 p-0.5 text-[11px] font-semibold">
          {LANGS.map((l) => <button key={l.id} onClick={() => setLang(l.id)} className={cn("rounded-full px-2.5 py-1 transition", lang === l.id ? "bg-saffron text-primary" : "text-white/70")}>{l.label}</button>)}
        </div>
      </header>

      <main className="no-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-4">
        {tab === "home" && (
          <div>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="rounded-full ps-11" />
            </div>
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {[{ id: "all" as const, emoji: "✦" }, ...CATS].map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)} className={cn("flex-none rounded-full border px-3.5 py-2 text-xs font-semibold transition", cat === c.id ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border bg-card")}>
                  {c.emoji} {c.id === "all" ? t("all") : catLabel(c.id)}
                </button>
              ))}
            </div>
            <div className="mb-3 mt-5 flex items-end justify-between"><h2 className="font-display text-2xl font-semibold">{t("near")}</h2><span className="text-xs text-muted-foreground">{shown.length} {t("results")}</span></div>
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {shown.map((x) => <ListingCard key={x.id} x={x} onClick={() => setSel(x.id)} />)}
              </AnimatePresence>
              {!shown.length && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}
            </div>
          </div>
        )}
        {tab === "map" && <MapView items={shown} center={[c0, c1]} radius={s.radius} onPick={setSel} />}
        {tab === "post" && <PostForm onSubmit={(l) => { up({ mine: [{ ...l, id: Date.now(), mine: true, who: "Moi", av: "😀", rating: 5, n: 0, ver: s.verif.cin, sup: false, dx: (Math.random() - .5) * .004, dy: (Math.random() - .5) * .004 }, ...s.mine] }); setTab("home"); flash(t("published")); }} />}
        {tab === "chat" && (
          Object.keys(s.chats).length ? (
            <div className="space-y-3">{Object.keys(s.chats).map((id) => { const x = all.find((a) => a.id === +id); if (!x) return null; const last = s.chats[+id].slice(-1)[0];
              return <button key={id} onClick={() => setChat(+id)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-start shadow-sm ring-1 ring-border"><Avatar a={x.av} /><div className="min-w-0 flex-1"><div className="font-semibold"><bdi>{x.who}</bdi></div><div className="truncate text-sm text-muted-foreground">{last?.t ?? x.title}</div></div><ChevronRight size={16} className="text-muted-foreground rtl:rotate-180" /></button>; })}</div>
          ) : <div className="mt-20 text-center text-muted-foreground"><MessageCircle className="mx-auto mb-3 opacity-40" size={44} /><p className="mx-auto max-w-[240px] text-sm">{t("nochat")}</p></div>
        )}
        {tab === "me" && (
          <div>
            <div className="mb-5 flex items-center gap-4"><div className="grid h-20 w-20 place-items-center rounded-3xl bg-saffron text-4xl">😀</div><div><h2 className="font-display text-2xl font-semibold">{t("bio")}</h2><p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={13} />{s.hood}</p></div></div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ver")}</h3>
            {(["phone", "cin", "photo"] as const).map((k) => (
              <Row key={k} icon={k === "phone" ? <Smartphone size={18} /> : k === "cin" ? <ShieldCheck size={18} /> : <User size={18} />} label={t("v_" + k)} done={s.verif[k]} onClick={() => up({ verif: { ...s.verif, [k]: true } })} t={t} />
            ))}
            <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("groups")}</h3>
            <Row icon={<Users size={18} />} label={t("g1")} done={s.group} onClick={() => up({ group: true })} t={t} joinLabel />
            <Row icon={<MapPin size={18} />} label={`${t("g2")} · ${s.hood}`} done t={t} joinLabel />
            {!demo && <Button variant="outline" className="mt-6 w-full" onClick={() => { localStorage.removeItem("hawma.state"); location.reload(); }}>{t("reset")}</Button>}
          </div>
        )}
      </main>

      <nav className="absolute inset-x-3 bottom-3 z-30 flex rounded-full bg-primary p-1.5 shadow-2xl shadow-primary/40 pb-[max(.375rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ id, icon: I }) => (
          <button key={id} onClick={() => setTab(id)} aria-label={t(id)} className={cn("relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-semibold transition", tab === id ? "text-primary" : "text-white/60")}>
            {tab === id && <motion.span layoutId="pill" className="absolute inset-0 rounded-full bg-saffron" transition={{ type: "spring", damping: 28, stiffness: 400 }} />}
            <I size={18} className="relative" /><span className="relative">{t(id)}</span>
          </button>
        ))}
      </nav>

      <Sheet open={!!item} onOpenChange={(o) => !o && setSel(null)} container={container} title={item?.title ?? ""}>
        {item && (
          <div>
            <div className="flex items-center gap-3"><Avatar a={item.av} big /><div><div className="font-semibold"><bdi>{item.who}</bdi></div><div className="mt-1 flex flex-wrap gap-1.5">{item.ver && <Badge><BadgeCheck size={11} />{t("verified")}</Badge>}{item.sup && <Badge variant="saffron">★ {t("super")}</Badge>}</div></div></div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
              <Info icon={<Star size={15} className="fill-saffron text-saffron" />} v={`${item.rating} (${item.n} ${t("reviews")})`} />
              <Info icon={<MapPin size={15} />} v={`${item.km} km`} />
              <Info icon={item.pay === "cash" ? <Banknote size={15} /> : <Smartphone size={15} />} v={item.pay === "cash" ? t("cash") : t("mobile")} wide />
              <Info icon={<Repeat size={15} />} v={item.weekly ? t("weekly") : t("once")} />
              <Info icon={<span className="font-bold">$</span>} v={item.price ? `${item.price} ${t("mad")}${item.per ? " / " + t(item.per) : ""}` : "🤝"} />
            </div>
            <Button className="mt-5 w-full" size="lg" onClick={() => { if (!s.chats[item.id]) up({ chats: { ...s.chats, [item.id]: [] } }); setSel(null); setChat(item.id); }}><MessageCircle size={18} />{t("book")}</Button>
            <Button variant="whatsapp" className="mt-2.5 w-full" onClick={() => window.open("https://wa.me/?text=" + encodeURIComponent(`Hawma 🏘️ ${item.title} — ${item.who} (${item.price || "gratuit"} MAD) ${location.origin}/app`), "_blank")}>{t("share")}</Button>
            <Button variant="ghost" className="mt-1 w-full text-terracotta" onClick={() => flash(t("disputed"))}><Flag size={15} />{t("dispute")}</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!chatItem} onOpenChange={(o) => !o && setChat(null)} container={container} title={chatItem?.who ?? ""} className="h-[92%]">
        {chatItem && <ChatView item={chatItem} msgs={s.chats[chatItem.id] ?? []} setMsgs={(m) => up({ chats: { ...s.chats, [chatItem.id]: m } })} onConfirm={() => flash(t("confirmed"))} />}
      </Sheet>

      <AnimatePresence>{toast && <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-6 bottom-24 z-[60] rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-medium text-background shadow-xl">{toast}</motion.div>}</AnimatePresence>
    </div>
  );
}

const Avatar = ({ a, big }: { a: string; big?: boolean }) => <div className={cn("grid flex-none place-items-center rounded-2xl bg-saffron/30", big ? "h-16 w-16 text-3xl" : "h-12 w-12 text-2xl")}>{a}</div>;
const Info = ({ icon, v, wide }: { icon: React.ReactNode; v: string; wide?: boolean }) => <div className={cn("flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2.5", wide && "col-span-2")}>{icon}<span className="text-[13px]">{v}</span></div>;

function Row({ icon, label, done, onClick, t, joinLabel }: { icon: React.ReactNode; label: string; done: boolean; onClick?: () => void; t: (k: string) => string; joinLabel?: boolean }) {
  return (
    <button disabled={done} onClick={onClick} className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-start ring-1 ring-border">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><span className="flex-1 text-sm font-medium">{label}</span>
      {done ? <span className="flex items-center gap-1 text-xs font-bold text-primary"><CheckCircle2 size={15} />{joinLabel ? t("joined") : t("done")}</span> : <span className="text-xs font-bold text-terracotta">{joinLabel ? t("join") : t("todo")} ›</span>}
    </button>
  );
}

function ListingCard({ x, onClick }: { x: Item; onClick: () => void }) {
  const { t } = useI18n();
  const emoji = CATS.find((c) => c.id === x.cat)!.emoji;
  return (
    <motion.button layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} whileTap={{ scale: .98 }} onClick={onClick}
      className="flex w-full gap-3 rounded-2xl bg-card p-3.5 text-start shadow-sm ring-1 ring-border transition hover:shadow-md">
      <Avatar a={x.av} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold leading-tight">{emoji} {x.title}</h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><bdi>{x.who}</bdi>{x.ver && <BadgeCheck size={13} className="text-primary" />}{x.sup && <Badge variant="saffron">★ {t("super")}</Badge>}</div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Star size={12} className="fill-saffron text-saffron" />{x.rating} <span className="opacity-60">({x.n})</span></span>
          <span className="flex items-center gap-1"><MapPin size={12} />{x.km} km</span>
          {x.pay === "cash" ? <Banknote size={13} /> : <Smartphone size={13} />}{x.weekly && <Repeat size={12} />}
        </div>
      </div>
      <div className="text-end"><div className="font-display text-lg font-bold text-primary">{x.price ? x.price : "🤝"}</div><div className="text-[10px] text-muted-foreground">{x.price ? `${t("mad")}${x.per ? " / " + t(x.per) : ""}` : ""}</div></div>
    </motion.button>
  );
}

function ChatView({ item, msgs, setMsgs, onConfirm }: { item: Item; msgs: Msg[]; setMsgs: (m: Msg[]) => void; onConfirm: () => void }) {
  const { t, list } = useI18n();
  const [v, setV] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef(msgs); live.current = msgs;
  useEffect(() => { ref.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs]);
  const send = (e: React.FormEvent) => {
    e.preventDefault(); const m = v.trim(); if (!m) return;
    const next = [...msgs, { me: true, t: m }]; setMsgs(next); setV("");
    const r = list("replies");
    setTimeout(() => setMsgs([...live.current, { t: r[Math.floor(Math.random() * r.length)] }]), 900);
  };
  return (
    <div className="flex h-[58vh] min-h-[320px] flex-col">
      <p className="mb-2 text-xs text-muted-foreground">{item.title}</p>
      <div ref={ref} className="no-scrollbar flex-1 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => <div key={i} className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", m.me ? "ms-auto rounded-ee-md bg-primary text-primary-foreground" : "rounded-es-md bg-card ring-1 ring-border")}>{m.t}</div>)}
      </div>
      <Button variant="outline" size="sm" className="my-2 self-start" onClick={onConfirm}><CheckCircle2 size={14} />{t("confirm")}</Button>
      <form onSubmit={send} className="flex gap-2"><Input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("type")} className="rounded-full" /><Button size="icon" aria-label="send"><Send size={16} className="rtl:-scale-x-100" /></Button></form>
    </div>
  );
}

function PostForm({ onSubmit }: { onSubmit: (l: Omit<Listing, "id" | "who" | "av" | "rating" | "n" | "ver" | "sup" | "dx" | "dy">) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ cat: "clean" as Cat, title: "", desc: "", price: "", pay: "cash" as "cash" | "mobile", weekly: false });
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold">{t("post")}</h2>
      <Label>{t("cat")}</Label><Select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value as Cat })}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.emoji} {t("c_" + c.id)}</option>)}</Select>
      <Label>{t("title")}</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <Label>{t("desc")}</Label><Textarea rows={3} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
      <Label>{t("price")}</Label><Input type="number" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      <Label>{t("pay")}</Label><Select value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value as "cash" | "mobile" })}><option value="cash">{t("cash")}</option><option value="mobile">{t("mobile")}</option></Select>
      <Label>{t("freq")}</Label><Select value={f.weekly ? "w" : "o"} onChange={(e) => setF({ ...f, weekly: e.target.value === "w" })}><option value="o">{t("once")}</option><option value="w">{t("weekly")}</option></Select>
      <Button variant="outline" disabled className="mt-4 w-full"><Mic size={16} />{t("voice")}</Button>
      <Button size="lg" className="mt-2.5 w-full" disabled={!f.title.trim()} onClick={() => onSubmit({ cat: f.cat, title: f.title.trim(), desc: f.desc, price: +f.price || 0, per: "", pay: f.pay, weekly: f.weekly })}>{t("publish")}</Button>
    </div>
  );
}

function MapView({ items, center, radius, onPick }: { items: Item[]; center: [number, number]; radius: number; onPick: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(center, radius > 3 ? Math.max(8, Math.round(14 - Math.log2(radius))) : 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    L.circle(center, { radius: radius * 1000, color: "#0b3d33", weight: 1.5, fillColor: "#f2b84b", fillOpacity: .08 }).addTo(map);
    items.forEach((x) => {
      const emoji = CATS.find((c) => c.id === x.cat)!.emoji;
      L.marker([x.lat, x.lng], { icon: L.divIcon({ className: "", iconSize: [38, 38], html: `<div style="width:38px;height:38px;display:grid;place-items:center;font-size:19px;background:#fffdf8;border:2px solid #0b3d33;border-radius:50% 50% 50% 8px;transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${emoji}</span></div>` }) }).addTo(map).on("click", () => onPick(x.id));
    });
    if (items.length) map.fitBounds(L.latLngBounds(items.map((x) => [x.lat, x.lng] as [number, number])).pad(0.25), { maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); };
  }, [items, center, radius, onPick]);
  return <div ref={el} className="h-[calc(100%-0.5rem)] min-h-[380px] overflow-hidden rounded-2xl ring-1 ring-border" />;
}

function Onboarding({ onDone }: { onDone: (p: Partial<State>) => void }) {
  const { t, lang, setLang, rtl } = useI18n();
  const [hood, setHood] = useState("Maarif");
  const [radius, setRadius] = useState(5);
  const [phone, setPhone] = useState("");
  return (
    <div dir={rtl ? "rtl" : "ltr"} className="zellige relative flex h-full flex-col overflow-y-auto bg-primary px-6 py-10 text-primary-foreground">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-saffron font-display text-3xl font-bold text-primary">ح</div>
      <h1 className="mt-6 font-display text-4xl font-semibold leading-tight">{t("onb_t1")} <span className="text-saffron">{t("onb_t2")}</span></h1>
      <p className="mt-2 text-white/70">{t("onb_p")}</p>
      <div className="mt-6 flex gap-2">{LANGS.map((l) => <button key={l.id} onClick={() => setLang(l.id)} className={cn("flex-1 rounded-full border py-2.5 text-sm font-semibold transition", lang === l.id ? "border-saffron bg-saffron text-primary" : "border-white/25")}>{l.label}</button>)}</div>
      <Label className="text-white/60">{t("hood")}</Label>
      <Select value={hood} onChange={(e) => setHood(e.target.value)} className="border-white/20 bg-white/10 text-white [&>option]:text-black">{Object.keys(HOODS).map((h) => <option key={h}>{h}</option>)}</Select>
      <Label className="text-white/60">{t("radius")} · {radius} km</Label>
      <input type="range" min={0.5} max={50} step={0.5} value={radius} onChange={(e) => setRadius(+e.target.value)} className="w-full accent-[#f2b84b]" />
      <Label className="text-white/60">{t("phone")}</Label>
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" inputMode="tel" dir="ltr" className="border-white/20 bg-white/10 text-white placeholder:text-white/40" />
      <Button variant="accent" size="lg" className="mt-8" onClick={() => onDone({ hood, radius, verif: { phone: !!phone, cin: false, photo: false } })}>{t("go")}</Button>
    </div>
  );
}
