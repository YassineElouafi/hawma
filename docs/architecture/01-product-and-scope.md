# 01 · Product & scope

## Personas

```mermaid
flowchart LR
  subgraph Customer
    C1["Amina, 34, Casablanca<br/>needs weekly cleaning"]
    C2["Karim, 28<br/>needs plumber tonight"]
    C3["Mme Benani, 67<br/>needs groceries delivered"]
  end
  subgraph Provider
    P1["Fatima, 41<br/>cleaner, wants steady income"]
    P2["Omar, 35<br/>plumber / electrician, micro-business"]
    P3["Youssef, 22<br/>student with scooter, errands"]
  end
  subgraph Operations
    O1["Support agent"]
    O2["Trust & Safety analyst"]
    O3["City ops manager"]
    O4["Finance"]
  end
  C1 -->|books recurring| P1
  C2 -->|urgent request| P2
  C3 -->|errand dispatch| P3
  O1 & O2 -.->|disputes, KYC| P1
  O3 -.->|supply / demand| P2
  O4 -.->|payouts| P3
```

## Capability map

```mermaid
mindmap
  root((Hawma))
    Discovery
      Geo search
      Categories
      Filters and ranking
      Saved providers
    Booking
      Catalogue booking
      On-demand dispatch
      Recurring jobs
      Quotes and custom requests
      Scheduling and availability
    Fulfilment
      Live tracking
      In-app chat
      Photo proof
      Checklists
    Payments
      Cash on completion
      Card CMI
      Wallet and credits
      Tips
      Promo codes
      Refunds
    Trust
      Identity KYC tiers
      Background checks
      Verified reviews
      Disputes
      Insurance hooks
    Provider tools
      Onboarding
      Calendar
      Earnings and payouts
      Performance score
    Growth
      Referrals
      Promotions
      Loyalty
      Neighbourhood groups
    Operations
      Support desk
      Dispatch board
      Finance console
      Analytics
```

## Glovo parity matrix

| Glovo capability | Hawma equivalent | Phase |
|---|---|---|
| Browse partners near me | Browse providers/services near me (geo search) | MVP |
| Place order, track live | Book a job, track provider live (en route → arrived → in progress) | MVP (status) / V1 (live map) |
| Courier assignment (auto-dispatch) | **Dispatch engine**: broadcast / nearest-first matching for on-demand jobs | V1 |
| Pay by card / cash / wallet | CMI card, cash, Hawma wallet, mobile money | MVP cash · V1 card · V2 wallet |
| Prime subscription | **Hawma+** (zero service fee, priority support) | V3 |
| Promo codes, vouchers | Promotions engine | V1 |
| Ratings both ways | Two-way ratings, verified by completed job | MVP |
| In-app chat & calls | Chat + masked-number voice (proxy) | MVP chat · V2 calls |
| Support chat, refunds | Support desk with SLA, refunds, dispute workflow | V1 |
| Courier earnings, shifts | Provider earnings, availability windows, payouts | V1 |
| Partner (merchant) portal | Provider business profile (pro accounts, teams) | V2 |
| City ops tooling | Ops console: zones, surge, dispatch board | V1–V2 |
| Fraud & safety | Risk engine, KYC tiers, device fingerprint | V1–V2 |
| Multi-city, multi-currency | Multi-city zones (MAD only) | V2 |

## Scope slicing

```mermaid
gantt
  dateFormat  YYYY-MM-DD
  title Delivery slices (indicative, 3–5 engineers)
  axisFormat  %b
  section MVP (Casablanca pilot)
  Auth, profiles, KYC tier 1         :a1, 2026-12-01, 30d
  Listings, geo search, booking      :a2, after a1, 35d
  Chat, notifications, ratings       :a3, after a1, 35d
  Cash payments + ops console v0     :a4, after a2, 25d
  section V1 (launch)
  Dispatch engine + live tracking    :b1, after a4, 40d
  CMI cards, ledger, payouts         :b2, after a4, 45d
  Promotions, support desk           :b3, after b1, 30d
  section V2 (scale)
  Wallet, recurring, pro accounts    :c1, after b2, 45d
  Fraud engine, multi-city           :c2, after b3, 45d
```

## MVP definition (what must be real, not demo)

- Phone-number login with OTP; customer + provider modes in one app.
- Provider onboarding with CIN photo, selfie, manual review in the ops console.
- Geo-searchable listings; booking request → accept → complete → rate.
- Cash payment recorded in the ledger; service fee accounting.
- Push + in-app chat; basic support tickets.
- Ops console v0: KYC queue, bookings list, user lookup, ban/suspend, refunds (manual).
