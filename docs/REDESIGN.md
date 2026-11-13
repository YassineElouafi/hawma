# Hawma redesign — "Glide" design language (started 2026-11-13)

Requested by Yassine: redo the ENTIRE design with a better font and a modern UI, inspired by a travel-app reference (TripGlide).
Do not stop until every phase is done. Keep prod green: deploy only after CI is green; verify visually with CI screenshots.

## Design language
- Canvas `#F3F4F5`, surfaces white, ink `#111214`. Primary actions = near-black pills. Accent emerald `#0B5D4B` (verified/active/available), saffron `#F2B84B` for stars and tiny highlights. Terracotta `#D9552B` only for danger/urgent.
- Radii: cards 28–32px, sheets 32px, pills 999px. Soft large shadows, hairline borders only on inputs.
- Fonts: Plus Jakarta Sans (Latin, 400–800) + Cairo (Arabic). Headings 700–800 with tight tracking (-0.02em); body 500.
- Image-led cards without photos: category "scene" gradients (+ zellige pattern overlay + large illustration emoji) with title/rating overlaid at the bottom, white text.
- Floating black pill tab bar with white circular active indicator; chips: selected = black; "See all"/"Read more" = underlined links; rating pill = outline star + number; dark circular filter button in the search bar; black full-width CTA pill; sheets slide over the hero card.

## Phases (tick when shipped to prod and verified)
- [x] 1. Design system: tokens, fonts (web + mobile), shared components (web: `src/components/glide/*`, mobile: `apps/mobile/src/glide.tsx`)
- [x] 2. Web app `/app` redesigned (login, home hero carousel + chips, provider sheet, bookings, profile, booking detail, urgent request)
- [x] 3. Mobile app redesigned (same screens + provider mode) → publish new APK, post link
- [x] 4. Landing page redesigned (hero, sections, footer) in FR/AR/Darija, a11y clean
- [x] 5. Ops console restyled (fonts, radii, black primary, floating-pill mobile nav), keep density
- [x] 6. Final pass: a11y workflow green, screenshots reviewed on desktop+mobile, docs updated, post summary with screenshots description

## Rules
- Post a threaded update to Yassine after each phase (what changed, what was verified, what wasn't).
- If a phase breaks CI, fix before moving on. Never deploy on red.
