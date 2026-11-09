import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Banknote, Check, Globe2, MessageCircle, Repeat, ShieldCheck, Users, WifiOff, X, MapPin, Search, Handshake } from "lucide-react";
import { useI18n, LANGS } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import App from "@/app/App";
import { Faq, ProviderSection, Showcase, SiteFooter, StatsBand } from "@/landing-blocks";

const fade = { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: .6, ease: "easeOut" as const } };

export default function Landing() {
  const { t, lang, setLang, list, rtl } = useI18n();
  const [sent, setSent] = useState(false);
  const feats = [
    { i: Globe2, k: "f1", span: "md:col-span-2", tone: "bg-primary text-primary-foreground" },
    { i: Banknote, k: "f2", span: "", tone: "bg-saffron/30" },
    { i: ShieldCheck, k: "f3", span: "", tone: "bg-card" },
    { i: Repeat, k: "f4", span: "", tone: "bg-card" },
    { i: Users, k: "f5", span: "", tone: "bg-terracotta text-white" },
    { i: WifiOff, k: "f6", span: "md:col-span-3", tone: "bg-card" },
  ];
  const steps = [{ i: MapPin, k: "1" }, { i: Search, k: "2" }, { i: Handshake, k: "3" }];
  const rows = [["vs1", "vs1a", "vs1b"], ["vs2", "vs2a", "vs2b"], ["vs3", "vs3a", "vs3b"]];

  return (
    <div className="overflow-x-hidden">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-emerald-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5 text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-saffron font-display text-xl font-bold text-primary">ح</span><span className="font-display text-xl font-semibold">Hawma</span></a>
          <div className="hidden items-center gap-7 text-sm font-medium text-white/70 md:flex"><a href="#how" className="hover:text-white">{t("nav_how")}</a><a href="#features" className="hover:text-white">{t("nav_features")}</a></div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white/10 p-0.5 text-xs font-semibold">{LANGS.map((l) => <button key={l.id} onClick={() => setLang(l.id)} className={cn("rounded-full px-3 py-1.5 transition", lang === l.id ? "bg-saffron text-primary" : "text-white/70")}>{l.label}</button>)}</div>
            <Button asChild variant="accent" size="sm" className="hidden sm:inline-flex"><a href="/app">{t("nav_cta")}</a></Button>
          </div>
        </div>
      </nav>

      <header className="zellige grain relative bg-emerald-950 pb-24 pt-32 text-white">
        <div className="pointer-events-none absolute -top-40 start-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-saffron/20 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.15fr_.85fr]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
            <Badge className="mb-6 bg-saffron/15 px-3.5 py-1.5 text-xs text-saffron ring-1 ring-saffron/30"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-terracotta" />{t("hero_badge")}</Badge>
            <h1 className="font-display text-[clamp(3rem,8vw,6.2rem)] font-semibold leading-[.95] tracking-tight">{t("hero_h1a")}<br /><span className="italic text-saffron">{t("hero_h1b")}</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/70">{t("hero_p")}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild variant="accent" size="lg"><a href="/app">{t("hero_cta")}<ArrowRight size={18} className="rtl:rotate-180" /></a></Button>
              <Button asChild variant="glass" size="lg"><a href="#how">{t("hero_cta2")}</a></Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-2 text-sm text-white/60">{["trust1", "trust2", "trust3"].map((k) => <span key={k} className="flex items-center gap-2"><Check size={15} className="text-saffron" />{t(k)}</span>)}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 40, rotate: rtl ? -4 : 4 }} animate={{ opacity: 1, y: 0, rotate: rtl ? -3 : 3 }} transition={{ duration: .9, delay: .15 }} className="justify-self-center">
            <div className="animate-float">
              <div className="relative h-[640px] w-[310px] rounded-[3rem] bg-black p-3 shadow-[0_40px_120px_-20px_rgba(242,184,75,.35)] ring-1 ring-white/15">
                <div className="absolute left-1/2 top-5 z-[70] h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
                <div className="h-full w-full overflow-hidden rounded-[2.4rem] bg-background"><App demo /></div>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <div className="overflow-hidden border-y border-border bg-saffron py-4" dir="ltr">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-display text-xl font-semibold text-primary">
          {[...list("marquee"), ...list("marquee"), ...list("marquee"), ...list("marquee")].map((m, i) => <span key={i} className="flex items-center gap-10">{m}<span className="text-terracotta">✦</span></span>)}
        </div>
      </div>

      <StatsBand />

      <section id="how" className="mx-auto max-w-6xl px-5 py-28">
        <motion.div {...fade}><h2 className="font-display text-4xl font-semibold md:text-6xl">{t("how_h")}</h2><p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("how_p")}</p></motion.div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map(({ i: I, k }, n) => (
            <motion.div key={k} {...fade} transition={{ ...fade.transition, delay: n * .12 }} className="relative overflow-hidden rounded-3xl border border-border bg-card p-8">
              <span className="absolute -end-2 -top-6 font-display text-[9rem] font-bold leading-none text-saffron/20">{k}</span>
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary text-saffron"><I size={22} /></span>
              <h3 className="relative mt-6 font-display text-2xl font-semibold">{t("st" + k)}</h3>
              <p className="relative mt-2 text-muted-foreground">{t("sp" + k)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="features" className="bg-muted/60 py-28">
        <div className="mx-auto max-w-6xl px-5">
          <motion.div {...fade}><h2 className="max-w-3xl font-display text-4xl font-semibold md:text-6xl">{t("feat_h")}</h2><p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("feat_p")}</p></motion.div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {feats.map(({ i: I, k, span, tone }, n) => (
              <motion.div key={k} {...fade} transition={{ ...fade.transition, delay: (n % 3) * .08 }} className={cn("rounded-3xl border border-border/60 p-8", tone, span)}>
                <I size={28} className="opacity-90" /><h3 className="mt-8 font-display text-2xl font-semibold">{t(k)}</h3><p className="mt-2 max-w-md opacity-75">{t("fp" + k.slice(1))}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Showcase />
      <ProviderSection />

      <section className="mx-auto max-w-4xl px-5 py-28">
        <motion.h2 {...fade} className="text-center font-display text-4xl font-semibold md:text-5xl">{t("vs_h")}</motion.h2>
        <motion.div {...fade} className="mt-12 overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-primary/5">
          <div className="grid grid-cols-[1.1fr_1.2fr_1fr] bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground"><span /><span className="text-saffron">{t("vs_us")}</span><span className="opacity-70">{t("vs_them")}</span></div>
          {rows.map(([a, b, c]) => <div key={a} className="grid grid-cols-[1.1fr_1.2fr_1fr] items-center border-t border-border px-6 py-4 text-sm"><span className="text-muted-foreground">{t(a)}</span><span className="font-semibold text-primary">{t(b)}</span><span className="text-muted-foreground">{t(c)}</span></div>)}
          {["vs4", "vs5"].map((a) => <div key={a} className="grid grid-cols-[1.1fr_1.2fr_1fr] items-center border-t border-border px-6 py-4 text-sm"><span className="text-muted-foreground">{t(a)}</span><Check className="text-primary" size={20} /><X className="text-muted-foreground/50" size={20} /></div>)}
        </motion.div>
      </section>

      <Faq />

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <motion.div {...fade} className="zellige grain relative overflow-hidden rounded-[2.5rem] bg-primary px-6 py-20 text-center text-white">
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-4xl font-semibold md:text-6xl">{t("cta_h")}</h2>
            <p className="mx-auto mt-5 max-w-lg text-white/70">{t("cta_p")}</p>
            {sent ? <p className="mt-9 flex items-center justify-center gap-2 text-lg font-semibold text-saffron"><Check />{t("cta_ok")}</p> : (
              <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row">
                <Input required placeholder={t("cta_ph")} aria-label={t("cta_ph")} className="h-14 rounded-full border-0 px-6 text-foreground" />
                <Button variant="accent" size="lg">{t("cta_btn")}</Button>
              </form>
            )}
            <a href="/app" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white/70 underline-offset-4 hover:text-saffron hover:underline"><MessageCircle size={15} />{t("cta_demo")}</a>
          </div>
        </motion.div>
      </section>
      <SiteFooter />
    </div>
  );
}
