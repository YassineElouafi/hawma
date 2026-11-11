import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, BadgeCheck, Banknote, ClipboardList, Command, Gauge, LayoutDashboard, LogOut, Menu, Moon, ScrollText, Search, ShieldCheck, Sprout, Sun, Users2, X } from "lucide-react";
import { Avatar, AreaChart, BarList, Card, CardBody, CardHeader, CardTitle, Empty, OBtn, Pill, Segmented, Skeleton, StatTile, Table, Td, Th, Tr, stateTone } from "@/components/arc/primitives";
import { CommandPalette, Toaster, useTheme, useToast, type Cmd } from "@/components/arc/overlays";
import { cn } from "@/lib/utils";

const API = "/api";
type Staff = { id: string; email: string; roles: string[] };
type Kyc = { id: string; userId: string; tier: number; status: string; documents: string[]; createdAt: string };
type Booking = { id: string; state: string; mode: string; customerId: string; providerId: string | null; totalCentimes: number; feeCentimes: number; paymentMethod: string; events?: { type: string; actor: string; at: string }[] };
type Audit = { id: number; at: string; actorId: string; action: string; target: string; reason?: string };
type Stats = { total: number; byState: Record<string, number>; gmvCentimes: number; feesCentimes: number; perDay: { date: string; count: number; gmvCentimes: number }[]; active: number; pendingKyc: number; fillRate: number | null };
type Page = "overview" | "kyc" | "bookings" | "audit";

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${token}`, ...init?.headers } });
  const t = await r.text(); const b = t ? JSON.parse(t) : undefined;
  if (!r.ok) throw new Error(b?.title ?? r.statusText);
  return b;
}
const can = (s: Staff, ...roles: string[]) => s.roles.includes("admin") || roles.some((r) => s.roles.includes(r));
const short = (id: string | null) => (id ? id.slice(0, 8) : "—");
const mad = (c: number) => `${Math.round(c / 100).toLocaleString("en-US")} MAD`;
const when = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const day = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function useLoad<T>(token: string, path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { setErr(""); call<T>(token, path).then(setData).catch((e) => setErr(e.message)); }, [token, path]); // eslint-disable-line
  useEffect(load, [load, ...deps]); // eslint-disable-line
  return { data, err, reload: load };
}

export default function OpsApp() {
  return <div className="ops-root min-h-dvh"><Toaster><Gate /></Toaster></div>;
}

function Gate() {
  const [token, setToken] = useState(() => sessionStorage.getItem("ops.token") ?? "");
  const [staff, setStaff] = useState<Staff | null>(null);
  useTheme();
  useEffect(() => { if (!token) return setStaff(null); call<Staff>(token, "/ops/me").then(setStaff).catch(() => { sessionStorage.removeItem("ops.token"); setToken(""); }); }, [token]);
  if (!token || !staff) return <Login onToken={(t) => { sessionStorage.setItem("ops.token", t); setToken(t); }} />;
  return <Shell token={token} staff={staff} onLogout={() => { sessionStorage.removeItem("ops.token"); setToken(""); setStaff(null); }} />;
}

/* ---------- login ---------- */
function Login({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await fetch(`${API}/ops/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }); const b = await r.json(); if (!r.ok) throw new Error(b.title ?? "Login failed"); onToken(b.token); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const field = "h-10 w-full rounded-lg border border-ops-border bg-ops-card px-3 outline-none transition focus:border-ops-accent focus:ring-4 focus:ring-ops-ring";
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="zellige relative hidden flex-col justify-between bg-emerald-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-saffron font-display text-xl font-bold text-emerald-950">ح</span><span className="font-display text-xl font-semibold">Hawma</span></div>
        <div><p className="font-display text-4xl font-semibold leading-tight">Run the neighbourhood,<br /><span className="text-saffron">calmly.</span></p><p className="mt-4 max-w-sm text-white/60">Dispatch, verification and finance for Morocco's on-demand services — every action audited.</p></div>
        <p className="text-xs text-white/40">© 2026 Hawma · Staff access only</p>
      </div>
      <div className="grid place-items-center p-6">
        <form onSubmit={go} className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1><p className="mt-1 text-ops-muted">Use your Hawma staff account.</p>
          <label htmlFor="ops-email" className="mb-1.5 mt-6 block text-[12.5px] font-medium">Email</label><input id="ops-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <label htmlFor="ops-password" className="mb-1.5 mt-4 block text-[12.5px] font-medium">Password</label><input id="ops-password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          {err && <p role="alert" className="mt-4 rounded-lg bg-ops-red/10 px-3 py-2 text-ops-red">{err}</p>}
          <OBtn variant="primary" className="mt-6 h-10 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</OBtn>
        </form>
      </div>
    </div>
  );
}

