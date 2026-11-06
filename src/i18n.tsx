import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "fr" | "ar" | "da";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "fr", label: "FR" },
  { id: "da", label: "الدارجة" },
  { id: "ar", label: "العربية" },
];

type Dict = Record<string, string | string[]>;
const fr: Dict = {
  // landing
  nav_how: "Comment ça marche", nav_features: "Pourquoi Hawma", nav_cta: "Ouvrir l'app",
  hero_badge: "Bientôt dans ton quartier · Maroc",
  hero_h1a: "Ton quartier,", hero_h1b: "ton équipe.",
  hero_p: "Ménage, bricolage, cours, courses, transport : trouve un voisin de confiance à quelques rues de chez toi, ou gagne un revenu avec ton talent.",
  hero_cta: "Essayer l'app", hero_cta2: "Voir comment ça marche",
  trust1: "Voisins vérifiés", trust2: "Cash ou mobile", trust3: "3 langues",
  marquee: ["Ménage", "Bricolage", "Cours particuliers", "Jardinage", "Courses", "Transport", "Garde d'animaux", "Prêt d'objets"],
  how_h: "Prêt en 3 étapes", how_p: "Pas de compte compliqué : ton numéro de téléphone suffit.",
  st1: "Choisis ta hawma", sp1: "Ton quartier et un rayon de 500 m à 50 km. Ta position exacte n'est jamais partagée.",
  st2: "Trouve ou propose", sp2: "Parcours la carte et la liste, ou publie un service en une minute, même avec un message vocal.",
  st3: "Confirme et note", sp3: "Discute, fixe un rendez-vous, paie en cash ou en mobile, puis laisse un avis lié à un vrai service.",
  feat_h: "Pensé au Maroc, pas copié de l'étranger", feat_p: "Hawma colle à la façon dont on s'entraide ici : en Darija, avec du cash, et sur WhatsApp.",
  f1: "Darija, arabe, français", fp1: "Interface complète en 3 langues, de droite à gauche, avec notes vocales.",
  f2: "Cash d'abord", fp2: "Paie en espèces après le service, ou en mobile (CMI, Orange Money, inwi money). Un litige ? Un bouton, une réponse.",
  f3: "Confiance réelle", fp3: "CIN + OTP + photo pour les prestataires. Avis uniquement après un service confirmé. Badge SuperVoisin.",
  f4: "Services récurrents", fp4: "Ménage chaque mardi, cours deux fois par semaine : programme une fois, c'est réglé.",
  f5: "Groupes d'immeuble", fp5: "Annonces, prêts et entraide dans ta résidence avant même d'ouvrir au quartier.",
  f6: "Léger et hors-ligne", fp6: "Fonctionne sur connexion lente et s'installe sans store (PWA).",
  vs_h: "Hawma face aux apps de voisinage actuelles", vs_us: "Hawma", vs_them: "Apps actuelles",
  vs1: "Langues", vs1a: "Darija · AR · FR", vs1b: "FR",
  vs2: "Paiement", vs2a: "Cash + mobile + litiges", vs2b: "Non précisé",
  vs3: "Vérification", vs3a: "CIN + OTP + photo", vs3b: "Badge simple",
  vs4: "Services récurrents", vs5: "Partage WhatsApp",
  cta_h: "Sois parmi les premiers voisins", cta_p: "On ouvre quartier par quartier. Laisse ton WhatsApp ou ton e-mail et on te prévient quand Hawma arrive chez toi.",
  cta_ph: "WhatsApp ou e-mail", cta_btn: "Me prévenir", cta_ok: "Merci ! On te prévient très vite.", cta_demo: "Ou essaie la démo",
  foot: "Fait au Maroc avec ❤️",
  // app
  all: "Tout", search: "Rechercher un service…", home: "Accueil", map: "Carte", post: "Publier", chat: "Messages", me: "Profil",
  c_diy: "Bricolage", c_clean: "Ménage", c_garden: "Jardin", c_tutor: "Cours", c_errand: "Courses", c_ride: "Transport", c_pet: "Animaux", c_lend: "Prêt",
  onb_t1: "Bienvenue dans ta", onb_t2: "hawma", onb_p: "Choisis ta langue, ton quartier et ton rayon. C'est tout.",
  lang: "Langue", hood: "Quartier", radius: "Rayon", phone: "Téléphone (OTP envoyé)", go: "Commencer",
  near: "Près de chez toi", results: "services", empty: "Aucun service dans ce rayon. Agrandis-le ou publie le tien !",
  book: "Réserver / discuter", share: "Partager sur WhatsApp", pay: "Paiement", cash: "Cash à la fin", mobile: "Mobile (CMI · Orange Money · inwi money)",
  once: "Une fois", weekly: "Chaque semaine", price: "Prix (MAD)", cat: "Catégorie", freq: "Fréquence", title: "Titre", desc: "Description",
  publish: "Publier mon service", published: "Service publié ✔", voice: "Note vocale (bientôt)",
  verified: "Vérifié", super: "SuperVoisin", reviews: "avis", dispute: "Signaler un problème", disputed: "Signalement envoyé", confirm: "Confirmer le service", confirmed: "Service confirmé ✔ Tu peux laisser un avis.",
  type: "Écrire un message…", nochat: "Aucune conversation pour l'instant. Réserve un service pour commencer.",
  ver: "Vérifications", v_phone: "Téléphone (OTP)", v_cin: "Carte nationale (CIN)", v_photo: "Photo de profil", done: "Fait", todo: "À faire",
  groups: "Mes groupes", g1: "Ma résidence / immeuble", g2: "Mon quartier", join: "Rejoindre", joined: "Rejoint",
  bio: "Voisin·e sur Hawma", reset: "Réinitialiser la démo", mad: "MAD", per_h: "h", per_visit: "visite", per_trip: "trajet", per_day: "jour", per_errand: "course", per_3h: "3 h",
  replies: ["Salam ! Oui, je suis disponible.", "Parfait, on dit demain à 17 h ?", "D'accord, paiement cash à la fin 👍", "Je t'envoie ma position avant de venir."],
};

