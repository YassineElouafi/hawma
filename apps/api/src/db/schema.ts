import { bigint, boolean, customType, doublePrecision, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** One Postgres schema per module (docs §6.1). Only identity.user is referenced across schemas. */
export const identity = pgSchema("identity");
export const catalogue = pgSchema("catalogue");
export const booking = pgSchema("booking");
export const money = pgSchema("money");
export const platform = pgSchema("platform");

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- identity ----------
export const userStatus = identity.enum("user_status", ["active", "suspended", "banned"]);
export const users = identity.table("user", {
  id: id(),
  phone: text("phone_e164").notNull(),
  status: userStatus("status").notNull().default("active"),
  locale: text("locale").notNull().default("fr"),
  displayName: text("display_name"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("user_phone_uq").on(t.phone)]);

export const devices = identity.table("device", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(), pushToken: text("push_token"), fingerprint: text("fingerprint"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), createdAt: createdAt(),
}, (t) => [index("device_user_idx").on(t.userId)]);

export const sessions = identity.table("session", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id), deviceId: uuid("device_id"),
  refreshHash: text("refresh_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: createdAt(),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const providers = identity.table("provider_profile", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  kycTier: integer("kyc_tier").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | active | paused
  ratingAvg: doublePrecision("rating_avg").notNull().default(0),
  jobsCompleted: integer("jobs_completed").notNull().default(0),
  acceptance: doublePrecision("acceptance").notNull().default(1),
  cancelRate: doublePrecision("cancel_rate").notNull().default(0),
  lat: doublePrecision("lat"), lng: doublePrecision("lng"),
  createdAt: createdAt(),
});

export const verifications = identity.table("verification", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id),
  tier: integer("tier").notNull(), status: text("status").notNull().default("submitted"), // submitted|auto_passed|in_review|approved|rejected
  reason: text("reason"), reviewerId: uuid("reviewer_id"), documents: jsonb("documents").notNull().default([]),
  createdAt: createdAt(), decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// ---------- catalogue ----------
export const categories = catalogue.table("category", {
  id: text("id").primaryKey(), parentId: text("parent_id"), nameI18n: jsonb("name_i18n").notNull(),
  requiredTier: integer("required_tier").notNull().default(1), mode: text("default_mode").notNull().default("catalogue"),
});

export const offers = catalogue.table("service_offer", {
  id: id(), providerId: uuid("provider_id").notNull(), categoryId: text("category_id").notNull().references(() => categories.id),
  titleI18n: jsonb("title_i18n").notNull(), descriptionI18n: jsonb("description_i18n"),
  lat: doublePrecision("lat").notNull(), lng: doublePrecision("lng").notNull(), radiusM: integer("radius_m").notNull().default(5000),
  pricingModel: text("pricing_model").notNull().default("fixed"), basePriceCentimes: integer("base_price_centimes").notNull().default(0),
  recurringAllowed: boolean("recurring_allowed").notNull().default(false), active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("offer_provider_idx").on(t.providerId), index("offer_category_idx").on(t.categoryId)]);

export const availability = catalogue.table("availability_rule", {
  id: id(), providerId: uuid("provider_id").notNull(), weekday: integer("weekday").notNull(), // 0-6
  startMin: integer("start_min").notNull(), endMin: integer("end_min").notNull(),
}, (t) => [index("avail_provider_idx").on(t.providerId)]);

// ---------- booking ----------
export const bookings = booking.table("booking", {
  id: id(), customerId: uuid("customer_id").notNull(), providerId: uuid("provider_id"), offerId: uuid("offer_id"),
  mode: text("mode").notNull().default("catalogue"), state: text("state").notNull().default("Requested"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }), lat: doublePrecision("lat").notNull(), lng: doublePrecision("lng").notNull(),
  addressNote: text("address_note"), durationMin: integer("duration_min").notNull().default(60), localDate: text("local_date"), startMin: integer("start_min"), totalCentimes: integer("total_centimes").notNull().default(0),
  feeCentimes: integer("fee_centimes").notNull().default(0), paymentMethod: text("payment_method").notNull().default("cash"),
  recurringId: uuid("recurring_id"), categoryId: text("category_id"), version: integer("version").notNull().default(0), // optimistic lock
  createdAt: createdAt(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("booking_customer_idx").on(t.customerId), index("booking_provider_idx").on(t.providerId), index("booking_state_idx").on(t.state)]);

