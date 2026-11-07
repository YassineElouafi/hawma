# 03 · Domain model

## 3.1 Bounded contexts

```mermaid
flowchart LR
  ID["Identity & Access"] --- PR["Profiles & Verification"]
  PR --- CA["Catalogue"]
  CA --- BK["Booking"]
  BK --- DI["Dispatch"]
  BK --- PA["Payments"]
  PA --- LE["Ledger"]
  BK --- ME["Messaging"]
  BK --- RE["Reputation"]
  BK --- SU["Support"]
  PA --- PRO["Promotions"]
  ID --- RI["Risk"]
```

## 3.2 Entity-relationship diagram (core)

```mermaid
erDiagram
  USER ||--o| CUSTOMER_PROFILE : has
  USER ||--o| PROVIDER_PROFILE : has
  USER ||--o{ DEVICE : owns
  USER ||--o{ ADDRESS : saves
  USER ||--o{ VERIFICATION : submits
  PROVIDER_PROFILE ||--o{ SERVICE_OFFER : publishes
  PROVIDER_PROFILE ||--o{ AVAILABILITY_RULE : defines
  PROVIDER_PROFILE }o--o{ ZONE : serves
  CATEGORY ||--o{ SERVICE_OFFER : classifies
  CATEGORY ||--o{ CATEGORY : parent
  SERVICE_OFFER ||--o{ PRICE_RULE : prices
  CUSTOMER_PROFILE ||--o{ BOOKING : requests
  PROVIDER_PROFILE ||--o{ BOOKING : fulfils
  SERVICE_OFFER ||--o{ BOOKING : instantiates
  BOOKING ||--o{ BOOKING_EVENT : logs
  BOOKING ||--o| DISPATCH_REQUEST : "may spawn"
  DISPATCH_REQUEST ||--o{ DISPATCH_OFFER : sends
  BOOKING ||--o{ PAYMENT : settles
  PAYMENT ||--o{ REFUND : reverses
  BOOKING ||--o{ REVIEW : receives
  BOOKING ||--o| DISPUTE : may_have
  BOOKING ||--o{ CONVERSATION : "has thread"
  CONVERSATION ||--o{ MESSAGE : contains
  BOOKING ||--o{ BOOKING_ATTACHMENT : proves
  RECURRING_SCHEDULE ||--o{ BOOKING : generates
  PROMO_CODE ||--o{ PROMO_REDEMPTION : used_in
  PAYMENT ||--o{ LEDGER_ENTRY : posts
  WALLET ||--o{ LEDGER_ENTRY : holds
  USER ||--|| WALLET : owns
  PROVIDER_PROFILE ||--o{ PAYOUT : receives
  PAYOUT ||--o{ LEDGER_ENTRY : posts
  USER ||--o{ NOTIFICATION : gets

  USER {
    uuid id PK
    string phone_e164 UK
    string status "active|suspended|banned"
    string locale "fr|ar|da"
    timestamptz created_at
  }
  PROVIDER_PROFILE {
    uuid user_id PK
    string kyc_tier "0|1|2|3"
    float rating_avg
    int jobs_completed
    string status "pending|active|paused"
    geography home_point
  }
  SERVICE_OFFER {
    uuid id PK
    uuid provider_id FK
    uuid category_id FK
    string title_i18n
    geography location
    int radius_m
    string pricing_model "fixed|hourly|quote"
    int base_price_mad
    bool recurring_allowed
  }
  BOOKING {
    uuid id PK
    uuid customer_id FK
    uuid provider_id FK
    uuid offer_id FK
    string mode "catalogue|dispatch|quote"
    string status
    timestamptz scheduled_at
    geography service_location
    int total_mad
    int service_fee_mad
    string payment_method "cash|card|wallet"
  }
  PAYMENT {
    uuid id PK
    uuid booking_id FK
    string method
    string status "pending|authorised|captured|failed|refunded"
    int amount_mad
    string idempotency_key UK
  }
  LEDGER_ENTRY {
    uuid id PK
    uuid txn_id
    uuid account_id
    int amount_mad "signed"
    string kind
    timestamptz created_at
  }
```

## 3.3 Booking state machine

```mermaid
stateDiagram-v2
  [*] --> Requested: customer submits
  Requested --> Offered: dispatch mode, offers sent
  Offered --> Accepted: provider accepts
  Offered --> Expired: no taker in TTL
  Requested --> Accepted: catalogue mode, provider accepts
  Requested --> Declined: provider declines
  Requested --> Cancelled: customer cancels
  Accepted --> EnRoute: provider starts trip
  Accepted --> Cancelled: either side cancels (fee rules)
  EnRoute --> Arrived: geofence or manual
  Arrived --> InProgress: provider starts
  InProgress --> Completed: provider marks done
  Completed --> Confirmed: customer confirms or auto after 24h
  Completed --> Disputed: customer raises dispute
  Confirmed --> Settled: payment captured and ledger posted
  Disputed --> Settled: resolved with outcome
  Disputed --> Refunded: refunded in full or part
  Settled --> [*]
  Refunded --> [*]
  Declined --> [*]
  Expired --> [*]
  Cancelled --> [*]
```

Transitions are **commands** validated by the booking aggregate; every transition appends a `BOOKING_EVENT` and publishes a domain event (`booking.accepted`, `booking.completed`, …).

## 3.4 Payment state machine

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Authorised: card auth OK
  Pending --> AwaitingCash: method = cash
  Pending --> Failed: auth declined
  Authorised --> Captured: booking confirmed
  Authorised --> Voided: booking cancelled
  AwaitingCash --> CashCollected: provider confirms cash received
  AwaitingCash --> Uncollected: customer no-show
  CashCollected --> Captured: reconciliation
  Captured --> PartiallyRefunded
  Captured --> Refunded
  Captured --> [*]
  Failed --> [*]
  Voided --> [*]
  Uncollected --> [*]
```

## 3.5 Ledger model (double-entry)

```mermaid
flowchart LR
  CASH["Customer pays cash 200 MAD"] --> T1
  subgraph T1["Txn: cash job settled"]
    direction TB
    L1["DR  provider_cash_held    +200"]
    L2["CR  provider_earnings     -170"]
    L3["CR  platform_revenue      -30 (15% fee)"]
  end
  T1 --> NET["Provider owes platform 30 MAD<br/>(netted against next card payout<br/>or collected via wallet top-up)"]
```

Accounts: `customer_wallet`, `provider_earnings`, `provider_cash_held`, `platform_revenue`, `platform_float`, `promo_expense`, `payment_gateway_clearing`, `refund_reserve`. Invariant: sum of every transaction = 0. A nightly job verifies it and reconciles against gateway reports.

## 3.6 Provider verification tiers

```mermaid
flowchart LR
  T0["Tier 0<br/>phone OTP"] --> T1["Tier 1<br/>+ CIN front/back OCR<br/>+ selfie liveness"]
  T1 --> T2["Tier 2<br/>+ criminal-record extract<br/>+ address proof"]
  T2 --> T3["Tier 3<br/>+ trade licence / auto-entrepreneur<br/>+ insurance"]
  T0 -.-> A0["Can browse and book"]
  T1 -.-> A1["Can offer low-risk services<br/>(tutoring, errands, lending)"]
  T2 -.-> A2["Can enter customers' homes<br/>(cleaning, childcare, DIY)"]
  T3 -.-> A3["Can take quotes above 1 000 MAD<br/>and pro badge"]
```
