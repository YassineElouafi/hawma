import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Banknote, Check, Globe2, MessageCircle, Repeat, ShieldCheck, Users, WifiOff, X, MapPin, Search, Handshake } from "lucide-react";
import { useI18n, LANGS } from "@/i18n";
import { cn } from "@/lib/utils";
import { RatingPill, SceneArt } from "@/components/glide/ui";
import { Faq, ProviderSection, Showcase, SiteFooter, StatsBand } from "@/landing-blocks";

const fade = { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: .6, ease: "easeOut" as const } };
const pill = "inline-flex h-14 items-center justify-center gap-2 rounded-full px-8 text-[15px] font-bold transition active:scale-[.985]";

/** Static phone mock in the app's Glide language (no network, no embedded app). */
function PhoneMock() {
  return (
    <div className="relative h-[620px] w-[300px] rounded-[3rem] bg-g-ink p-3 shadow-[0_40px_90px_-30px_rgba(17,18,20,.55)]">
      <div className="h-full w-full overflow-hidden rounded-[2.4rem] bg-g-bg px-4 pt-9" aria-hidden>
        <div className="text-[12px] font-semibold text-g-mute">Bonjour 👋</div>
        <div className="text-[22px] font-extrabold leading-tight">De quoi as-tu besoin ?</div>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-white p-1.5 ps-4 text-[12px] text-g-mute shadow-g-card"><Search size={14} />Rechercher un service…<span className="ms-auto grid h-8 w-8 place-items-center rounded-full bg-g-ink text-white">⚙</span></div>
        <div className="mt-3 flex gap-2"><span className="rounded-full bg-g-ink px-3 py-1.5 text-[11px] font-bold text-white">Tout</span><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold">✨ Ménage</span><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold">🔧 Bricolage</span></div>
        <SceneArt cat="cleaning" emojiSize={90} className="mt-4 h-[300px] rounded-[1.8rem]">
          <div className="absolute inset-x-0 bottom-0 p-4 text-white"><div className="text-[11px] text-white/80">0,5 km · 120 MAD</div><div className="text-[19px] font-extrabold leading-tight">Ménage &amp; repassage</div><RatingPill value={4.9} count={41} onDark className="mt-2" />
            <div className="mt-3 flex items-center justify-between rounded-full bg-black/55 p-1 ps-4 text-[12px] font-bold">Voir plus<span className="grid h-8 w-8 place-items-center rounded-full bg-white text-g-ink">›</span></div></div>
        </SceneArt>
        <div className="absolute inset-x-6 bottom-6 flex rounded-full bg-g-ink p-1.5"><span className="grid h-11 flex-1 place-items-center rounded-full bg-white text-[15px]">🏠</span><span className="grid h-11 flex-1 place-items-center text-[15px]">🧾</span><span className="grid h-11 flex-1 place-items-center text-[15px]">👤</span></div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t, lang, setLang, list, rtl } = useI18n();
  const [sent, setSent] = useState(false);
  const feats = [
    { i: Globe2, k: "f1", span: "md:col-span-2", tone: "bg-g-ink text-white" },
    { i: Banknote, k: "f2", span: "", tone: "bg-g-saffron text-g-ink" },
    { i: ShieldCheck, k: "f3", span: "", tone: "bg-white" },
    { i: Repeat, k: "f4", span: "", tone: "bg-white" },
    { i: Users, k: "f5", span: "", tone: "bg-g-accent text-white" },
    { i: WifiOff, k: "f6", span: "md:col-span-3", tone: "bg-white" },
  ];
  const steps = [{ i: MapPin, k: "1" }, { i: Search, k: "2" }, { i: Handshake, k: "3" }];
  const rows = [["vs1", "vs1a", "vs1b"], ["vs2", "vs2a", "vs2b"], ["vs3", "vs3a", "vs3b"]];

  return (
    <div className="glide overflow-x-hidden" dir={rtl ? "rtl" : "ltr"}>
      <nav className="fixed inset-x-0 top-3 z-50 px-3">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full bg-white/85 px-3 ps-5 shadow-g-card backdrop-blur-xl">
          <a href="/" className="flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-full bg-g-ink text-xl font-extrabold text-white">ح</span><span className="text-xl font-extrabold tracking-tight">Hawma</span></a>
          <div className="hidden items-center gap-8 text-[14px] font-semibold text-g-mute md:flex"><a href="#how" className="hover:text-g-ink">{t("nav_how")}</a><a href="#features" className="hover:text-g-ink">{t("nav_features")}</a></div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-black/5 p-1 text-[12.5px] font-bold">{LANGS.map((l) => <button key={l.id} onClick={() => setLang(l.id)} className={cn("rounded-full px-3 py-1.5 transition", lang === l.id ? "bg-g-ink text-white" : "text-g-mute")}>{l.label}</button>)}</div>
            <a href="/app" className="hidden h-11 items-center rounded-full bg-g-ink px-6 text-[14px] font-bold text-white sm:inline-flex">{t("nav_cta")}</a>
          </div>
        </div>
      </nav>

      <header className="px-3 pb-6 pt-24">
        <SceneArt cat="lending" shade={false} emojiSize={260} className="mx-auto max-w-6xl rounded-[2.75rem] px-6 pb-16 pt-16 text-white md:px-14 md:pt-20">
          <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent rtl:bg-gradient-to-l" />
          <div className="relative grid items-center gap-12 lg:grid-cols-[1.15fr_.85fr]">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
              <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-[13px] font-bold backdrop-blur"><span className="h-2 w-2 animate-pulse rounded-full bg-g-saffron" />{t("hero_badge")}</span>
              <h1 className="text-[clamp(2.8rem,7vw,5.6rem)] font-extrabold leading-[.98] tracking-tight">{t("hero_h1a")}<br /><span className="text-g-saffron">{t("hero_h1b")}</span></h1>
              <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-white/85">{t("hero_p")}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="/app" className={cn(pill, "bg-white text-g-ink shadow-g-float")}>{t("hero_cta")}<ArrowRight size={18} className="rtl:rotate-180" /></a>
                <a href="#how" className={cn(pill, "bg-white/15 text-white backdrop-blur hover:bg-white/25")}>{t("hero_cta2")}</a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[14px] font-semibold text-white/80">{["trust1", "trust2", "trust3"].map((k) => <span key={k} className="flex items-center gap-2"><Check size={16} className="text-g-saffron" />{t(k)}</span>)}</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .15 }} className="hidden justify-self-center lg:block"><div className="animate-float"><PhoneMock /></div></motion.div>
          </div>
        </SceneArt>
      </header>

      <div className="mx-3 mt-3 overflow-hidden rounded-full bg-g-ink py-4" dir="ltr">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-xl font-extrabold text-white">
          {[...list("marquee"), ...list("marquee"), ...list("marquee"), ...list("marquee")].map((m, i) => <span key={i} className="flex items-center gap-10">{m}<span className="text-g-saffron">✦</span></span>)}
        </div>
      </div>

      <StatsBand />

      <section id="how" className="mx-auto max-w-6xl px-5 py-24">
        <motion.div {...fade}><h2 className="text-4xl font-extrabold md:text-6xl">{t("how_h")}</h2><p className="mt-4 max-w-xl text-lg text-g-mute">{t("how_p")}</p></motion.div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map(({ i: I, k }, n) => (
            <motion.div key={k} {...fade} transition={{ ...fade.transition, delay: n * .12 }} className="relative overflow-hidden rounded-[2rem] bg-white p-8 shadow-g-card">
              <span aria-hidden className="absolute -end-2 -top-6 text-[9rem] font-extrabold leading-none text-black/[.04]">{k}</span>
              <span className="relative grid h-14 w-14 place-items-center rounded-full bg-g-ink text-white"><I size={22} /></span>
              <h3 className="relative mt-6 text-2xl font-extrabold">{t("st" + k)}</h3>
              <p className="relative mt-2 text-g-mute">{t("sp" + k)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="features" className="px-3 py-6">
        <div className="mx-auto max-w-6xl rounded-[2.75rem] bg-black/[.04] px-5 py-20 md:px-10">
          <motion.div {...fade}><h2 className="max-w-3xl text-4xl font-extrabold md:text-6xl">{t("feat_h")}</h2><p className="mt-4 max-w-xl text-lg text-g-mute">{t("feat_p")}</p></motion.div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {feats.map(({ i: I, k, span, tone }, n) => (
              <motion.div key={k} {...fade} transition={{ ...fade.transition, delay: (n % 3) * .08 }} className={cn("rounded-[2rem] p-8 shadow-g-card", tone, span)}>
                <I size={28} /><h3 className="mt-8 text-2xl font-extrabold">{t(k)}</h3><p className={cn("mt-2 max-w-md", tone.includes("text-white") ? "text-white/85" : "text-g-mute", tone.includes("saffron") && "text-g-ink/80")}>{t("fp" + k.slice(1))}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Showcase />
      <ProviderSection />

      <section className="mx-auto max-w-4xl px-5 py-24">
        <motion.h2 {...fade} className="text-center text-4xl font-extrabold md:text-5xl">{t("vs_h")}</motion.h2>
        <motion.div {...fade} className="mt-12 overflow-hidden rounded-[2rem] bg-white shadow-g-card">
          <div className="grid grid-cols-[1.1fr_1.2fr_1fr] bg-g-ink px-6 py-4 text-sm font-bold text-white"><span /><span className="text-g-saffron">{t("vs_us")}</span><span className="text-white/75">{t("vs_them")}</span></div>
          {rows.map(([a, b, c]) => <div key={a} className="grid grid-cols-[1.1fr_1.2fr_1fr] items-center border-t border-g-line px-6 py-4 text-sm"><span className="text-g-mute">{t(a)}</span><span className="font-bold">{t(b)}</span><span className="text-g-mute">{t(c)}</span></div>)}
          {["vs4", "vs5"].map((a) => <div key={a} className="grid grid-cols-[1.1fr_1.2fr_1fr] items-center border-t border-g-line px-6 py-4 text-sm"><span className="text-g-mute">{t(a)}</span><Check className="text-g-accent" size={20} aria-label="✓" /><X className="text-g-mute" size={20} aria-label="✗" /></div>)}
        </motion.div>
      </section>

      <Faq />

      <section className="mx-auto max-w-6xl px-3 pb-20">
        <motion.div {...fade}>
          <SceneArt cat="garden" shade={false} emojiSize={220} className="rounded-[2.75rem] px-6 py-20 text-center text-white">
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-4xl font-extrabold md:text-6xl">{t("cta_h")}</h2>
              <p className="mx-auto mt-5 max-w-lg text-lg font-medium text-white/85">{t("cta_p")}</p>
              {sent ? <p className="mt-9 flex items-center justify-center gap-2 text-lg font-bold"><Check />{t("cta_ok")}</p> : (
                <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row">
                  <input required placeholder={t("cta_ph")} aria-label={t("cta_ph")} className="h-14 flex-1 rounded-full bg-white px-6 text-[15px] font-semibold text-g-ink outline-none placeholder:text-g-mute focus:ring-2 focus:ring-g-ink" />
                  <button className={cn(pill, "bg-g-ink text-white")}>{t("cta_btn")}</button>
                </form>
              )}
              <a href="/app" className="mt-8 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4"><MessageCircle size={15} />{t("cta_demo")}</a>
            </div>
          </SceneArt>
        </motion.div>
      </section>
      <SiteFooter />
    </div>
  );
}