export const bookingEvents = booking.table("booking_event", {
  id: id(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), type: text("type").notNull(),
  fromState: text("from_state"), toState: text("to_state").notNull(), actor: text("actor").notNull(), actorId: uuid("actor_id"),
  payload: jsonb("payload").notNull().default({}), createdAt: createdAt(),
}, (t) => [index("bevt_booking_idx").on(t.bookingId)]);

export const dispatchOffers = booking.table("dispatch_offer", {
  id: id(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), providerId: uuid("provider_id").notNull(),
  status: text("status").notNull().default("offered"), // offered|accepted|rejected|expired
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), round: integer("round").notNull().default(0), createdAt: createdAt(),
}, (t) => [index("doffer_booking_idx").on(t.bookingId)]);

export const reviews = booking.table("review", {
  id: id(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), authorId: uuid("author_id").notNull(),
  subjectId: uuid("subject_id").notNull(), rating: integer("rating").notNull(), comment: text("comment"), createdAt: createdAt(),
}, (t) => [uniqueIndex("review_once_uq").on(t.bookingId, t.authorId)]);

// ---------- money ----------
export const payments = money.table("payment", {
  id: id(), bookingId: uuid("booking_id").notNull(), method: text("method").notNull(), status: text("status").notNull().default("pending"),
  amountCentimes: integer("amount_centimes").notNull(), gatewayRef: text("gateway_ref"), idempotencyKey: text("idempotency_key").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("payment_idem_uq").on(t.idempotencyKey)]);

export const ledgerEntries = money.table("ledger_entry", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), txnId: uuid("txn_id").notNull(), kind: text("kind").notNull(),
  account: text("account").notNull(), ownerId: uuid("owner_id"), amountCentimes: integer("amount_centimes").notNull(), createdAt: createdAt(),
}, (t) => [index("ledger_txn_idx").on(t.txnId), index("ledger_acct_idx").on(t.account, t.ownerId)]);

export const payouts = money.table("payout", {
  id: id(), providerId: uuid("provider_id").notNull(), amountCentimes: integer("amount_centimes").notNull(),
  status: text("status").notNull().default("scheduled"), batchId: text("batch_id"), createdAt: createdAt(), paidAt: timestamp("paid_at", { withTimezone: true }),
});

// ---------- platform ----------
export const outbox = platform.table("outbox", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), eventId: uuid("event_id").notNull().defaultRandom(),
  type: text("type").notNull(), aggregateId: uuid("aggregate_id").notNull(), payload: jsonb("payload").notNull(),
  createdAt: createdAt(), publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [index("outbox_unpublished_idx").on(t.publishedAt)]);

export const auditLog = platform.table("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), actorId: uuid("actor_id"), action: text("action").notNull(),
  target: text("target"), reason: text("reason"), meta: jsonb("meta").notNull().default({}), createdAt: createdAt(),
});

export const staffUsers = platform.table("staff_user", {
  id: id(), email: text("email").notNull(), passwordHash: text("password_hash").notNull(),
  roles: jsonb("roles").notNull().default([]), active: boolean("active").notNull().default(true), createdAt: createdAt(),
}, (t) => [uniqueIndex("staff_email_uq").on(t.email)]);

export const kycDocuments = identity.table("kyc_document", {
  id: id(), verificationId: uuid("verification_id").notNull().references(() => verifications.id), userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(), mime: text("mime").notNull(), size: integer("size").notNull(),
  nonce: text("nonce").notNull(), ciphertext: customType<{ data: Buffer }>({ dataType: () => "bytea" })("ciphertext").notNull(), createdAt: createdAt(),
}, (t) => [index("kycdoc_verification_idx").on(t.verificationId)]);

export const disputes = booking.table("dispute", {
  id: id(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), openedBy: uuid("opened_by").notNull(), reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), outcome: text("outcome"), refundCentimes: integer("refund_centimes"), resolutionNote: text("resolution_note"), resolvedBy: uuid("resolved_by"),
  createdAt: createdAt(), resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [uniqueIndex("dispute_one_per_booking_uq").on(t.bookingId), index("dispute_status_idx").on(t.status)]);