/* ---------- shell ---------- */
const NAV: { id: Page; label: string; icon: typeof Gauge }[] = [{ id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "kyc", label: "Verifications", icon: ShieldCheck }, { id: "bookings", label: "Bookings", icon: ClipboardList }, { id: "audit", label: "Audit log", icon: ScrollText }];

function Shell({ token, staff, onLogout }: { token: string; staff: Staff; onLogout: () => void }) {
  const [page, setPage] = useState<Page>(() => (location.hash.slice(1) as Page) || "overview");
  const [drawer, setDrawer] = useState(false); const [palette, setPalette] = useState(false); const [dark, toggle] = useTheme(); const toast = useToast();
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => { location.hash = page; }, [page]);
  useEffect(() => { call<Kyc[]>(token, "/ops/kyc").then((k) => setPending(k.length)).catch(() => {}); }, [token, page]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((o) => !o); } }; addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);
  const commands: Cmd[] = useMemo(() => [
    ...NAV.map((n) => ({ id: n.id, label: `Go to ${n.label}`, icon: <n.icon size={15} />, run: () => setPage(n.id) })),
    { id: "theme", label: dark ? "Switch to light theme" : "Switch to dark theme", icon: dark ? <Sun size={15} /> : <Moon size={15} />, run: toggle },
    { id: "out", label: "Sign out", icon: <LogOut size={15} />, run: onLogout },
  ], [dark]); // eslint-disable-line

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-4"><span className="grid h-7 w-7 place-items-center rounded-lg bg-ops-accent font-display text-base font-bold text-ops-accent-fg">ح</span><span className="font-semibold tracking-tight">Hawma <span className="text-ops-muted">Ops</span></span></div>
      <nav className="flex-1 px-2.5 py-2" aria-label="Main">
        <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-ops-muted">Workspace</p>
        {NAV.map((n) => (
          <button key={n.id} onClick={() => { setPage(n.id); setDrawer(false); }} aria-current={page === n.id ? "page" : undefined} className={cn("relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start font-medium transition-colors", page === n.id ? "text-ops-fg" : "text-ops-muted hover:bg-ops-hover hover:text-ops-fg")}>
            {page === n.id && <motion.span layoutId="nav" className="absolute inset-0 rounded-lg bg-ops-card shadow-sm ring-1 ring-ops-border" transition={{ type: "spring", damping: 30, stiffness: 380 }} />}
            <n.icon size={16} className="relative" /><span className="relative flex-1">{n.label}</span>
            {n.id === "kyc" && !!pending && <span className="relative rounded-md bg-ops-amber/25 px-1.5 text-[11px] font-semibold text-[color-mix(in_oklab,var(--ops-amber)_65%,black)] dark:text-ops-amber">{pending}</span>}
          </button>
        ))}
      </nav>
      <div className="border-t border-ops-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-1.5"><Avatar id={staff.id} label={staff.email} size={30} /><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{staff.email}</div><div className="truncate text-[11.5px] text-ops-muted">{staff.roles.join(" · ")}</div></div><OBtn variant="ghost" size="sm" aria-label="Sign out" onClick={onLogout}><LogOut size={14} /></OBtn></div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 border-e border-ops-border bg-ops-sidebar lg:block">{sidebar}</aside>
      <AnimatePresence>{drawer && <>
        <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
        <motion.aside className="fixed inset-y-0 start-0 z-50 w-[260px] border-e border-ops-border bg-ops-sidebar lg:hidden" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", damping: 32, stiffness: 340 }}>{sidebar}</motion.aside></>}</AnimatePresence>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ops-border bg-ops-bg/85 px-4 backdrop-blur lg:px-6">
          <OBtn variant="ghost" size="sm" className="lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={16} /></OBtn>
          <div className="text-[13px] text-ops-muted">Workspace <span className="mx-1">/</span> <span className="font-medium text-ops-fg">{NAV.find((n) => n.id === page)!.label}</span></div>
          <div className="ms-auto flex items-center gap-2">
            <button onClick={() => setPalette(true)} className="hidden h-8.5 items-center gap-2 rounded-lg border border-ops-border bg-ops-card px-3 text-ops-muted transition hover:bg-ops-hover sm:flex" aria-label="Open command palette"><Search size={14} />Search…<kbd className="ms-6 rounded border border-ops-border px-1.5 text-[10px]">⌘K</kbd></button>
            <OBtn variant="ghost" size="sm" aria-label="Toggle theme" onClick={toggle}>{dark ? <Sun size={15} /> : <Moon size={15} />}</OBtn>
          </div>
        </header>
        <main className="mx-auto max-w-[1180px] p-4 lg:p-6">
          <AnimatePresence mode="wait"><motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {page === "overview" && <Overview token={token} go={setPage} />}
            {page === "kyc" && <KycQueue token={token} staff={staff} onChange={(n) => setPending(n)} />}
            {page === "bookings" && <Bookings token={token} />}
            {page === "audit" && <AuditLog token={token} staff={staff} />}
          </motion.div></AnimatePresence>
          {can(staff, "admin") && <SeedDemo token={token} onDone={(m) => toast(m)} />}
        </main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} commands={commands} />
    </div>
  );
}

