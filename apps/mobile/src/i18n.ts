export type Lang = "fr" | "ar" | "da";
export const LANGS: { id: Lang; label: string }[] = [{ id: "fr", label: "FR" }, { id: "da", label: "الدارجة" }, { id: "ar", label: "العربية" }];
const fr = {
  tag: "Ton quartier, ton équipe.", phone: "Numéro de téléphone", phoneHint: "06 12 34 56 78", sendCode: "Recevoir le code", code: "Code à 6 chiffres", verify: "Valider",
  codeSentDev: "Code de test (pilote) :", wrongCode: "Code incorrect ou expiré", badPhone: "Numéro marocain invalide", network: "Connexion impossible. Réessaie.",
  home: "Accueil", bookings: "Réservations", profile: "Profil", search: "Rechercher un service…", all: "Tout", near: "Près de chez toi", empty: "Aucun service trouvé. Élargis la recherche.",
  c_cleaning: "Ménage", c_diy: "Bricolage", c_garden: "Jardin", c_tutoring: "Cours", c_errands: "Courses", c_rides: "Transport", c_pets: "Animaux", c_lending: "Prêt",
  book: "Réserver", booking: "Réservation en cours…", booked: "Demande envoyée ✔", mad: "MAD", km: "km", free: "Gratuit", available: "Disponible cette semaine", verified: "Vérifié",
  noBookings: "Aucune réservation pour l'instant.", pullRefresh: "Tire pour actualiser", logout: "Se déconnecter", language: "Langue", account: "Compte", location: "Position", useMyLocation: "Utiliser ma position", usingCenter: "Maarif, Casablanca (par défaut)", cash: "Paiement en cash à la fin",
  s_Requested: "En attente", s_Offered: "Proposée", s_Accepted: "Acceptée", s_EnRoute: "En route", s_Arrived: "Arrivé", s_InProgress: "En cours", s_Completed: "Terminée", s_Confirmed: "Confirmée", s_Disputed: "Litige", s_Settled: "Réglée", s_Refunded: "Remboursée", s_Declined: "Refusée", s_Expired: "Expirée", s_Cancelled: "Annulée",
  cancel: "Annuler", confirm: "Confirmer le service", live: "Suivi en direct", liveOn: "Position du prestataire reçue", back: "Retour",
};
type Dict = typeof fr;
const ar: Dict = {
  tag: "حيّك، فريقك.", phone: "رقم الهاتف", phoneHint: "06 12 34 56 78", sendCode: "أرسل الرمز", code: "رمز من 6 أرقام", verify: "تأكيد",
  codeSentDev: "رمز تجريبي (النسخة التجريبية):", wrongCode: "الرمز خاطئ أو منتهي", badPhone: "رقم مغربي غير صالح", network: "تعذّر الاتصال. أعد المحاولة.",
  home: "الرئيسية", bookings: "الحجوزات", profile: "حسابي", search: "ابحث عن خدمة…", all: "الكل", near: "قريب منك", empty: "لا خدمات. وسّع البحث.",
  c_cleaning: "تنظيف", c_diy: "إصلاحات", c_garden: "حديقة", c_tutoring: "دروس", c_errands: "مشتريات", c_rides: "نقل", c_pets: "حيوانات", c_lending: "إعارة",
  book: "احجز", booking: "جارٍ الحجز…", booked: "تم إرسال الطلب ✔", mad: "درهم", km: "كلم", free: "مجاني", available: "متاح هذا الأسبوع", verified: "موثّق",
  noBookings: "لا حجوزات بعد.", pullRefresh: "اسحب للتحديث", logout: "تسجيل الخروج", language: "اللغة", account: "الحساب", location: "الموقع", useMyLocation: "استخدم موقعي", usingCenter: "المعارف، الدار البيضاء (افتراضي)", cash: "الدفع نقدا عند الانتهاء",
  s_Requested: "قيد الانتظار", s_Offered: "مقترحة", s_Accepted: "مقبولة", s_EnRoute: "في الطريق", s_Arrived: "وصل", s_InProgress: "قيد التنفيذ", s_Completed: "منتهية", s_Confirmed: "مؤكدة", s_Disputed: "نزاع", s_Settled: "مسوّاة", s_Refunded: "مستردة", s_Declined: "مرفوضة", s_Expired: "منتهية الصلاحية", s_Cancelled: "ملغاة",
  cancel: "إلغاء", confirm: "أكّد الخدمة", live: "تتبع مباشر", liveOn: "وصل موقع المقدّم", back: "رجوع",
};
const da: Dict = {
  ...ar, tag: "حومتك، فريقك.", sendCode: "صيفط ليا الكود", code: "كود من 6 أرقام", verify: "تأكيد", codeSentDev: "كود تجريبي:", wrongCode: "الكود غالط ولا سالا", badPhone: "نمرة مغربية ماشي صحيحة",
  network: "ما قدرناش نتصلو. عاود.", search: "قلّب على خدمة…", all: "كلشي", near: "قريب منك", c_diy: "بريكولاج", c_cleaning: "نقاء", c_garden: "جردة", c_errands: "كورسات", c_lending: "تسليف",
  book: "احجز", booked: "تصيفطات الطلب ✔", noBookings: "ما كاين حتى حجز.", logout: "خروج", cash: "خلّص كاش فالأخير", s_Requested: "كيتسنّى", s_Accepted: "مقبولة", s_EnRoute: "فالطريق", s_Completed: "سالات",
};
export const DICT: Record<Lang, Dict> = { fr, ar, da };
export type Key = keyof Dict;
