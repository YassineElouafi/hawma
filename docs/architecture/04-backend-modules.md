# 04 · Backend modules, events & API

## 4.1 Module responsibilities

| Module | Owns (tables) | Public interface | Emits events |
|---|---|---|---|
| identity | user, device, session, otp_challenge | `register`, `verifyOtp`, `refresh`, `revoke` | `user.registered`, `user.suspended` |
| profiles | customer_profile, provider_profile, address | `getProfile`, `switchMode` | `provider.activated` |
| verification | verification, kyc_document | `submit`, `review`, `tierOf` | `kyc.submitted`, `kyc.approved`, `kyc.rejected` |
| catalogue | category, service_offer, price_rule, availability_rule | `publish`, `quote`, `slotsFor` | `offer.published`, `offer.updated` |
| discovery | (reads search index) | `search`, `nearby`, `suggest` | – |
| booking | booking, booking_event, recurring_schedule, attachment | `request`, `accept`, `start`, `complete`, `cancel` | `booking.*` |
| dispatch | dispatch_request, dispatch_offer | `open`, `offer`, `claim` | `dispatch.offered`, `dispatch.claimed`, `dispatch.expired` |
| payments | payment, refund, gateway_event | `createIntent`, `capture`, `refund` | `payment.*` |
| ledger | wallet, ledger_entry, payout | `post`, `balance`, `schedulePayout` | `ledger.posted`, `payout.paid` |
| messaging | conversation, message | `send`, `history`, `markRead` | `message.sent` |
| reputation | review, provider_score | `rate`, `scoreOf` | `review.created`, `score.changed` |
| promotions | promo_code, redemption, credit | `apply`, `redeem` | `promo.redeemed` |
| support | ticket, dispute, evidence | `open`, `resolve` | `dispute.opened`, `dispute.resolved` |
| notifications | notification, preference, template | `notify` | – |
| risk | risk_signal, rule, block_list | `assess` | `risk.flagged` |
| admin | audit_log, staff_user, role | `can`, `audit` | – |

## 4.2 Event catalogue and consumers

```mermaid
flowchart LR
  subgraph Producers
    B["booking"] 
    P["payments"]
    K["verification"]
    R["reputation"]
    S["support"]
    C["catalogue"]
  end
  subgraph Events
    E1(["booking.requested"])
    E2(["booking.accepted"])
    E3(["booking.completed"])
    E4(["booking.cancelled"])
    E5(["payment.captured"])
    E6(["kyc.approved"])
    E7(["review.created"])
    E8(["dispute.opened"])
    E9(["offer.published"])
  end
  subgraph Consumers
    N["notifications"]
    D["dispatch"]
    L["ledger"]
    RP["reputation"]
    SR["search indexer"]
    RK["risk"]
    AN["analytics sink"]
  end
  B --> E1 & E2 & E3 & E4
  P --> E5
  K --> E6
  R --> E7
  S --> E8
  C --> E9
  E1 --> D & N & RK
  E2 --> N & AN
  E3 --> N & L & RP
  E4 --> N & L
  E5 --> L & AN
  E6 --> N & SR
  E7 --> RP & SR
  E8 --> N & RK
  E9 --> SR
```

Event envelope (JSON, versioned):

```json
{
  "id": "01JD…ULID",
  "type": "booking.accepted",
  "version": 1,
  "occurredAt": "2026-11-07T17:01:47Z",
  "actor": { "type": "user", "id": "…" },
  "aggregate": { "type": "booking", "id": "…" },
  "data": { "providerId": "…", "scheduledAt": "…" },
  "trace": { "traceId": "…" }
}
```

Reliability: **transactional outbox** (event row written in the same DB transaction, relayed to NATS), consumers are idempotent (dedupe on `event.id`), poison messages go to a dead-letter stream with alerting.

## 4.3 API surface (REST, versioned `/v1`)

| Area | Endpoints (examples) |
|---|---|
| Auth | `POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/refresh` · `DELETE /auth/session` |
| Me | `GET /me` · `PATCH /me` · `POST /me/mode` · `GET/POST /me/addresses` |
| Verification | `POST /verifications` · `POST /verifications/:id/documents` (signed upload) |
| Catalogue | `GET /categories` · `POST /offers` · `PATCH /offers/:id` · `GET /offers/:id/slots` |
| Discovery | `GET /search?q=&cat=&lat=&lng=&radius=&sort=` · `GET /offers/nearby` |
| Booking | `POST /bookings` · `POST /bookings/:id/{accept,decline,start,arrive,complete,confirm,cancel}` · `GET /bookings?role=` |
| Dispatch | `POST /dispatch-requests` · `POST /dispatch-offers/:id/{accept,reject}` |
| Payments | `POST /bookings/:id/payment-intent` · `POST /payments/webhooks/:gateway` |
| Wallet | `GET /wallet` · `POST /wallet/topups` · `GET /payouts` |
| Chat | `GET /conversations` · `GET /conversations/:id/messages` · WS `message.send` |
| Reviews | `POST /bookings/:id/reviews` · `GET /providers/:id/reviews` |
| Support | `POST /tickets` · `POST /bookings/:id/disputes` |
| Promos | `POST /promos/validate` |
| Ops | `/ops/*` (separate audience, RBAC, audit-logged) |

Conventions: cursor pagination, `Idempotency-Key` header on every money/booking write, RFC 7807 problem+json errors, `Accept-Language` drives i18n of messages, ETag on read-heavy catalogue endpoints.

## 4.4 Realtime protocol

```mermaid
sequenceDiagram
  participant App
  participant GW as realtime-gw
  participant R as Redis pub/sub
  participant API as core-api
  App->>GW: WS connect (JWT in first frame)
  GW->>R: SUBSCRIBE user:{id}, booking:{id}…
  API->>R: PUBLISH booking:{id} {status: EnRoute}
  R-->>GW: message
  GW-->>App: {"t":"booking.status","id":"…","status":"EnRoute"}
  App->>GW: {"t":"loc","lat":33.58,"lng":-7.63}  (provider, every 5 s while en route)
  GW->>R: GEOADD providers:online · PUBLISH booking:{id}:loc
  R-->>GW: loc
  GW-->>App: customer receives provider position
```

Channels: `user:{id}` (notifications, status), `booking:{id}` (status, ETA, location), `conversation:{id}` (chat, typing, read receipts). Missed events are recovered with `GET /sync?since=cursor` after reconnect.
