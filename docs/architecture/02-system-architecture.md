# 02 · System architecture

## 2.1 Context (C4 level 1)

```mermaid
flowchart TB
  CUS(["Customer"])
  PRO(["Provider"])
  OPSU(["Ops staff"])
  H["<b>Hawma Platform</b><br/>on-demand local services marketplace"]
  PAY["Payment providers<br/>CMI gateway · mobile money"]
  SMS["SMS / WhatsApp Business"]
  PUSH["FCM · APNs"]
  KYC["KYC / OCR / liveness"]
  MAP["Maps · geocoding · routing"]
  BANK["Banks (payout rails)"]
  EMAIL["Transactional email"]
  CUS -->|book, pay, rate| H
  PRO -->|accept, work, get paid| H
  OPSU -->|moderate, support, finance| H
  H --> PAY & SMS & PUSH & KYC & MAP & BANK & EMAIL
```

## 2.2 Containers (C4 level 2)

```mermaid
flowchart TB
  subgraph Clients
    APP["Mobile app<br/>React Native (Expo)<br/>customer + provider modes"]
    PWA["Web app / PWA<br/>React + Vite"]
    LAND["Marketing site<br/>static (this repo)"]
    CON["Ops console<br/>React + shadcn, RBAC"]
  end
  subgraph Edge
    WAF["Cloudflare: DNS · CDN · WAF · rate-limit"]
    TRF["Traefik (TLS, routing)"]
  end
  subgraph App["Application tier (Docker, stateless)"]
    API["core-api<br/>NestJS · REST/OpenAPI"]
    RT["realtime-gw<br/>WebSocket · presence"]
    WRK["workers<br/>BullMQ jobs · schedulers"]
    DSP["dispatch-engine<br/>matching · offers"]
    NTF["notification-svc<br/>push · SMS · WhatsApp · email"]
  end
  subgraph State["State tier"]
    PG[("PostgreSQL 16<br/>+ PostGIS + pgcrypto")]
    RDS[("Redis 7<br/>cache · geo index · sessions · pubsub")]
    NATS[["NATS JetStream<br/>domain events"]]
    MEI[("Meilisearch<br/>listing search")]
    S3[("S3-compatible storage<br/>media · KYC docs (encrypted)")]
  end
  subgraph Obs["Observability"]
    OTL["OpenTelemetry collector"]
    GRA["Grafana · Loki · Tempo · Prometheus"]
    SEN["Sentry"]
  end
  APP & PWA & CON --> WAF --> TRF
  LAND --> WAF
  TRF --> API & RT
  API --> PG & RDS & MEI & S3
  API -- publish --> NATS
  NATS -- consume --> WRK & DSP & NTF & MEI
  DSP --> RDS & PG
  RT --> RDS
  WRK --> PG & RDS
  NTF --> RDS
  API & RT & WRK & DSP & NTF -.-> OTL --> GRA
  APP & PWA & CON -.-> SEN
```

## 2.3 Core API — internal component view

```mermaid
flowchart LR
  subgraph core-api
    direction TB
    IAM["identity & access"]
    USR["profiles"]
    KYCm["verification (KYC)"]
    CAT["catalogue & listings"]
    SRCH["discovery & search"]
    BKG["booking"]
    DSPm["dispatch"]
    PAYm["payments"]
    LED["ledger & payouts"]
    CHT["messaging"]
    RAT["reviews & reputation"]
    PRM["promotions & credits"]
    SUP["support & disputes"]
    NTFm["notifications"]
    GRP["groups & communities"]
    ADM["admin & audit"]
    RISK["risk & fraud"]
  end
  BKG --> CAT & USR & PAYm & DSPm & CHT
  PAYm --> LED
  DSPm --> USR
  RAT --> BKG
  SUP --> BKG & PAYm & LED
  PRM --> PAYm
  RISK -.-> IAM & BKG & PAYm
  ADM -.-> IAM & KYCm & SUP
  NTFm -.-> BKG & CHT & SUP
```

