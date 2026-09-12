-- Pass 6 (Restaurant vertical, owner issue #13) — a listing had no way to
-- represent when it's actually open. No existing table fits: the generic
-- Policy Engine (migration 0015) stores one flexible VARCHAR per (listing,
-- policy) — fine for a yes/no or a short enum, but a weekly schedule
-- needs a real open/close TIME pair per day, which a free-text policy
-- value can't safely round-trip (the frontend would have to re-parse
-- arbitrary text to answer "is it open right now", risking a wrong
-- open/closed claim — exactly what this pass's "never fabricate" rule
-- forbids). This is therefore a genuinely new, deliberately small table:
-- one row per (listing, day-of-week) that's actually been authored — a
-- day with no row means "hours not published for that day", never
-- silently "closed" or "open 24h".
--
-- `day_of_week` matches JS `Date#getDay()` (0=Sunday .. 6=Saturday) so the
-- frontend never needs a day-index translation table of its own.
-- `opens_at`/`closes_at` are plain TIME (wall-clock, no timezone —
-- consistent with every other time value in this schema, e.g.
-- `booking_items.start_time`). `closes_at <= opens_at` is a valid,
-- deliberately-supported overnight window (e.g. 18:00-02:00), not an
-- error — see `openingHoursStatus.js` on the frontend for how that's
-- interpreted.
--
-- Deliberately NOT restricted to RESTAURANT listings at the schema level
-- (a Hotel reception desk or an Attraction has hours too) — only this
-- pass's frontend wiring is Restaurant-only, per its own explicit scope.
-- Deliberately NOT a generic multi-vertical "scheduling framework": one
-- open/close window per day, no split shifts, no holiday exceptions, no
-- per-listing timezone — the smallest model that answers "what are this
-- listing's hours" honestly.

CREATE TABLE IF NOT EXISTS listing_opening_hours (
  listing_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  opens_at TIME NULL,
  closes_at TIME NULL,
  is_closed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (listing_id, day_of_week),
  CONSTRAINT fk_listing_opening_hours_listing_id FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_listing_opening_hours_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_listing_opening_hours_day_of_week CHECK (day_of_week BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
