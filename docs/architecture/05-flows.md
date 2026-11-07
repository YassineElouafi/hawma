# 05 · Key flows (sequence diagrams)

## F1 · Sign-up / login with phone OTP

```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant API as core-api (identity)
  participant R as Redis
  participant N as notification-svc
  participant SMS as SMS / WhatsApp
  U->>App: enter phone +212…
  App->>API: POST /auth/otp/request
  API->>R: rate-limit(phone, device, ip)
  API->>R: SET otp:{phone} hash(code) TTL 5m
  API->>N: event otp.requested
  N->>SMS: send code (WhatsApp first, SMS fallback)
  SMS-->>U: 6-digit code
  U->>App: enter code
  App->>API: POST /auth/otp/verify
  API->>R: compare hash, attempts ≤ 5
  API->>API: upsert user · register device · issue JWT(15m) + refresh(30d, rotating)
  API-->>App: tokens + profile
```

## F2 · Provider onboarding & KYC

```mermaid
sequenceDiagram
  actor P as Provider
  participant App
  participant API
  participant S3 as Object storage (KYC bucket)
  participant K as KYC vendor
  participant Q as Ops console
  actor O as Ops reviewer
  P->>App: "Become a provider"
  App->>API: POST /verifications {tier:1}
  API-->>App: signed upload URLs (CIN front/back, selfie)
  App->>S3: PUT documents (encrypted at rest)
  App->>API: POST /verifications/:id/submit
  API->>K: OCR + liveness + face match (async)
  K-->>API: webhook result + confidence
  alt auto-pass (high confidence, no risk flags)
    API->>API: tier = 1, status = active
  else needs human
    API->>Q: enqueue review task
    O->>Q: open task, view docs (audited)
    O->>API: approve / reject with reason
  end
  API-->>App: push "You are verified ✔" (or reason + retry)
```

## F3 · Discover and book from the catalogue

```mermaid
sequenceDiagram
  actor C as Customer
  participant App
  participant API
  participant MS as Meilisearch
  participant PG as PostgreSQL
  C->>App: search "ménage" near Maarif
  App->>API: GET /search?q=ménage&lat&lng&radius=5000
  API->>MS: query + _geoRadius filter + verified filter
  MS-->>API: ranked hits
  API->>PG: hydrate prices, ratings, next free slots
  API-->>App: results (cards)
  C->>App: pick provider, choose slot, address, payment method
  App->>API: POST /bookings (Idempotency-Key)
  API->>PG: tx: validate slot, create booking(Requested), outbox(booking.requested)
  API-->>App: 201 booking
  Note over API: notifications fan out to provider (push + WS)
```

## F4 · Provider accepts and fulfils

```mermaid
sequenceDiagram
  actor P as Provider
  actor C as Customer
  participant App
  participant API
  participant RT as realtime-gw
  P->>App: tap Accept
  App->>API: POST /bookings/:id/accept
  API->>API: Requested→Accepted, reserve slot, open conversation
  API-->>RT: publish booking:{id}
  RT-->>C: "Amina accepted · tomorrow 17:00"
  P->>App: Start trip
  App->>API: POST …/start
  loop every 5 s
    App->>RT: loc
    RT-->>C: provider position + ETA
  end
  P->>App: Arrived → Start job (photo "before")
  P->>App: Complete (photo "after", checklist)
  API-->>C: "Job done — confirm & rate"
  C->>App: Confirm + rate + tip
  App->>API: POST …/confirm · POST …/reviews
```

## F5 · On-demand dispatch (errands, urgent plumbing, rides)

```mermaid
sequenceDiagram
  actor C as Customer
  participant API
  participant D as dispatch-engine
  participant R as Redis GEO
  participant PG as PostgreSQL
  actor P1 as Provider A
  actor P2 as Provider B
  C->>API: POST /dispatch-requests (category, location, budget, urgency)
  API->>PG: booking(Requested, mode=dispatch) + outbox
  PG-->>D: event booking.requested
  D->>R: GEOSEARCH providers:online:{category} radius 3 km
  D->>PG: filter: tier ok · free · not blocked · acceptance score
  D->>D: rank = f(distance, ETA, rating, acceptance, fairness)
  D->>P1: offer #1 (TTL 20 s) via push + WS
  alt P1 accepts
    P1->>API: POST /dispatch-offers/:id/accept
    API->>PG: atomic claim (UPDATE … WHERE status='Offered')
    API-->>C: matched with A
  else timeout or reject
    D->>P2: offer #2
    Note over D: widen radius 3→6→10 km, then notify ops "unfilled"
  end
```

## F6 · Card payment (CMI) with authorisation then capture

