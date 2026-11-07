# 07 · Clients

## 7.1 Client portfolio

```mermaid
flowchart LR
  subgraph Mobile["Hawma app · React Native (Expo)"]
    CM["Customer mode"]
    PM["Provider mode"]
    SH["Shared: auth, chat, profile, wallet, notifications"]
  end
  subgraph Web
    LP["Landing (SEO, multilingual)"]
    PW["PWA (web version of the app)"]
  end
  subgraph Internal
    OC["Ops console"]
  end
  Mobile --- DS["@hawma/design-system<br/>tokens · components"]
  Web --- DS
  Internal --- DS
  Mobile & Web & Internal --- SDK["@hawma/api-client (generated from OpenAPI)<br/>+ @hawma/schemas (zod)"]
```

One app, two modes (like Uber's rider/driver in separate apps vs Airbnb's host/guest in one): neighbours are often *both* customer and provider, so a mode switch beats two installs. A dedicated provider app can be split off later if the experience diverges.

## 7.2 Customer navigation map

```mermaid
flowchart TD
  ONB["Onboarding<br/>language · phone OTP · neighbourhood"] --> HOME
  subgraph Tabs
    HOME["Home<br/>categories · near you · re-book"]
    MAPT["Map"]
    ACT["Activity<br/>upcoming · past"]
    INB["Inbox<br/>chats · notifications"]
    ME["Profile<br/>wallet · addresses · settings"]
  end
  HOME --> SR["Search results"] --> PD["Provider / offer detail"]
  MAPT --> PD
  PD --> BK["Booking sheet<br/>slot · address · notes · payment · promo"]
  BK --> CF["Confirmation"] --> TR["Booking tracker<br/>status · live map · chat · call (masked)"]
  TR --> DN["Done → confirm · rate · tip"]
  TR --> HELP["Help / dispute"]
  ACT --> TR
  ME --> WL["Wallet / top-up / history"]
  ME --> ADR["Saved addresses"]
  ME --> REF["Referrals"]
  HOME --> RQ["Post a request<br/>(dispatch / quotes)"] --> TR
```

## 7.3 Provider navigation map

```mermaid
flowchart TD
  SW["Mode switch → Provider"] --> ONBP{"Verified?"}
  ONBP -->|no| KYCF["Onboarding wizard<br/>profile · services · CIN · selfie · pricing"]
  ONBP -->|yes| DASH
  KYCF --> DASH
  subgraph PTabs["Provider tabs"]
    DASH["Today<br/>online toggle · requests · next job"]
    CAL["Calendar<br/>availability rules · blocked days"]
    JOBS["Jobs<br/>requests · upcoming · history"]
    EARN["Earnings<br/>balance · payouts · cash owed"]
    PROF["Profile & services<br/>offers · photos · reviews · score"]
  end
  DASH --> OFFER["Incoming offer<br/>(20 s countdown, accept / skip)"]
  OFFER --> JD["Job detail<br/>route · chat · checklist"]
  JD --> RUN["Start trip → arrive → start → complete<br/>photo proof · cash confirmation"]
  EARN --> PAYO["Payout details (RIB)"]
```

## 7.4 Ops console modules

```mermaid
flowchart LR
  subgraph Ops["Ops console (RBAC, SSO, audit)"]
    DB1["Live dispatch board<br/>map · unfilled · SLA breaches"]
    KQ["KYC review queue"]
    UL["User & provider lookup 360°"]
    BL["Bookings explorer + timeline"]
    DS1["Disputes & tickets"]
    FN["Finance<br/>ledger · reconciliation · payouts · refunds"]
    PM1["Promotions & pricing<br/>zones · surge · fees"]
    CT["Catalogue admin<br/>categories · synonyms · moderation"]
    AN1["Analytics<br/>supply/demand · funnels · cohorts"]
    SYS["System<br/>feature flags · roles · audit log"]
  end
```

Roles: `support`, `trust_safety`, `city_ops`, `finance`, `catalogue`, `admin`, `read_only`. Every sensitive action requires a reason and is written to the immutable audit log; refunds and payouts above thresholds need four-eyes approval.

## 7.5 Design system

- Tokens: emerald `#0b3d33`, saffron `#f2b84b`, terracotta `#d9552b`, sand `#f7f2e9`; Fraunces display + Inter / IBM Plex Sans Arabic.
- Components (shadcn-based, shared web/mobile where possible): Button, Input, Sheet, Tabs, Badge, Avatar, Rating, ListingCard, StatusTimeline, MapPin, PriceTag, EmptyState, Toast.
- RTL-first: logical properties only (`ms-`, `ps-`, `start`/`end`), mirrored icons, locale-aware numerals (Latin digits default, Arabic-Indic optional).
- Accessibility: WCAG 2.2 AA, 48 px touch targets, dynamic type, reduced motion.
- Performance budgets: first meaningful paint < 2 s on 3G for web; app cold start < 2.5 s on a mid-range Android; list scroll 60 fps.

## 7.6 Offline & low-bandwidth

- Read-through cache for categories, recent searches, upcoming bookings; booking creation queued with idempotency key when offline.
- Image CDN with width-based variants and AVIF/WebP; blur-hash placeholders.
- Compressed JSON, pagination ≤ 20 items, delta sync for chat.
