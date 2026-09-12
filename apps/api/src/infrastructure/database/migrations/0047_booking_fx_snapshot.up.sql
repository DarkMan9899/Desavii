-- Pass 8 (Multi-Currency / CBA FX Pricing) — the booking-time FX display
-- snapshot (brief §23/§24/§30). `bookings.currency_id`/`subtotal_amount`/
-- `total_amount` (migration 0008) already ARE the canonical AMD amounts
-- (every price a Partner authors is AMD-only, per this pass's own money
-- rule) — nothing about those columns changes. This migration only adds
-- what's genuinely new: an optional record of what the CUSTOMER was shown
-- and charged in, at the moment of booking, and the exact FX context that
-- produced it.
--
-- All five columns are nullable: a booking created with no explicit
-- `displayCurrencyCode` (every booking created before this pass, and any
-- future booking whose customer never switched off AMD) simply has none
-- of this populated — it is priced and displayed in AMD only, never a
-- fabricated "AMD-to-AMD" FX record.
--
-- Immutability (brief §26): once written at booking creation, these five
-- columns are NEVER recomputed or updated by any later process — not a
-- CBA rate refresh, not a currency-switcher change on an already-created
-- booking. `BookingService` only ever writes them once, inside
-- `createBooking`.
--
-- `fx_amd_per_unit` mirrors `exchange_rates.rate_to_base`'s exact
-- DECIMAL(18,8) shape (`fxConversion.js#normalizeAmdPerUnit`'s output) —
-- the same normalized "AMD per 1 unit of display_currency_id" value,
-- snapshotted rather than referenced, so it survives even if the
-- `exchange_rates` row it came from is ever pruned. `1.00000000` when
-- `display_currency_id` is AMD itself (the identity conversion).

ALTER TABLE bookings
  ADD COLUMN display_currency_id BIGINT UNSIGNED NULL AFTER currency_id,
  ADD COLUMN fx_amd_per_unit DECIMAL(18,8) NULL AFTER display_currency_id,
  ADD COLUMN fx_effective_at DATETIME(3) NULL AFTER fx_amd_per_unit,
  ADD COLUMN display_subtotal_amount DECIMAL(12,2) NULL AFTER subtotal_amount,
  ADD COLUMN display_total_amount DECIMAL(12,2) NULL AFTER total_amount,
  ADD CONSTRAINT fk_bookings_display_currency_id FOREIGN KEY (display_currency_id) REFERENCES currencies (id);