const ar: Dict = {
  nav_how: "كيف يعمل", nav_features: "لماذا حومة", nav_cta: "افتح التطبيق",
  hero_badge: "قريبا في حيّك · المغرب",
  hero_h1a: "حيّك،", hero_h1b: "فريقك.",
  hero_p: "تنظيف، إصلاحات، دروس، مشتريات، نقل: اعثر على جار موثوق على بعد شوارع قليلة، أو اكسب دخلا إضافيا بموهبتك.",
  hero_cta: "جرّب التطبيق", hero_cta2: "شاهد كيف يعمل",
  trust1: "جيران موثّقون", trust2: "نقدا أو بالهاتف", trust3: "3 لغات",
  marquee: ["تنظيف", "إصلاحات", "دروس خصوصية", "حدائق", "مشتريات", "نقل", "رعاية الحيوانات", "إعارة الأغراض"],
  how_h: "جاهز في 3 خطوات", how_p: "لا تسجيل معقّد: رقم هاتفك يكفي.",
  st1: "اختر حومتك", sp1: "حيّك ونطاق من 500 متر إلى 50 كلم. موقعك الدقيق لا يُشارك أبدا.",
  st2: "ابحث أو اقترح", sp2: "تصفّح الخريطة والقائمة، أو انشر خدمة في دقيقة، حتى برسالة صوتية.",
  st3: "أكّد وقيّم", sp3: "تحدّث، حدّد موعدا، ادفع نقدا أو بالهاتف، ثم اترك تقييما مرتبطا بخدمة حقيقية.",
  feat_h: "صُمّم للمغرب، لا منسوخ من الخارج", feat_p: "حومة تشبه طريقة تعاوننا هنا: بالدارجة، نقدا، وعبر واتساب.",
  f1: "الدارجة، العربية، الفرنسية", fp1: "واجهة كاملة بثلاث لغات، من اليمين لليسار، مع رسائل صوتية.",
  f2: "النقد أولا", fp2: "ادفع نقدا بعد الخدمة أو عبر الهاتف (CMI، أورنج موني، إنوي موني). نزاع؟ زر واحد وجواب.",
  f3: "ثقة حقيقية", fp3: "بطاقة وطنية + OTP + صورة لمقدّمي الخدمة. تقييمات فقط بعد خدمة مؤكدة. شارة الجار المتميّز.",
  f4: "خدمات متكررة", fp4: "تنظيف كل ثلاثاء، دروس مرتين أسبوعيا: برمج مرة واحدة وانتهى.",
  f5: "مجموعات العمارة", fp5: "إعلانات وإعارة وتعاون داخل إقامتك قبل الانفتاح على الحي.",
  f6: "خفيف ويعمل دون اتصال", fp6: "يعمل على الإنترنت الضعيف ويُثبَّت دون متجر (PWA).",
  vs_h: "حومة مقابل تطبيقات الجوار الحالية", vs_us: "حومة", vs_them: "التطبيقات الحالية",
  vs1: "اللغات", vs1a: "دارجة · عربية · فرنسية", vs1b: "الفرنسية",
  vs2: "الدفع", vs2a: "نقد + هاتف + نزاعات", vs2b: "غير محدد",
  vs3: "التوثيق", vs3a: "بطاقة + OTP + صورة", vs3b: "شارة بسيطة",
  vs4: "خدمات متكررة", vs5: "مشاركة واتساب",
  cta_h: "كن من أوائل الجيران", cta_p: "نفتح حيّا بعد حي. اترك واتساب أو بريدك ونخبرك حين تصل حومة إليك.",
  cta_ph: "واتساب أو بريد إلكتروني", cta_btn: "أخبرني", cta_ok: "شكرا! سنخبرك قريبا.", cta_demo: "أو جرّب النسخة التجريبية",
  foot: "صُنع في المغرب بحب ❤️",
  all: "الكل", search: "ابحث عن خدمة…", home: "الرئيسية", map: "الخريطة", post: "انشر", chat: "الرسائل", me: "حسابي",
  c_diy: "إصلاحات", c_clean: "تنظيف", c_garden: "حديقة", c_tutor: "دروس", c_errand: "مشتريات", c_ride: "نقل", c_pet: "حيوانات", c_lend: "إعارة",
  onb_t1: "مرحبا بك في", onb_t2: "حومتك", onb_p: "اختر اللغة والحي والنطاق. هذا كل شيء.",
  lang: "اللغة", hood: "الحي", radius: "النطاق", phone: "الهاتف (سيصلك رمز OTP)", go: "ابدأ",
  near: "قريب منك", results: "خدمات", empty: "لا خدمات ضمن هذا النطاق. وسّعه أو انشر خدمتك!",
  book: "احجز / تحدّث", share: "شارك عبر واتساب", pay: "الدفع", cash: "نقدا عند الانتهاء", mobile: "بالهاتف (CMI · أورنج موني · إنوي موني)",
  once: "مرة واحدة", weekly: "كل أسبوع", price: "السعر (درهم)", cat: "الصنف", freq: "التكرار", title: "العنوان", desc: "الوصف",
  publish: "انشر خدمتي", published: "تم النشر ✔", voice: "رسالة صوتية (قريبا)",
  verified: "موثّق", super: "جار متميّز", reviews: "تقييم", dispute: "أبلغ عن مشكلة", disputed: "تم إرسال البلاغ", confirm: "أكّد الخدمة", confirmed: "تم تأكيد الخدمة ✔ يمكنك ترك تقييم.",
  type: "اكتب رسالة…", nochat: "لا محادثات بعد. احجز خدمة لتبدأ.",
  ver: "التوثيق", v_phone: "الهاتف (OTP)", v_cin: "البطاقة الوطنية", v_photo: "صورة الحساب", done: "تم", todo: "ناقص",
  groups: "مجموعاتي", g1: "إقامتي / عمارتي", g2: "حيّي", join: "انضم", joined: "منضم",
  bio: "جار في حومة", reset: "إعادة ضبط العرض", mad: "درهم", per_h: "س", per_visit: "زيارة", per_trip: "رحلة", per_day: "يوم", per_errand: "مشوار", per_3h: "3 س",
  replies: ["السلام! نعم أنا متوفر.", "ممتاز، نتلاقى غدا على الخامسة؟", "حسنا، الدفع نقدا في النهاية 👍", "سأرسل لك موقعي قبل أن آتي."],
};

