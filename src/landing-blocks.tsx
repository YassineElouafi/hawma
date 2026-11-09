import { useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Banknote, ChevronDown, MapPin, ShieldCheck, Star } from "lucide-react";
import { useI18n } from "@/i18n";
import { CountUp } from "@/components/arc/primitives";
import { cn } from "@/lib/utils";

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55, ease: "easeOut" as const } };

export function StatsBand() {
  const { t } = useI18n();
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-12 md:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <motion.div key={n} {...rise} transition={{ ...rise.transition, delay: n * 0.07 }} className="text-center md:border-e md:border-border md:last:border-0">
            <div className="font-display text-4xl font-semibold text-primary md:text-5xl">{/^\d+$/.test(t("sv" + n)) ? <CountUp value={Number(t("sv" + n))} /> : t("sv" + n)}</div>
            <div className="mx-auto mt-2 max-w-[11rem] text-sm text-muted-foreground">{t("sv" + n + "l")}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const Mock = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn("rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5", className)}>{children}</div>;

export function Showcase() {
  const { t } = useI18n();
  const steps = ["m_step1", "m_step2", "m_step3", "m_step4"];
  return (
    <section className="mx-auto max-w-6xl px-5 py-28">
      <motion.div {...rise} className="max-w-2xl"><h2 className="font-display text-4xl font-semibold text-emerald-950 md:text-6xl">{t("show_h")}</h2><p className="mt-4 text-lg text-muted-foreground">{t("show_p")}</p></motion.div>
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        <motion.div {...rise}><Mock>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>{t("m_track")}</span><span className="flex items-center gap-1.5 text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live</span></div>
          <div className="relative mt-4 h-40 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#e4f0ec,#f7f2e9)]">
            <svg viewBox="0 0 300 160" className="absolute inset-0 h-full w-full" aria-hidden>
              <path d="M20 130 C80 120 90 60 150 70 S250 40 280 30" fill="none" stroke="#0b3d33" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
              <circle cx="280" cy="30" r="9" fill="#d9552b" /><circle cx="280" cy="30" r="16" fill="#d9552b" opacity=".18" />
            </svg>
            <motion.div className="absolute grid h-9 w-9 place-items-center rounded-full bg-primary text-base shadow-lg" initial={{ left: "5%", top: "74%" }} whileInView={{ left: "44%", top: "34%" }} viewport={{ once: true }} transition={{ duration: 3, ease: "easeInOut" }}>🛵</motion.div>
          </div>
          <div className="mt-4 font-display text-xl font-semibold">{t("m_track_t")}</div><div className="text-sm text-muted-foreground">{t("m_track_s")}</div>
          <div className="mt-4 flex items-center">{steps.map((s, i) => <div key={s} className="flex flex-1 items-center last:flex-none"><div className={cn("grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold", i < 2 ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>{i + 1}</div>{i < 3 && <div className={cn("h-0.5 flex-1", i < 1 ? "bg-primary" : "bg-muted")} />}</div>)}</div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">{steps.map((s) => <span key={s}>{t(s)}</span>)}</div>
        </Mock></motion.div>

        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.1 }}><Mock>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>{t("m_earn")}</span><Banknote size={16} /></div>
          <div className="mt-3 font-display text-5xl font-semibold text-primary"><CountUp value={1240} /> <span className="text-xl text-muted-foreground">MAD</span></div>
          <div className="text-sm text-muted-foreground">{t("m_earn_s")}</div>
          <div className="mt-5 flex h-24 items-end gap-2">{[35, 55, 40, 70, 60, 90, 75].map((h, i) => <motion.div key={i} className="flex-1 rounded-md bg-primary/85" initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.06 }} />)}</div>
          <dl className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">{t("m_cash")}</dt><dd className="font-semibold">860 MAD</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">{t("m_net")}</dt><dd className="font-semibold">1 054 MAD</dd></div><div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">{t("m_pay")}</dt><dd className="font-semibold text-emerald-700">Lun. 16</dd></div></dl>
        </Mock></motion.div>

        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.2 }}><Mock>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>{t("m_trust")}</span><ShieldCheck size={16} /></div>
          <div className="mt-4 flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-saffron/40 text-3xl">👩</div><div><div className="font-display text-xl font-semibold">Amina K.</div><div className="mt-1 flex items-center gap-1.5 text-sm"><Star size={14} className="fill-saffron text-saffron" />{t("m_rate")}</div></div></div>
          <ul className="mt-5 space-y-2.5">{[["CIN", true], ["Selfie", true], [t("m_trust_s").split(" · ")[2] ?? "Casier", true], ["Tier 2", true]].map(([l, ok]) => <li key={String(l)} className="flex items-center justify-between rounded-xl bg-muted/70 px-3.5 py-2.5 text-sm"><span>{l}</span>{ok && <BadgeCheck size={18} className="text-emerald-600" />}</li>)}</ul>
          <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground"><MapPin size={15} />Maarif · 0,5 km</div>
        </Mock></motion.div>
      </div>
    </section>
  );
}