Rule: **modules talk through public service interfaces or domain events, never through each other's tables.** Enforced with an architecture test (`dependency-cruiser`) in CI.

## 2.4 Deployment topology (production, phase 1)

```mermaid
flowchart TB
  subgraph Internet
    U["Users"]
    CF["Cloudflare"]
  end
  subgraph VPS1["Node A · app (Dokploy / Docker Swarm)"]
    T["Traefik"]
    A1["core-api ×2"]
    R1["realtime-gw ×2"]
    W1["workers ×2"]
    D1["dispatch ×1"]
    N1["notification ×1"]
    ST["static: web + ops console"]
  end
  subgraph VPS2["Node B · data"]
    PGP[("Postgres primary")]
    RDP[("Redis")]
    NT[["NATS"]]
    ME[("Meilisearch")]
  end
  subgraph VPS3["Node C · standby / backups"]
    PGR[("Postgres replica")]
    BK["pgBackRest → object storage"]
  end
  subgraph Cloud["Managed services"]
    OBJ[("Object storage")]
    SMSV["SMS / WhatsApp"]
    FCM["FCM / APNs"]
  end
  U --> CF --> T
  T --> A1 & R1 & ST
  A1 & W1 & D1 & N1 --> PGP & RDP & NT
  A1 --> ME & OBJ
  PGP -- streaming replication --> PGR --> BK --> OBJ
  N1 --> SMSV & FCM
```

Scale path: split Node A into an app pool behind a load balancer → move Postgres to managed HA → extract `dispatch`, `realtime`, `notification` first (already separate processes) → Kubernetes only when the team and load justify it.

## 2.5 Network & trust zones

```mermaid
flowchart LR
  subgraph Public
    CF2["Cloudflare edge"]
  end
  subgraph DMZ
    TR2["Traefik"]
  end
  subgraph Private["Private network (no public IPs)"]
    AP2["App containers"]
    DB2[("Postgres")]
    RD2[("Redis")]
    NA2[["NATS"]]
  end
  subgraph Restricted["Restricted vault zone"]
    KS["Secrets (Doppler / SOPS)"]
    KD[("KYC doc store<br/>separate bucket + KMS key")]
  end
  CF2 --> TR2 --> AP2
  AP2 --> DB2 & RD2 & NA2
  AP2 -. short-lived signed URLs .-> KD
  AP2 -.-> KS
  OPS2(["Ops staff"]) -->|VPN + SSO + MFA| AP2
```

## 2.6 Technology choices (summary)

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript end-to-end | One language for API, web, mobile, shared types and validation |
| Backend | NestJS (Fastify adapter) | Opinionated modules/DI fit a modular monolith; mature ecosystem |
| API | REST + OpenAPI 3.1, generated typed clients | Simple, cacheable, tooling-rich; WebSocket for realtime |
| DB | PostgreSQL 16 + PostGIS | Relational integrity for money/bookings; geo queries built in |
| ORM/migrations | Drizzle ORM + SQL migrations | Typed SQL, no magic, easy review |
| Cache/geo/queues | Redis 7 (BullMQ, GEO, pub/sub) | One tool covers cache, locations, jobs, fan-out |
| Event bus | NATS JetStream | Light, persistent streams, easy ops, scales beyond Redis pub/sub |
| Search | Meilisearch | Typo-tolerant, multilingual (AR/FR), geo filter, trivial ops |
| Mobile | React Native + Expo | Shares TS/types with web; OTA updates; one app, two modes |
| Web/ops | React + Vite + Tailwind + shadcn | Same design system as today |
| Auth | Phone OTP → short JWT + rotating refresh | Phone is the identity in Morocco; passkeys later |
| Files | S3-compatible (Scaleway/R2/MinIO) | Cheap, signed URLs, separate KYC bucket |
| Observability | OpenTelemetry → Grafana stack + Sentry | Vendor-neutral |
| CI/CD | GitHub Actions → Dokploy (blue/green) | Already in place |
