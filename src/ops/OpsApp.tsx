import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ClipboardList, LogOut, ScrollText, ShieldCheck, Sprout, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API = "/api";
type Staff = { id: string; email: string; roles: string[] };
type Kyc = { id: string; userId: string; tier: number; status: string; documents: string[]; createdAt: string; reason?: string };
type Booking = { id: string; state: string; mode: string; customerId: string; providerId: string | null; totalCentimes: number; feeCentimes: number; paymentMethod: string; events?: { type: string; actor: string; at: string }[] };
type Audit = { id: number; at: string; actorId: string; action: string; target: string; reason?: string };

class HttpError extends Error { constructor(public status: number, m: string) { super(m); } }
async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
  const t = await r.text(); const b = t ? JSON.parse(t) : undefined;
  if (!r.ok) throw new HttpError(r.status, b?.title ?? r.statusText);
  return b;
}
const can = (s: Staff, ...roles: string[]) => s.roles.includes("admin") || roles.some((r) => s.roles.includes(r));

export default function OpsApp() {
  const [token, setToken] = useState(() => sessionStorage.getItem("ops.token") ?? "");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [tab, setTab] = useState<"kyc" | "bookings" | "audit">("kyc");

  useEffect(() => { if (!token) return setStaff(null); call<Staff>(token, "/ops/me").then(setStaff).catch(() => { sessionStorage.removeItem("ops.token"); setToken(""); }); }, [token]);
  const logout = () => { sessionStorage.removeItem("ops.token"); setToken(""); setStaff(null); };

  if (!token || !staff) return <Login onToken={(t) => { sessionStorage.setItem("ops.token", t); setToken(t); }} />;
  const tabs = [["kyc", "Verifications", ShieldCheck], ["bookings", "Bookings", ClipboardList], ["audit", "Audit log", ScrollText]] as const;
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-4 bg-primary px-5 py-3 text-primary-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-saffron font-display text-lg font-bold text-primary">ح</span>
        <span className="font-display text-lg font-semibold">Hawma Ops</span>
        <nav className="ms-6 hidden gap-1 md:flex">
          {tabs.map(([k, l, I]) => <button key={k} onClick={() => setTab(k)} className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium", tab === k ? "bg-saffron text-primary" : "text-white/70 hover:bg-white/10")}><I size={15} />{l}</button>)}
        </nav>
        <div className="ms-auto flex items-center gap-3 text-sm"><span className="hidden text-white/70 sm:inline">{staff.email} · {staff.roles.join(", ")}</span><Button variant="glass" size="sm" onClick={logout}><LogOut size={14} />Sign out</Button></div>
      </header>
      <nav className="flex gap-1 overflow-x-auto bg-primary/95 px-3 pb-2 md:hidden">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-4 py-1.5 text-sm", tab === k ? "bg-saffron text-primary" : "text-white/70")}>{l}</button>)}
      </nav>
      <main className="mx-auto max-w-6xl p-5">
        {tab === "kyc" && <KycQueue token={token} staff={staff} />}
        {tab === "bookings" && <Bookings token={token} />}
        {tab === "audit" && <AuditLog token={token} staff={staff} />}
        {can(staff, "admin") && <SeedDemo token={token} />}
      </main>
    </div>
  );
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await fetch(`${API}/ops/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }); const b = await r.json(); if (!r.ok) throw new Error(b.title ?? "Login failed"); onToken(b.token); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="zellige grid min-h-dvh place-items-center bg-emerald-950 p-5">
      <form onSubmit={go} className="w-full max-w-sm rounded-3xl bg-card p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary font-display text-2xl font-bold text-saffron">ح</span><div><div className="font-display text-xl font-semibold">Hawma Ops</div><div className="text-xs text-muted-foreground">Staff only · activity is audited</div></div></div>
        <Label>Email</Label><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Label>Password</Label><Input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p role="alert" className="mt-3 rounded-lg bg-terracotta/10 px-3 py-2 text-sm text-terracotta">{err}</p>}
        <Button className="mt-6 w-full" size="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </div>
  );
}

function useLoad<T>(token: string, path: string) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { setErr(""); call<T>(token, path).then(setData).catch((e) => setErr(e.message)); }, [token, path]);
  useEffect(load, [load]);
  return { data, err, reload: load };
}
const Err = ({ m }: { m: string }) => m ? <p role="alert" className="my-3 rounded-xl bg-terracotta/10 px-4 py-3 text-sm text-terracotta">{m}</p> : null;
const short = (id: string | null) => id ? id.slice(0, 8) : "—";
const when = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function KycQueue({ token, staff }: { token: string; staff: Staff }) {
  const { data, err, reload } = useLoad<Kyc[]>(token, "/ops/kyc");
  const [sel, setSel] = useState<Kyc | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [e2, setE2] = useState("");
  const allowed = can(staff, "trust_safety", "city_ops");
  const decide = async (d: "approve" | "reject") => {
    if (!sel) return; setBusy(true); setE2("");
    try { await call(token, `/ops/kyc/${sel.id}/${d}`, { method: "POST", body: JSON.stringify({ reason }) }); setSel(null); setReason(""); reload(); }
    catch (x) { setE2((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <section>
      <h1 className="font-display text-3xl font-semibold">Verification queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">Applications waiting for review. Every decision needs a written reason and is recorded in the audit log.</p>
      <Err m={err} />
      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted text-start text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Applicant", "Tier", "Documents", "Submitted", ""].map((h) => <th key={h} className="px-4 py-3 text-start">{h}</th>)}</tr></thead>
          <tbody>
            {data?.map((k) => (
              <tr key={k.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{short(k.userId)}</td>
                <td className="px-4 py-3"><Badge variant={k.tier >= 3 ? "terracotta" : "default"}>Tier {k.tier}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{k.documents.join(", ")}</td>
                <td className="px-4 py-3 text-xs">{when(k.createdAt)}</td>
                <td className="px-4 py-3 text-end"><Button size="sm" variant="outline" disabled={!allowed} onClick={() => { setSel(k); setReason(""); setE2(""); }}>Review</Button></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nothing to review 🎉</td></tr>}
            {!data && !err && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>}
          </tbody></table>
      </div>
      {sel && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-emerald-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Review verification">
          <div className="w-full max-w-md rounded-3xl bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between"><h2 className="font-display text-xl font-semibold">Tier {sel.tier} verification</h2><button aria-label="Close" onClick={() => setSel(null)}><X size={18} /></button></div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">applicant {sel.userId}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{sel.documents.map((d) => <Badge key={d}>{d}</Badge>)}</div>
            <Label>Reason (min 5 characters, shown in the audit log)</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Err m={e2} />
            <div className="mt-5 flex gap-3"><Button className="flex-1" disabled={busy || reason.trim().length < 5} onClick={() => decide("approve")}><BadgeCheck size={16} />Approve</Button><Button className="flex-1" variant="terracotta" disabled={busy || reason.trim().length < 5} onClick={() => decide("reject")}>Reject</Button></div>
          </div>
        </div>
      )}
    </section>
  );
}

const STATES = ["", "Requested", "Accepted", "EnRoute", "Arrived", "InProgress", "Completed", "Confirmed", "Disputed", "Settled", "Refunded", "Cancelled", "Declined", "Expired"];
function Bookings({ token }: { token: string }) {
  const [state, setState] = useState(""); const { data, err } = useLoad<Booking[]>(token, `/ops/bookings${state ? `?state=${state}` : ""}`);
  const [open, setOpen] = useState<Booking | null>(null);
  const show = async (b: Booking) => setOpen(await call<Booking>(token, `/ops/bookings/${b.id}`));
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-3xl font-semibold">Bookings</h1><p className="mt-1 text-sm text-muted-foreground">Most recent 100. Click a row for its timeline.</p></div>
        <div className="w-52"><Select aria-label="Filter by state" value={state} onChange={(e) => setState(e.target.value)}>{STATES.map((s) => <option key={s} value={s}>{s || "All states"}</option>)}</Select></div></div>
      <Err m={err} />
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground"><tr>{["ID", "State", "Mode", "Customer", "Provider", "Total", "Fee", "Pay"].map((h) => <th key={h} className="px-4 py-3 text-start">{h}</th>)}</tr></thead>
          <tbody>{data?.map((b) => (
            <tr key={b.id} onClick={() => show(b)} className="cursor-pointer border-t border-border hover:bg-muted/50">
              <td className="px-4 py-3 font-mono text-xs">{short(b.id)}</td><td className="px-4 py-3"><Badge variant={["Cancelled", "Declined", "Disputed", "Expired"].includes(b.state) ? "terracotta" : "default"}>{b.state}</Badge></td>
              <td className="px-4 py-3">{b.mode}</td><td className="px-4 py-3 font-mono text-xs">{short(b.customerId)}</td><td className="px-4 py-3 font-mono text-xs">{short(b.providerId)}</td>
              <td className="px-4 py-3">{(b.totalCentimes / 100).toFixed(0)} MAD</td><td className="px-4 py-3">{(b.feeCentimes / 100).toFixed(0)}</td><td className="px-4 py-3">{b.paymentMethod}</td>
            </tr>))}
            {data?.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No bookings</td></tr>}
          </tbody></table>
      </div>
      {open && (
        <div className="fixed inset-y-0 end-0 z-30 w-full max-w-md overflow-y-auto bg-background p-6 shadow-2xl" role="dialog" aria-label="Booking detail">
          <div className="flex items-start justify-between"><h2 className="font-display text-xl font-semibold">Booking {short(open.id)}</h2><button aria-label="Close" onClick={() => setOpen(null)}><X size={18} /></button></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><dt className="text-muted-foreground">State</dt><dd>{open.state}</dd><dt className="text-muted-foreground">Mode</dt><dd>{open.mode}</dd><dt className="text-muted-foreground">Total / fee</dt><dd>{open.totalCentimes / 100} / {open.feeCentimes / 100} MAD</dd><dt className="text-muted-foreground">Customer</dt><dd className="break-all font-mono text-xs">{open.customerId}</dd><dt className="text-muted-foreground">Provider</dt><dd className="break-all font-mono text-xs">{open.providerId ?? "—"}</dd></dl>
          <h3 className="mt-6 font-semibold">Timeline</h3>
          <ol className="mt-2 space-y-2 border-s-2 border-saffron ps-4">{(open.events ?? []).map((e, i) => <li key={i} className="text-sm"><b>{e.type.replace("booking.", "")}</b> <span className="text-muted-foreground">by {e.actor} · {when(e.at)}</span></li>)}{!open.events?.length && <li className="text-sm text-muted-foreground">No transitions yet</li>}</ol>
        </div>
      )}
    </section>
  );
}

function AuditLog({ token, staff }: { token: string; staff: Staff }) {
  const ok = can(staff, "trust_safety", "finance"); const { data, err } = useLoad<Audit[]>(token, ok ? "/ops/audit" : "/ops/me");
  if (!ok) return <p className="rounded-2xl bg-muted p-6 text-sm">Your role does not include audit access.</p>;
  return (
    <section>
      <h1 className="font-display text-3xl font-semibold">Audit log</h1><p className="mt-1 text-sm text-muted-foreground">Append-only. Newest first.</p><Err m={err} />
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground"><tr>{["When", "Actor", "Action", "Target", "Reason"].map((h) => <th key={h} className="px-4 py-3 text-start">{h}</th>)}</tr></thead>
        <tbody>{(data as Audit[] | null)?.map((a) => <tr key={a.id} className="border-t border-border"><td className="whitespace-nowrap px-4 py-3 text-xs">{when(a.at)}</td><td className="px-4 py-3 font-mono text-xs">{short(a.actorId)}</td><td className="px-4 py-3"><Badge>{a.action}</Badge></td><td className="px-4 py-3 font-mono text-xs">{short(a.target)}</td><td className="px-4 py-3 text-muted-foreground">{a.reason}</td></tr>)}
          {Array.isArray(data) && data.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No entries yet</td></tr>}</tbody></table></div>
    </section>
  );
}

function SeedDemo({ token }: { token: string }) {
  const [msg, setMsg] = useState("");
  return <div className="mt-10 flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm"><Sprout size={18} className="text-primary" /><span className="flex-1 text-muted-foreground">Admin tool: load demo providers and offers around Maarif (safe to repeat).</span>
    <Button size="sm" variant="outline" onClick={async () => { try { const r = await call<{ created: number; total: number }>(token, "/ops/seed-demo", { method: "POST" }); setMsg(`Created ${r.created} of ${r.total}`); } catch (e) { setMsg((e as Error).message); } }}>Seed demo data</Button>{msg && <span role="status" className="text-xs">{msg}</span>}</div>;
}