const PageHead = ({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) => <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-0.5 text-ops-muted">{sub}</p>}</div>{right}</div>;
const ErrBox = ({ m }: { m: string }) => m ? <p role="alert" className="mb-4 rounded-lg bg-ops-red/10 px-4 py-3 text-ops-red">{m}</p> : null;
const Rows = ({ n, cols }: { n: number; cols: number }) => <>{Array.from({ length: n }).map((_, i) => <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} className="px-4 py-3.5"><Skeleton className="h-3.5" /></td>)}</tr>)}</>;

/* ---------- overview ---------- */
function Overview({ token, go }: { token: string; go: (p: Page) => void }) {
  const { data: s, err } = useLoad<Stats>(token, "/ops/stats"); const { data: recent } = useLoad<Booking[]>(token, "/ops/bookings");
  const [fin, setFin] = useState<{ platformRevenue: number; cashHeld: number; earnings: number } | null>(null);
  useEffect(() => { call<{ platformRevenue: number; cashHeld: number; earnings: number }>(token, "/ops/finance").then(setFin).catch(() => {}); }, [token]);
  const [metric, setMetric] = useState<"count" | "gmv">("count");
  const days = s?.perDay ?? []; const series = days.map((d) => (metric === "count" ? d.count : Math.round(d.gmvCentimes / 100)));
  const half = Math.floor(days.length / 2); const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const delta = (arr: number[]) => { const prev = sum(arr.slice(0, half)), cur = sum(arr.slice(half)); return prev ? ((cur - prev) / prev) * 100 : null; };
  const states = Object.entries(s?.byState ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <PageHead title="Overview" sub="How the marketplace is doing across the last 14 days." right={<Pill tone="green" dot>Live</Pill>} />
      <ErrBox m={err} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {s ? <>
          <StatTile label="Bookings" value={s.total} icon={<Activity size={15} />} spark={days.map((d) => d.count)} delta={delta(days.map((d) => d.count))} />
          <StatTile label="Completed GMV" value={s.gmvCentimes / 100} format={(n) => Math.round(n).toLocaleString("en-US")} unit="MAD" icon={<Banknote size={15} />} spark={days.map((d) => d.gmvCentimes / 100)} color="var(--ops-blue)" delta={delta(days.map((d) => d.gmvCentimes))} />
          <StatTile label="Platform revenue" value={(fin?.platformRevenue ?? 0) / 100} format={(n) => Math.round(n).toLocaleString("en-US")} unit="MAD" icon={<Banknote size={15} />} color="var(--ops-violet)" />
          <StatTile label="Fill rate" value={(s.fillRate ?? 0) * 100} format={(n) => (s.fillRate == null ? "—" : `${Math.round(n)}%`)} icon={<Gauge size={15} />} color="var(--ops-green)" />
          <StatTile label="Verification queue" value={s.pendingKyc} icon={<Users2 size={15} />} color="var(--ops-amber)" />
        </> : Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-5 h-8 w-32" /></Card>)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Bookings over time</CardTitle><div className="mt-1 text-lg font-semibold tabular-nums">{s ? (metric === "count" ? `${sum(series)} bookings` : `${sum(series).toLocaleString("en-US")} MAD`) : "…"}</div></div><Segmented value={metric} onChange={setMetric} options={[{ id: "count", label: "Count" }, { id: "gmv", label: "GMV" }]} /></CardHeader>
          <CardBody>{s ? <AreaChart data={series} labels={days.map((d) => day(d.date))} format={(n) => n.toLocaleString("en-US")} /> : <Skeleton className="h-[220px]" />}</CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>By state</CardTitle><span className="text-xs text-ops-muted">{s?.active ?? 0} active now</span></CardHeader>
          <CardBody>{s && states.length ? <BarList items={states.map(([label, value]) => ({ label, value, tone: `var(--ops-${({ green: "green", red: "red", amber: "amber", blue: "blue", violet: "violet", neutral: "muted", accent: "accent" } as Record<string, string>)[stateTone(label)]})` }))} /> : s ? <Empty icon={<ClipboardList size={18} />} title="No bookings yet" hint="Bookings appear here as customers book services." /> : <Skeleton className="h-40" />}</CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Recent bookings</CardTitle><OBtn size="sm" variant="ghost" onClick={() => go("bookings")}>View all →</OBtn></CardHeader>
        <div className="pt-2"><Table><thead><tr><Th>Booking</Th><Th>State</Th><Th>Customer</Th><Th>Total</Th></tr></thead><tbody>
          {!recent && <Rows n={4} cols={4} />}
          {recent?.slice(0, 6).map((b) => <Tr key={b.id} onClick={() => go("bookings")}><Td className="font-mono text-xs">{short(b.id)}</Td><Td><Pill tone={stateTone(b.state)} dot>{b.state}</Pill></Td><Td><span className="inline-flex items-center gap-2"><Avatar id={b.customerId} size={22} /><span className="font-mono text-xs text-ops-muted">{short(b.customerId)}</span></span></Td><Td className="tabular-nums">{mad(b.totalCentimes)}</Td></Tr>)}
          {recent?.length === 0 && <tr><td colSpan={4}><Empty icon={<ClipboardList size={18} />} title="No bookings yet" /></td></tr>}
        </tbody></Table></div>
      </Card>
    </>
  );
}

/* ---------- verifications ---------- */
type DocMeta = { id: string; kind: string; mime: string; size: number };
/** Fetches each (audited) document with the staff token and shows it as a blob URL; nothing is cached by the browser (no-store). */
function DocGallery({ token, verificationId }: { token: string; verificationId: string }) {
  const [docs, setDocs] = useState<{ meta: DocMeta; url: string }[] | null>(null); const [err, setErr] = useState(""); const [big, setBig] = useState<string | null>(null);
  useEffect(() => {
    let dead = false; const urls: string[] = [];
    (async () => {
      try {
        const metas = await call<DocMeta[]>(token, `/ops/kyc/${verificationId}/documents`);
        const out = await Promise.all(metas.map(async (meta) => { const r = await fetch(`${API}/ops/documents/${meta.id}`, { headers: { authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error("document unavailable"); const u = URL.createObjectURL(await r.blob()); urls.push(u); return { meta, url: u }; }));
        if (!dead) setDocs(out);
      } catch (e) { if (!dead) setErr((e as Error).message); }
    })();
    return () => { dead = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [token, verificationId]);
  if (err) return <ErrBox m={err} />;
  if (!docs) return <div className="mt-4 grid grid-cols-3 gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>;
  if (!docs.length) return <p className="mt-4 rounded-lg bg-ops-amber/15 px-3 py-2 text-[12.5px]">No documents uploaded yet — you can still reject and ask the provider to resubmit.</p>;
  return (
    <>
      <p className="mb-1.5 mt-4 text-[12.5px] font-medium">Documents <span className="font-normal text-ops-muted">(viewing is audit-logged)</span></p>
      <div className="grid grid-cols-3 gap-2">{docs.map((d) => <button key={d.meta.id} onClick={() => setBig(d.url)} className="group relative overflow-hidden rounded-lg border border-ops-border" aria-label={`View ${d.meta.kind}`}><img src={d.url} alt={d.meta.kind} className="h-20 w-full object-cover transition group-hover:scale-105" /><span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{d.meta.kind.replace("_", " ")}</span></button>)}</div>
      {big && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4" onClick={() => setBig(null)} role="dialog" aria-label="Document preview"><img src={big} alt="document" className="max-h-full max-w-full rounded-lg" /></div>}
    </>
  );
}

function KycQueue({ token, staff, onChange }: { token: string; staff: Staff; onChange: (n: number) => void }) {
  const { data, err, reload } = useLoad<Kyc[]>(token, "/ops/kyc"); const toast = useToast();
  const [sel, setSel] = useState<Kyc | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [e2, setE2] = useState("");
  useEffect(() => { if (data) onChange(data.length); }, [data]); // eslint-disable-line
  const allowed = can(staff, "trust_safety", "city_ops");
  const decide = async (d: "approve" | "reject") => {
    if (!sel) return; setBusy(true); setE2("");
    try { await call(token, `/ops/kyc/${sel.id}/${d}`, { method: "POST", body: JSON.stringify({ reason }) }); toast(d === "approve" ? "Provider approved" : "Application rejected"); setSel(null); setReason(""); reload(); }
    catch (x) { setE2((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Verification queue" sub="Applications waiting for review. Every decision needs a written reason and is audit-logged." />
      <ErrBox m={err} />
      <Card><Table><thead><tr><Th>Applicant</Th><Th>Tier</Th><Th>Documents</Th><Th>Submitted</Th><Th /></tr></thead><tbody>
        {!data && !err && <Rows n={4} cols={5} />}
        {data?.map((k) => <Tr key={k.id}>
          <Td><span className="inline-flex items-center gap-2.5"><Avatar id={k.userId} /><span className="font-mono text-xs">{short(k.userId)}</span></span></Td>
          <Td><Pill tone={k.tier >= 3 ? "red" : k.tier === 2 ? "violet" : "blue"}>Tier {k.tier}</Pill></Td>
          <Td><span className="flex flex-wrap gap-1">{k.documents.map((d) => <Pill key={d}>{d.replace("_", " ")}</Pill>)}</span></Td>
          <Td className="whitespace-nowrap text-ops-muted">{when(k.createdAt)}</Td>
          <Td className="text-end"><OBtn size="sm" variant="primary" disabled={!allowed} onClick={() => { setSel(k); setReason(""); setE2(""); }}>Review</OBtn></Td></Tr>)}
        {data?.length === 0 && <tr><td colSpan={5}><Empty icon={<BadgeCheck size={18} />} title="Queue is clear" hint="New provider applications will show up here." /></td></tr>}
      </tbody></Table></Card>
      <AnimatePresence>{sel && (
        <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Review verification">
          <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} className="ops-root w-full max-w-md rounded-xl border border-ops-border bg-ops-card p-5 shadow-2xl">
            <div className="flex items-start justify-between"><div><h2 className="text-base font-semibold">Tier {sel.tier} verification</h2><p className="mt-0.5 font-mono text-xs text-ops-muted">applicant {sel.userId}</p></div><OBtn variant="ghost" size="sm" aria-label="Close" onClick={() => setSel(null)}><X size={15} /></OBtn></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{sel.documents.map((d) => <Pill key={d} tone="accent">{d.replace("_", " ")}</Pill>)}</div>
            <DocGallery token={token} verificationId={sel.id} />
            <label htmlFor="ops-reason" className="mb-1.5 mt-5 block text-[12.5px] font-medium">Reason <span className="font-normal text-ops-muted">(min 5 characters, shown in the audit log)</span></label>
            <textarea id="ops-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full resize-none rounded-lg border border-ops-border bg-ops-card px-3 py-2 outline-none focus:border-ops-accent focus:ring-4 focus:ring-ops-ring" />
            <ErrBox m={e2} />
            <div className="mt-4 flex gap-2"><OBtn variant="primary" className="h-9 flex-1" disabled={busy || reason.trim().length < 5} onClick={() => decide("approve")}><BadgeCheck size={15} />Approve</OBtn><OBtn variant="danger" className="h-9 flex-1" disabled={busy || reason.trim().length < 5} onClick={() => decide("reject")}>Reject</OBtn></div>
          </motion.div>
        </motion.div>)}</AnimatePresence>
    </>
  );
}

/* ---------- bookings ---------- */
const STATES = ["", "Requested", "Accepted", "EnRoute", "Arrived", "InProgress", "Completed", "Confirmed", "Disputed", "Settled", "Refunded", "Cancelled", "Declined", "Expired"];
function Bookings({ token }: { token: string }) {
  const [state, setState] = useState(""); const { data, err } = useLoad<Booking[]>(token, `/ops/bookings${state ? `?state=${state}` : ""}`); const [open, setOpen] = useState<Booking | null>(null);
  const show = async (b: Booking) => setOpen(await call<Booking>(token, `/ops/bookings/${b.id}`));
  return (
    <>
      <PageHead title="Bookings" sub="Most recent 100. Open a row for its timeline." right={<select aria-label="Filter by state" value={state} onChange={(e) => setState(e.target.value)} className="h-8.5 rounded-lg border border-ops-border bg-ops-card px-3 outline-none focus:border-ops-accent">{STATES.map((s) => <option key={s} value={s}>{s || "All states"}</option>)}</select>} />
      <ErrBox m={err} />
      <Card><Table><thead><tr><Th>Booking</Th><Th>State</Th><Th>Mode</Th><Th>Customer</Th><Th>Provider</Th><Th>Total</Th><Th>Fee</Th><Th>Pay</Th></tr></thead><tbody>
        {!data && !err && <Rows n={6} cols={8} />}
        {data?.map((b) => <Tr key={b.id} onClick={() => show(b)}><Td className="font-mono text-xs">{short(b.id)}</Td><Td><Pill tone={stateTone(b.state)} dot>{b.state}</Pill></Td><Td className="text-ops-muted">{b.mode}</Td>
          <Td><span className="inline-flex items-center gap-2"><Avatar id={b.customerId} size={22} /><span className="font-mono text-xs">{short(b.customerId)}</span></span></Td>
          <Td>{b.providerId ? <span className="inline-flex items-center gap-2"><Avatar id={b.providerId} size={22} /><span className="font-mono text-xs">{short(b.providerId)}</span></span> : <span className="text-ops-muted">unassigned</span>}</Td>
          <Td className="tabular-nums">{mad(b.totalCentimes)}</Td><Td className="tabular-nums text-ops-muted">{mad(b.feeCentimes)}</Td><Td><Pill>{b.paymentMethod}</Pill></Td></Tr>)}
        {data?.length === 0 && <tr><td colSpan={8}><Empty icon={<ClipboardList size={18} />} title="No bookings match" /></td></tr>}
      </tbody></Table></Card>
      <AnimatePresence>{open && (<>
        <motion.div className="fixed inset-0 z-[60] bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} />
        <motion.aside role="dialog" aria-label="Booking detail" className="ops-root fixed inset-y-0 end-0 z-[61] w-full max-w-md overflow-y-auto border-s border-ops-border bg-ops-card p-6 shadow-2xl" initial={{ x: 440 }} animate={{ x: 0 }} exit={{ x: 440 }} transition={{ type: "spring", damping: 32, stiffness: 340 }}>
          <div className="flex items-start justify-between"><div><h2 className="text-base font-semibold">Booking {short(open.id)}</h2><Pill tone={stateTone(open.state)} dot className="mt-1.5">{open.state}</Pill></div><OBtn variant="ghost" size="sm" aria-label="Close" onClick={() => setOpen(null)}><X size={15} /></OBtn></div>
          <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-3 text-[13px]"><dt className="text-ops-muted">Mode</dt><dd>{open.mode}</dd><dt className="text-ops-muted">Total</dt><dd className="tabular-nums">{mad(open.totalCentimes)}</dd><dt className="text-ops-muted">Platform fee</dt><dd className="tabular-nums">{mad(open.feeCentimes)}</dd><dt className="text-ops-muted">Payment</dt><dd>{open.paymentMethod}</dd><dt className="text-ops-muted">Customer</dt><dd className="break-all font-mono text-xs">{open.customerId}</dd><dt className="text-ops-muted">Provider</dt><dd className="break-all font-mono text-xs">{open.providerId ?? "—"}</dd></dl>
          <h3 className="mb-3 mt-7 text-[13px] font-semibold">Timeline</h3>
          <ol className="relative space-y-4 ps-5 before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-ops-border">
            {(open.events ?? []).map((e, i) => <li key={i} className="relative"><span className="absolute -start-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-ops-card bg-ops-accent" /><div className="font-medium">{e.type.replace("booking.", "")}</div><div className="text-xs text-ops-muted">by {e.actor} · {when(e.at)}</div></li>)}
            {!open.events?.length && <li className="text-ops-muted">No transitions yet</li>}
          </ol>
        </motion.aside></>)}</AnimatePresence>
    </>
  );
}

/* ---------- audit ---------- */
function AuditLog({ token, staff }: { token: string; staff: Staff }) {
  const ok = can(staff, "trust_safety", "finance"); const { data, err } = useLoad<Audit[]>(token, ok ? "/ops/audit" : "/ops/audit");
  if (!ok) return <><PageHead title="Audit log" /><Card><Empty icon={<ScrollText size={18} />} title="No access" hint="Your role does not include audit access." /></Card></>;
  return (
    <>
      <PageHead title="Audit log" sub="Append-only record of every privileged action. Newest first." /><ErrBox m={err} />
      <Card><Table><thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Reason</Th></tr></thead><tbody>
        {!data && !err && <Rows n={5} cols={5} />}
        {data?.map((a) => <Tr key={a.id}><Td className="whitespace-nowrap text-ops-muted">{when(a.at)}</Td><Td><span className="inline-flex items-center gap-2"><Avatar id={a.actorId || "?"} size={22} /><span className="font-mono text-xs">{short(a.actorId)}</span></span></Td><Td><Pill tone={a.action.includes("reject") ? "red" : a.action.includes("approve") ? "green" : "accent"}>{a.action}</Pill></Td><Td className="font-mono text-xs">{short(a.target)}</Td><Td className="max-w-xs text-ops-muted">{a.reason}</Td></Tr>)}
        {data?.length === 0 && <tr><td colSpan={5}><Empty icon={<ScrollText size={18} />} title="No entries yet" /></td></tr>}
      </tbody></Table></Card>
    </>
  );
}

function SeedDemo({ token, onDone }: { token: string; onDone: (m: string) => void }) {
  return (
    <Card className="mt-6 border-dashed"><div className="flex flex-wrap items-center gap-3 p-4"><Sprout size={16} className="text-ops-accent" /><span className="flex-1 text-ops-muted">Admin tool — load demo providers and offers around Maarif (safe to repeat).</span>
      <OBtn onClick={async () => { try { const r = await call<{ created: number; total: number }>(token, "/ops/seed-demo", { method: "POST" }); onDone(`Seeded ${r.created} of ${r.total} demo providers`); } catch (e) { onDone((e as Error).message); } }}>Seed demo data</OBtn></div></Card>
  );
}
