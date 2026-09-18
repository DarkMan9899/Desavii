-- Engagement Analytics, Step A1 (schema/domain foundation only — see the
-- A0/A0.1 architecture audits for the full design). Creates the raw event
-- log plus its three daily rollup tables for DESAVII's first-party
-- visitor/engagement analytics.
--
-- This is a DIFFERENT domain from the existing `apps/api/src/modules/
-- analytics/` module (still an untouched scaffold): that module is reserved
-- for booking/revenue business intelligence (revenue, occupancy, ADR/
-- RevPAR, cancellation-rate — reading existing Booking/Payment/Availability
-- tables, owning none of its own, per BACKEND_ARCHITECTURE.md §29). This
-- migration's four tables belong to the new `engagementAnalytics` module
-- instead (visitor impressions/views/clicks/favorites/contact/booking-
-- funnel/search/promotion events) — the two must never be merged.
--
-- Step A1 performs NO runtime collection. No ingestion endpoint, no
-- frontend tracker, no server event hooks, no aggregation job, and no
-- retention-purge job exist yet (A2-A4). This migration only creates the
-- tables those future steps will write to.
--
-- `analytics_events` — the append-only raw event log (source of truth for
-- reprocessing/debugging, and the only place an exact <=90-day unique-
-- visitor count can be computed from). Deliberately mirrors this
-- codebase's existing `audit_logs`/`activity_logs` shape (migration 0011)
-- for an insert-only log table: a surrogate `id` PK, no `updated_at`/soft-
-- delete columns (a raw event is never edited, only hard-deleted by the
-- future 90-day retention purge — A0.1's locked policy). Columns:
--   event_id      — producer-generated UUID (the client generates it for a
--                    CLIENT OBSERVATION event; the server generates it for
--                    a SERVER-AUTHORITATIVE event such as favorite_added/
--                    booking_started) — always present, `UNIQUE`, the
--                    idempotency key against sendBeacon/fetch/batch retries.
--   dedup_key      — nullable, server-computed-only SHA-256 digest for
--                    events with a "once per session per target" semantic
--                    dedup rule (A0.1 §7/§21 locked the exact hash inputs
--                    per event type, e.g. listing_impression =
--                    SHA256(event_name+session_id+listing_id+placement));
--                    `UNIQUE`, and MySQL permits any number of NULL rows
--                    under a UNIQUE index (only non-NULL values collide),
--                    so events with no semantic-dedup rule simply leave it
--                    NULL. Actual hashing is an A2 concern — this migration
--                    only reserves the column/index.
--   occurred_at    — the canonical event instant. Always written as the
--                    server's own `UTC_TIMESTAMP(3)` at ingestion time,
--                    never a client-supplied timestamp (A0.1 §15, applying
--                    the Listing Lifecycle module's own hard-won B6.5
--                    lesson pre-emptively instead of repeating it).
--   anonymous_visitor_id / session_id — both nullable: every CLIENT
--                    OBSERVATION event carries them (enforced by A2's
--                    validation layer, not this schema), but a SERVER-
--                    AUTHORITATIVE event must never be forced to invent a
--                    fake browser identity just to satisfy a NOT NULL
--                    constraint.
--   user_id        — nullable, internal-only; never present on any future
--                    Partner-facing aggregate response.
--   listing_id / partner_id / promotion_id / booking_id — plain,
--                    unconstrained references (see "no foreign keys" below).
--                    `partner_id` is always resolved SERVER-SIDE from the
--                    real owning listing/promotion at write time in A2 —
--                    a client-supplied value is never trusted for
--                    tenant-scoping/authorization purposes, only the
--                    server's own lookup is.
--   placement / position / category_code / query_text / result_count /
--   locale / device_class / traffic_source / contact_method — explicit,
--                    individually-capped typed columns. Deliberately NO
--                    metadata/properties/context JSON column: a new field
--                    is always a deliberate schema decision, never a
--                    JSON escape hatch (A0 §18, A0.1 §18).
--
-- No foreign keys anywhere in this migration, on any of the four tables —
-- a deliberate, explicit departure from this codebase's otherwise
-- near-universal FK convention (see e.g. `favorites`/`advertisements`
-- above). `listing_id`/`partner_id`/`promotion_id`/`booking_id`/`user_id`
-- are historical/denormalized analytics references, exactly like
-- `advertisements.partner_id`'s own existing denormalization precedent
-- (migration 0010) — an analytics table must never be able to block a
-- listing's lifecycle transition, soft-deletion, or any future business-
-- row cleanup (A0 §21, A0.1 §18's explicit "NO FKs" lock).
--
-- `device_class` is a bounded VARCHAR, not a SQL ENUM: audited the full
-- migration history first (per A1's own explicit instruction) — only one
-- column in all 48 prior migrations uses SQL ENUM
-- (`search_filter_metadata.value_source`), a narrow internal-config
-- exception, not the repository's real convention. The closed set
-- (desktop/mobile/tablet/other) is enforced at the domain/validation layer
-- in A2, matching how `locale`/`placement`/`contact_method` are handled
-- here too.
--
-- Business-day semantics: `analytics_events.occurred_at` stays UTC-instant
-- forever (never reinterpreted), but the three daily rollup tables' `day`
-- column represents the Asia/Yerevan (UTC+4, no DST) business date, not a
-- UTC calendar date (A0.1 §16's locked correction over A0's original UTC-
-- day proposal) — the future daily aggregation job (A4) is responsible for
-- computing each Yerevan day's UTC instant boundaries and aggregating
-- `analytics_events` rows within them; this migration performs no such
-- computation and makes no MySQL-local-timezone assumption anywhere.
--
-- `listing_analytics_daily` / `company_analytics_daily` /
-- `promotion_analytics_daily` all use a genuine composite PRIMARY KEY
-- (never a surrogate `id`), matching this codebase's own established
-- pure-junction/upsert-table convention (`role_user`, `permission_role`,
-- `listing_category_listing`, `listing_attribute_values`, migrations
-- 0002/0005/0014) rather than the surrogate-id-plus-UNIQUE pattern used
-- for tables with their own independent row identity (e.g. `favorites`,
-- migration 0009) — each row's natural identity truly is its key tuple,
-- upserted by the future idempotent aggregation job, never addressed by a
-- separate id. Counter columns are `BIGINT UNSIGNED`, matching the exact
-- type `advertisements.impression_count`/`click_count` already established
-- (migration 0010) for this same impression/click-counting concept, just
-- at daily rather than lifetime granularity — this migration does not
-- read, write, or duplicate that existing lifetime counter. No CTR/
-- conversion ratio is ever stored — always computed at read time from the
-- stored numerator/denominator counts (A0.1 §19). No visitor identifier of
-- any kind is stored on any daily table. Each carries an `updated_at`
-- (auto-touched on every future upsert) for aggregation-job observability
-- — the one column added beyond A0.1's literal list, justified by this
-- being a universal convention on every other mutable/upserted table in
-- this schema.
--
-- Retention (policy only — no purge worker exists yet, A4): raw events,
-- 90 days, hard-deleted (no FK dependents, no compliance-record status
-- analogous to `audit_logs` — an event has no renewal/restore concept,
-- unlike this codebase's usual soft-delete convention for business
-- records). Daily aggregates, 24 months.

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id CHAR(36) NOT NULL,
  dedup_key BINARY(32) NULL,
  event_name VARCHAR(40) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  anonymous_visitor_id CHAR(36) NULL,
  session_id CHAR(36) NULL,
  user_id BIGINT UNSIGNED NULL,
  listing_id BIGINT UNSIGNED NULL,
  partner_id BIGINT UNSIGNED NULL,
  promotion_id BIGINT UNSIGNED NULL,
  booking_id BIGINT UNSIGNED NULL,
  placement VARCHAR(30) NULL,
  position SMALLINT UNSIGNED NULL,
  category_code VARCHAR(60) NULL,
  query_text VARCHAR(180) NULL,
  result_count SMALLINT UNSIGNED NULL,
  locale CHAR(2) NULL,
  device_class VARCHAR(10) NULL,
  traffic_source VARCHAR(20) NULL,
  contact_method VARCHAR(20) NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_analytics_events_event_id UNIQUE (event_id),
  CONSTRAINT uq_analytics_events_dedup_key UNIQUE (dedup_key),
  KEY idx_analytics_events_event_name_occurred_at (event_name, occurred_at),
  KEY idx_analytics_events_partner_id_event_name_occurred_at (partner_id, event_name, occurred_at),
  KEY idx_analytics_events_listing_id_event_name_occurred_at (listing_id, event_name, occurred_at),
  KEY idx_analytics_events_promotion_id_event_name_occurred_at (promotion_id, event_name, occurred_at),
  KEY idx_analytics_events_anonymous_visitor_id_occurred_at (anonymous_visitor_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS listing_analytics_daily (
  listing_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL COMMENT 'Asia/Yerevan business date, not UTC calendar date',
  partner_id BIGINT UNSIGNED NOT NULL,
  impressions_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  views_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  daily_unique_visitors BIGINT UNSIGNED NOT NULL DEFAULT 0,
  favorite_adds_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  favorite_removes_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  contact_clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  booking_starts_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  booking_requests_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  booking_confirmations_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  search_impressions_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  search_clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  promotion_impressions_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  promotion_clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (listing_id, day),
  KEY idx_listing_analytics_daily_partner_id_day (partner_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_analytics_daily (
  partner_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL COMMENT 'Asia/Yerevan business date, not UTC calendar date',
  profile_views_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  daily_unique_visitors BIGINT UNSIGNED NOT NULL DEFAULT 0,
  listing_clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (partner_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotion_analytics_daily (
  promotion_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL COMMENT 'Asia/Yerevan business date, not UTC calendar date',
  partner_id BIGINT UNSIGNED NOT NULL,
  impressions_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (promotion_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