```mermaid
sequenceDiagram
  actor C as Customer
  participant App
  participant API as payments
  participant GW as CMI gateway
  participant L as ledger
  C->>App: choose card
  App->>API: POST /bookings/:id/payment-intent
  API->>GW: create payment session (3-D Secure)
  GW-->>App: redirect / SDK sheet
  C->>GW: authenticate (3DS)
  GW-->>API: webhook authorised (signed)
  API->>API: Pending→Authorised (idempotent on gateway_event_id)
  Note over API: job confirmed by customer
  API->>GW: capture
  GW-->>API: webhook captured
  API->>L: post txn: gateway_clearing → provider_earnings + platform_revenue
```

## F7 · Cash payment and settlement

```mermaid
sequenceDiagram
  actor P as Provider
  actor C as Customer
  participant API
  participant L as ledger
  P->>API: complete job (cash 200 MAD)
  API-->>C: "Pay 200 MAD cash to Fatima"
  C->>API: confirm
  P->>API: confirm cash received
  API->>L: post: provider_cash_held +200 · provider_earnings −170 · platform_revenue −30
  Note over L: provider now owes 30 MAD fee
  L->>L: net against next card payout, or provider tops up wallet, or auto-deduct at weekly settlement
  alt provider balance owed > limit (e.g. 300 MAD)
    API->>P: block new cash jobs until settled
  end
```

## F8 · Cancellation with fee rules

```mermaid
flowchart TD
  X["Cancel requested"] --> W{"Who?"}
  W -->|Customer| T{"Time to start"}
  T -->|"> 24 h"| F0["Free · void authorisation"]
  T -->|"2–24 h"| F1["Fee 10% to provider"]
  T -->|"< 2 h or provider en route"| F2["Fee 30% + travel to provider"]
  W -->|Provider| PR{"Time to start"}
  PR -->|"> 24 h"| P0["No penalty · re-dispatch"]
  PR -->|"< 24 h"| P1["Reliability score −, auto re-dispatch,<br/>customer gets 20 MAD credit"]
  F1 & F2 --> LED["Ledger posts fee, refunds remainder"]
  P1 --> LED2["Credit promo_expense"]
```

## F9 · Dispute and refund

```mermaid
sequenceDiagram
  actor C as Customer
  participant API as support
  participant Q as Ops console
  actor A as Support agent
  actor P as Provider
  participant PAY as payments / ledger
  C->>API: POST /bookings/:id/disputes {reason, photos}
  API->>API: Completed→Disputed · freeze payout for job
  API-->>P: notified, 48 h to respond with evidence
  P->>API: add evidence
  API->>Q: ticket with chat log, GPS trail, photos, history
  A->>Q: decide: full refund / partial / reject
  Q->>API: resolve
  API->>PAY: refund per decision, adjust provider earnings
  API-->>C: outcome + explanation
  API-->>P: outcome + explanation
  Note over API: SLA 72 h · outcome feeds reputation and risk scores
```

## F10 · Provider payout

```mermaid
sequenceDiagram
  participant S as scheduler (weekly, Mondays)
  participant L as ledger
  participant API as payments
  participant B as Bank rail
  participant N as notifications
  S->>L: list provider_earnings > threshold and not frozen
  L->>L: net cash fees owed
  L->>API: create payout batch
  API->>B: transfer file / API (RIB)
  B-->>API: statuses
  API->>L: post payout_paid per provider
  API->>N: "You received 1 240 MAD"
  Note over L: unmatched or failed rows go to finance queue
```

## F11 · Chat with moderation

```mermaid
sequenceDiagram
  actor A as Sender
  participant GW as realtime-gw
  participant API as messaging
  participant MOD as moderation rules
  participant N as notification-svc
  actor B as Recipient
  A->>GW: send {conversationId, text}
  GW->>API: persist (idempotent client msg id)
  API->>MOD: scan (phone numbers, off-platform payment attempts, abuse)
  alt flagged
    API->>API: mask content · risk signal · soft warning to sender
  end
  API-->>GW: stored message
  GW-->>B: deliver (if online)
  GW->>N: if offline → push (privacy-safe preview)
```

## F12 · Recurring booking

```mermaid
sequenceDiagram
  actor C as Customer
  participant API as booking
  participant S as scheduler
  participant PAY as payments
  actor P as Provider
  C->>API: POST /recurring {offerId, every: Tue 10:00}
  API->>API: schedule + hold payment method
  loop each week
    S->>API: T−48h generate booking(Requested, source=recurring)
    API-->>P: auto-accepted if provider enabled "auto-accept regulars"
    API-->>C: reminder, skip / reschedule within 24 h
  end
  Note over API: 3 consecutive no-shows by provider → schedule paused, ops alerted
```
