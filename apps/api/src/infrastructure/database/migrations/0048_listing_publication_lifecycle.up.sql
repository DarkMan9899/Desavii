-- Listing Lifetime / Renewal, Step B2 (schema/domain foundation only — see
-- the Step B1 audit for the full design). Six new, all-nullable columns on
-- `listings`, mirroring the exact precedent `archived_at` (migration 0016)
-- and `advertisements.reminder_7d_sent_at`/`reminder_2d_sent_at` (migration
-- 0041) already established for this codebase's "additive lifecycle
-- timestamp" convention.
--
-- Per the B1 audit's own locked decision: this is a SEPARATE lifecycle
-- dimension, not a new `listing_statuses` code and not a change to
-- `moderation_status_id` — a future automatic expiry is represented as
-- `status_id = UNPUBLISHED` (the existing status) plus `frozen_at IS NOT
-- NULL` (this migration's new column), distinguishing it from a manual
-- unpublish (`frozen_at IS NULL`). Nothing here changes `listingStatusTransitions.js`
-- — the existing UNPUBLISHED -> PUBLISHED edge already covers the future
-- Renew transition.
--
-- Every column defaults to NULL and this migration performs no backfill —
-- every existing listing keeps `expires_at`/`frozen_at`/`purge_after` = NULL
-- after this runs, which is the correct "no lifecycle expiration assigned
-- yet" state until Step B3 introduces publication-period authoring. No
-- public API reads or exposes any of these columns yet (Step B4+).
--
--   publication_period_days — the selected publication duration in days,
--     e.g. 30/90/180/365. Deliberately unconstrained here (no CHECK, no
--     enum) — Step B3 owns the actual allowed-values product decision;
--     this column only needs to store whatever it's given.
--   expires_at               — the exact instant the current publication
--     period ends. Computed from `published_at`/`renewed_at` +
--     `publication_period_days` once Step B3/B4 exist; NULL means no
--     expiration has been assigned (every pre-existing listing, and any
--     listing created before Step B3 ships).
--   expiry_reminder_sent_at  — dedup guard for the T-2-day reminder sweep,
--     same "persisted dedup state, not re-derived" idiom as
--     `advertisements.reminder_2d_sent_at`. Reset to NULL on renewal so the
--     new `expires_at`'s own threshold can fire again (Step B6).
--   frozen_at                — set by the future expiry sweep the instant a
--     PUBLISHED listing's `expires_at` passes without renewal (Step B4).
--     `frozen_at IS NOT NULL` is the canonical "expired, not merely manually
--     unpublished" signal (`core/domain/listingLifecycle.js#isFrozen`).
--   purge_after               — computed at freeze time as `frozen_at` + the
--     product's 6-month retention window; drives the future retention-purge
--     sweep (Step B7). Never a literal hard DELETE — see the B1 audit's
--     deletion-safety finding (extensive FK/history dependencies make a
--     true hard delete unsafe); B7's "purge" is expected to reuse this
--     table's own existing `deleted_at` soft-delete convention.
--   renewed_at                — the most recent successful renewal, for
--     audit/display only; not read by any lifecycle predicate itself.

ALTER TABLE listings
  ADD COLUMN publication_period_days SMALLINT UNSIGNED NULL AFTER archived_at,
  ADD COLUMN expires_at DATETIME(3) NULL AFTER publication_period_days,
  ADD COLUMN expiry_reminder_sent_at DATETIME(3) NULL AFTER expires_at,
  ADD COLUMN frozen_at DATETIME(3) NULL AFTER expiry_reminder_sent_at,
  ADD COLUMN purge_after DATETIME(3) NULL AFTER frozen_at,
  ADD COLUMN renewed_at DATETIME(3) NULL AFTER purge_after,
  -- Serves two future sweep query shapes at once (Step B4/B6): "published
  -- listings whose expires_at is within the next N days" and "published
  -- listings already past expires_at" — both a range scan within the
  -- PUBLISHED partition of this index. `status_id` leads because every
  -- real future query on it scopes to PUBLISHED first, mirroring the
  -- existing `idx_listings_partner_id_status_id_created_at` composite's
  -- own coarse-filter-then-range-column shape.
  ADD INDEX idx_listings_status_id_expires_at (status_id, expires_at),
  -- Serves the future retention-purge sweep (Step B7): "frozen listings
  -- whose retention window has elapsed" — `frozen_at IS NOT NULL AND
  -- purge_after <= NOW()`. `frozen_at` leads so the index naturally skips
  -- every listing that was never frozen (the overwhelming majority of rows).
  ADD INDEX idx_listings_frozen_at_purge_after (frozen_at, purge_after);
