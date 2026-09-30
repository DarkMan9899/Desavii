-- Step L6.2H2B — a restaurant reservation's party size. Until now the
-- customer's `guestCount` was validated at booking time and then discarded:
-- no existing column carried "how many people this booking item is for"
-- (`quantity` is inventory consumed, `booking_guests` are named people).
--
-- Nullable with no backfill: every booking created before this step, and
-- every non-restaurant item today, stays NULL — never 0, which would claim
-- a party of nobody. SMALLINT UNSIGNED (max 65535) is storage-overflow
-- protection only; there is no product maximum party size.
ALTER TABLE booking_items
  ADD COLUMN guest_count SMALLINT UNSIGNED NULL AFTER quantity;