export function ProviderSection() {
  const { t } = useI18n();
  return (
    <section className="zellige grain relative overflow-hidden bg-emerald-950 py-28 text-white">
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        <motion.div {...rise}>
          <span className="inline-flex rounded-full bg-saffron/15 px-3.5 py-1.5 text-xs font-semibold text-saffron ring-1 ring-saffron/30">{t("prov_badge")}</span>
          <h2 className="mt-5 font-display text-4xl font-semibold leading-tight md:text-6xl">{t("prov_h")}</h2>
          <p className="mt-5 max-w-lg text-lg text-white/65">{t("prov_p")}</p>
          <ul className="mt-8 space-y-3.5">{[1, 2, 3, 4].map((n) => <li key={n} className="flex items-start gap-3 text-white/85"><BadgeCheck size={20} className="mt-0.5 shrink-0 text-saffron" />{t("prov_b" + n)}</li>)}</ul>
          <a href="/app" className="mt-9 inline-flex h-14 items-center rounded-full bg-saffron px-8 font-semibold text-emerald-950 shadow-lg shadow-saffron/30 transition hover:-translate-y-0.5">{t("prov_cta")}</a>
        </motion.div>
        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.15 }} className="grid grid-cols-2 gap-4">
          {[["✨", "120", "MAD / 3 h"], ["📚", "100", "MAD / h"], ["🔧", "150", "MAD"], ["🛒", "30", "MAD"]].map(([e, p, u], i) => (
            <div key={i} className={cn("rounded-3xl border border-white/10 bg-white/[.06] p-5 backdrop-blur", i % 2 && "translate-y-6")}><div className="text-3xl">{e}</div><div className="mt-6 font-display text-3xl font-semibold">{p}</div><div className="text-sm text-white/55">{u}</div></div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export function Faq() {
  const { t } = useI18n(); const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-3xl px-5 py-28">
      <motion.h2 {...rise} className="text-center font-display text-4xl font-semibold text-emerald-950 md:text-5xl">{t("faq_h")}</motion.h2>
      <div className="mt-12 divide-y divide-border rounded-3xl border border-border bg-card">
        {[1, 2, 3, 4, 5].map((n, i) => (
          <div key={n}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start text-lg font-medium">
              {t(`faq${n}q`)}<ChevronDown size={20} className={cn("shrink-0 text-muted-foreground transition-transform", open === i && "rotate-180")} />
            </button>
            <motion.div initial={false} animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }} className="overflow-hidden"><p className="px-6 pb-6 text-muted-foreground">{t(`faq${n}a`)}</p></motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  const cols = [[t("f_prod"), [[t("f_a1"), "#how"], [t("f_a2"), "#features"], [t("f_a3"), "/app"]]], [t("f_company"), [[t("f_b1"), "/architecture"], [t("f_b2"), "#"]]], [t("f_legal"), [[t("f_c1"), "#"], [t("f_c2"), "#"]]]] as const;
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-display text-xl font-bold text-saffron">ح</span><span className="font-display text-xl font-semibold">Hawma</span></div><p className="mt-4 max-w-xs text-sm text-muted-foreground">{t("f_tag")}</p></div>
        {cols.map(([h, links]) => <div key={h}><div className="text-sm font-semibold">{h}</div><ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">{links.map(([l, href]) => <li key={l}><a href={href} className="transition hover:text-foreground">{l}</a></li>)}</ul></div>)}
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">© 2026 Hawma · 🇲🇦 {t("foot")}</div>
    </footer>
  );
}
