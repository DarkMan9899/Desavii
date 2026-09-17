-- `idx_listings_status_id_expires_at` (status_id, expires_at) is, at this
-- point, the only index whose leftmost column is `status_id` — adding it in
-- the up migration made MySQL retarget `fk_listings_status_id` onto it,
-- silently superseding whatever implicit single-column index InnoDB
-- auto-created for that FK back in migration 0005 (which declared the FK
-- with no explicit supporting index of its own). Dropping
-- `idx_listings_status_id_expires_at` directly therefore fails with
-- ER_DROP_INDEX_FK ("needed in a foreign key constraint"). Restoring a
-- plain single-column index on `status_id` first (in the same statement)
-- gives the FK continuous coverage, so the composite index can then be
-- dropped safely — leaving the table in a state functionally identical to
-- pre-migration (the FK is still supported by an index), just with that
-- support now explicit instead of implicit.
ALTER TABLE listings
  ADD INDEX idx_listings_status_id (status_id),
  DROP INDEX idx_listings_frozen_at_purge_after,
  DROP INDEX idx_listings_status_id_expires_at,
  DROP COLUMN renewed_at,
  DROP COLUMN purge_after,
  DROP COLUMN frozen_at,
  DROP COLUMN expiry_reminder_sent_at,
  DROP COLUMN expires_at,
  DROP COLUMN publication_period_days;
