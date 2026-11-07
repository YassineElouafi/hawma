# 06 · Data, geo, search & realtime

## 6.1 Data ownership map

```mermaid
flowchart LR
  subgraph PG["PostgreSQL (system of record)"]
    direction TB
    S1["schema: identity"]
    S2["schema: catalogue"]
    S3["schema: booking"]
    S4["schema: money"]
    S5["schema: support"]
    S6["schema: audit"]
  end
  subgraph RD["Redis (ephemeral / derived)"]
    G["GEO: providers:online:{category}"]
    SS["sessions · rate limits"]
    CH["hot caches: offers, slots"]
    Q["BullMQ queues"]
    PS["pub/sub fan-out"]
  end
  subgraph MS["Meilisearch (derived)"]
    IDX["index: offers (geo, i18n, facets)"]
  end
  subgraph OB["Object storage"]
    M["public media (CDN)"]
    K["kyc/ (private, KMS)"]
    E["evidence/ (private)"]
  end
  subgraph AN["Analytics (phase 2)"]
    CL[("ClickHouse")]
  end
  PG -- outbox → NATS --> MS
  PG -- CDC / events --> CL
  PG -. warm .-> CH
```

Each module owns a **Postgres schema**; cross-schema foreign keys are forbidden except to `identity.user(id)`. Reads across modules go through interfaces. This is what makes later extraction possible.

## 6.2 Geo strategy

| Need | Mechanism |
|---|---|
| "Providers within R km of me" (catalogue) | Meilisearch `_geoRadius` + `_geoPoint` sort, on `location` of the offer |
| "Who is online and free right now" (dispatch) | Redis `GEOADD providers:online:{cat}` updated by the provider's heartbeat; TTL 30 s sliding presence key |
| Authoritative zone checks (serves this area?) | PostGIS `ST_DWithin` on `geography` + `zone` polygons |
| Privacy | Customers only see a **~300 m rounded** provider home point; precise address shared only after booking acceptance |
| Routing / ETA | Maps provider (OSRM self-hosted or Mapbox) with 60 s cache by cell pair; haversine fallback |

## 6.3 Search relevance

```mermaid
flowchart LR
  Q["Query + filters"] --> M["Meilisearch<br/>typo tolerance · AR/FR/Darija synonyms"]
  M --> R1["Candidate set (200)"]
  R1 --> RR["Re-rank in API"]
  RR --> OUT["Result page"]
  subgraph Signals
    D["distance (decay)"]
    RA["rating × log(jobs)"]
    V["verification tier"]
    AV["availability this week"]
    RP["response time"]
    CR["cancellation rate (penalty)"]
    PRO["boost: promoted (clearly labelled)"]
  end
  Signals --> RR
```

Synonym dictionary includes Darija transliterations (`nqa`, `plombier`, `sebbak`, `tkhdim`…) maintained by ops; query language auto-detected (Arabic script vs Latin).

## 6.4 Dispatch matching algorithm

```mermaid
flowchart TD
  A["booking.requested (mode=dispatch)"] --> B["Candidate pool = online ∩ category ∩ radius r"]
  B --> C{"Hard filters"}
  C -->|"tier ≥ required, not busy, not blocked,<br/>cash-debt under limit, schedule compatible"| D["Score"]
  C -->|fail| X["drop"]
  D --> E["score = w1·(1/ETA) + w2·rating + w3·acceptance + w4·fairness(idle time) − w5·cancel_rate"]
  E --> F["Offer to top-1 (TTL 20 s)<br/>or top-3 in parallel for urgent jobs"]
  F --> G{"Accepted?"}
  G -->|yes| H["Atomic claim → Accepted"]
  G -->|no| I{"Pool exhausted?"}
  I -->|no| F
  I -->|yes| J["Widen radius ×2 (max 3 times)"]
  J --> B
  J -->|still none| K["Unfilled → notify customer + ops board"]
```

Weights are config in the DB, tunable per city and A/B-testable. All offers/outcomes are logged for learning-to-rank later.

## 6.5 Caching & consistency

| Data | Cache | Invalidation |
|---|---|---|
| Categories, i18n strings | CDN + app memory | version key |
| Offer detail | Redis 60 s | `offer.updated` event |
| Provider slots | computed, Redis 15 s | `booking.*` events |
| Search | none (Meili is the cache) | reindex on events |
| Session | Redis | TTL / revoke |

Booking, payments and ledger are **never served from cache**; they read from the Postgres primary inside transactions with `SERIAL`/row locks on contested rows (slot reservation, dispatch claim).

## 6.6 Media pipeline

```mermaid
flowchart LR
  APP["App"] -->|signed PUT| RAW[("raw bucket")]
  RAW --> W["worker: virus scan · EXIF strip · resize · WebP/AVIF"]
  W --> PUB[("public bucket + CDN")]
  W --> MOD["NSFW / content moderation"]
  KYCUP["KYC upload"] -->|signed PUT| KB[("private KYC bucket · KMS · 90-day retention after decision")]
```

## 6.7 Backup & retention

| Data | RPO | RTO | Retention |
|---|---|---|---|
| PostgreSQL | ≤ 5 min (WAL archiving) | ≤ 1 h | PITR 14 days, monthly snapshots 12 months |
| Object storage | versioned | – | media: life of account; KYC: 90 days after decision unless legally required |
| Redis | none (rebuildable) | minutes | – |
| Audit & ledger | immutable, replicated | – | 10 years (accounting law) |
