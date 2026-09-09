-- Sprint E (TOP/Featured Listings + Promotion Engine) — the ONLY schema
-- change this sprint needs. Migration 0010 (Sprint 5, "Featured Listings
-- and Advertising Foundation") already laid down the full lifecycle
-- entity this sprint builds on top of: `advertisements` (real
-- start_date/end_date/status/priority/payment/audit columns, never a
-- bare `is_top` boolean), `ad_placement_types` (HOMEPAGE_SECTION maps to
-- this sprint's "Home" placement, CATEGORY_TOP to "Category"),
-- `ad_products` (a real 7/30/90-day + custom pricing catalog, already
-- seeded per placement — reused as-is, payment-ready). That foundation's
-- own header comment predicted exactly this: "actually rotating/
-- assigning which concurrent slot an active ad occupies is feature-API
-- behavior for the sprint that builds the homepage rendering logic, not
-- foundation schema" — this sprint is that sprint.
--
-- The one genuinely missing piece is notification-reminder dedup state
-- (spec §15: "each reminder should be sent only once per promotion
-- lifecycle/expiry target... If the promotion is extended, notification
-- scheduling/dedup semantics must follow the new end date correctly").
-- Two nullable DATETIME(3) columns, reset to NULL whenever `end_date` is
-- extended (`AdvertisementService#extend`) so the new end date's own
-- 7-day/2-day thresholds can fire again — mirrors this codebase's
-- existing "persisted dedup state, not re-derived from notification
-- history" idiom (see `inventory_connections.last_error`'s same-message
-- dedup check in `inventoryConnectionService.js`).

ALTER TABLE advertisements
  ADD COLUMN reminder_7d_sent_at DATETIME(3) NULL AFTER payment_marked_paid_at,
  ADD COLUMN reminder_2d_sent_at DATETIME(3) NULL AFTER reminder_7d_sent_at;