const da: Dict = {
  ...ar,
  nav_how: "كيفاش خدام", nav_features: "علاش حومة", nav_cta: "حلّ التطبيق",
  hero_badge: "قريب فحيّك · المغرب",
  hero_h1a: "حومتك،", hero_h1b: "فريقك.",
  hero_p: "نقاء، بريكولاج، دروس، كورسات، نقل: لقا جار موثوق قريب منك، ولا ربح شي فلوس بالموهبة ديالك.",
  hero_cta: "جرّب التطبيق", hero_cta2: "شوف كيفاش خدام",
  trust1: "جيران موثّقين", trust2: "كاش ولا بالتيليفون", trust3: "3 لغات",
  marquee: ["نقاء", "بريكولاج", "دروس خصوصية", "جردة", "كورسات", "نقل", "حراسة الحيوانات", "تسليف الغراض"],
  how_h: "واجد فـ3 خطوات", how_p: "بلا تسجيل معقّد: النمرة ديالك كافية.",
  st1: "اختار حومتك", sp1: "الحيّ ديالك ومسافة من 500 متر حتى 50 كلم. الموقع الدقيق ما كيتشاركش.",
  st2: "لقا ولا اقترح", sp2: "تصفح الخريطة واللائحة، ولا نشر خدمة فدقيقة، حتى بفوكال.",
  st3: "أكّد وقيّم", sp3: "دردش، تفاهم على الموعد، خلّص كاش ولا بالتيليفون، ومن بعد كتب رأيك على خدمة حقيقية.",
  feat_h: "مصمّم للمغرب، ماشي منسوخ", feat_p: "حومة كتفهم كيفاش كنتعاونو هنا: بالدارجة، كاش، وعلى واتساب.",
  f1: "دارجة، عربية، فرنسية", fp1: "واجهة كاملة بـ3 لغات، من اليمين لليسار، مع فوكالات.",
  f2: "الكاش قبل كلشي", fp2: "خلّص كاش من بعد الخدمة ولا بالتيليفون (CMI، أورونج موني، إنوي موني). مشكل؟ بوطون واحد وجواب.",
  f3: "ثقة حقيقية", fp3: "CIN + OTP + تصويرة للمقدّمين. التقييم غير من بعد خدمة مؤكدة. شارة الجار المتميّز.",
  f4: "خدمات مكررة", fp4: "نقاء كل تلات، دروس جوج مرات فالسيمانة: برمج مرة وحدة وسالي الهم.",
  f5: "مجموعات العمارة", fp5: "إعلانات وتسليف وتعاون فالإقامة ديالك قبل ما تحل للحيّ.",
  f6: "خفيف وخدام بلا نيت قوي", fp6: "خدام بالنيت الضعيف وكيتّسطا بلا ستور (PWA).",
  vs_h: "حومة قدّام تطبيقات الجوار اللي كاينين", vs_them: "التطبيقات اللي كاينين",
  vs2a: "كاش + تيليفون + نزاعات", vs2b: "ما مذكورش", vs3b: "شارة عادية",
  cta_h: "كون من لولين فالجيران", cta_p: "كنحلو حيّ حيّ. خلّي واتساب ولا الإيميل ونعلموك فاش توصل حومة عندك.",
  cta_ph: "واتساب ولا إيميل", cta_btn: "عاودني", cta_ok: "شكرا! غنعلموك قريب.", cta_demo: "ولا جرّب الديمو",
  foot: "مصنوع فالمغرب بالحب ❤️",
  all: "كلشي", search: "قلّب على خدمة…", c_diy: "بريكولاج", c_clean: "نقاء", c_garden: "جردة", c_errand: "كورسات", c_pet: "حيوانات", c_lend: "تسليف",
  home: "الرئيسية", map: "الخريطة", post: "نشر", chat: "الرسائل", me: "البروفيل",
  onb_t1: "مرحبا بيك فـ", onb_t2: "حومتك", onb_p: "اختار اللغة والحيّ والمسافة. وصافي.",
  lang: "اللغة", hood: "الحيّ", radius: "المسافة", phone: "التيليفون (غتوصلك OTP)", go: "بدا",
  near: "قريب منك", results: "خدمات", empty: "ما كاين حتى خدمة فهاد المسافة. كبّرها ولا نشر ديالك!",
  book: "احجز / دردش", share: "شارك على واتساب", cash: "كاش فالأخير", mobile: "بالتيليفون (CMI · أورونج موني · إنوي موني)",
  once: "مرة وحدة", weekly: "كل سيمانة", price: "الثمن (درهم)", cat: "النوع", freq: "التكرار",
  publish: "نشر الخدمة ديالي", published: "تنشرات ✔", voice: "فوكال (قريب)",
  verified: "موثّق", super: "جار متميّز", reviews: "تقييم", dispute: "بلّغ على مشكل", disputed: "تبعت البلاغ", confirm: "أكّد الخدمة", confirmed: "الخدمة تأكدات ✔ تقدر تكتب تقييم.",
  type: "كتب ميساج…", nochat: "ما كاين حتى محادثة. احجز خدمة باش تبدا.",
  v_cin: "الكارط ناسيونال", v_photo: "تصويرة البروفيل", done: "تمّ", todo: "باقي",
  groups: "المجموعات ديالي", g1: "الإقامة / العمارة ديالي", g2: "الحيّ ديالي", join: "دخل", joined: "داخل",
  bio: "جار فحومة", reset: "عاود الديمو", mad: "درهم",
  replies: ["السلام! أه أنا موجود.", "مزيان، نتلاقاو غدا على 5؟", "واخا، كاش فالأخير 👍", "غنصيفط ليك الموقع قبل ما نجي."],
};

const D: Record<Lang, Dict> = { fr, ar, da };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; list: (k: string) => string[]; rtl: boolean };
const C = createContext<Ctx>(null!);
export const useI18n = () => useContext(C);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("hawma.lang") as Lang) || "fr");
  const rtl = lang !== "fr";
  useEffect(() => {
    localStorage.setItem("hawma.lang", lang);
    document.documentElement.lang = lang === "fr" ? "fr" : "ar";
    document.documentElement.dir = rtl ? "rtl" : "ltr";
  }, [lang, rtl]);
  const t = (k: string) => { const v = D[lang][k] ?? fr[k] ?? k; return Array.isArray(v) ? v[0] : v; };
  const list = (k: string) => { const v = D[lang][k] ?? fr[k]; return Array.isArray(v) ? v : []; };
  return <C.Provider value={{ lang, setLang, t, list, rtl }}>{children}</C.Provider>;
}
