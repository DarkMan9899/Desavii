-- Step L6.3A — a hotel room's meal / board basis. A `bookable_units` row is
-- a room TYPE, the thing a guest books, and different room types of one
-- hotel are commonly sold with different board (a breakfast-included
-- Deluxe, a room-only Standard), so the basis belongs on the room, never
-- as a hotel-wide claim. No existing column carries it: the listing-level
-- "Breakfast Included" amenity is a coarse hotel badge, not a per-room
-- contract.
--
-- A code-owned closed vocabulary (core/domain/roomAttributes.js
-- `MEAL_PLANS`: NO_MEALS, BREAKFAST_INCLUDED, BREAKFAST_AVAILABLE_EXTRA,
-- HALF_BOARD, FULL_BOARD, ALL_INCLUSIVE) stored as its code, the same
-- pattern migration 0040 used for `bathroom_type`/`view_type`/
-- `smoking_policy` — never localized text.
--
-- Nullable with no backfill: an existing room has no stated basis, and
-- guessing one (e.g. "no meals") would publish a false claim. Display only:
-- the booking charge stays the room's nightly price.
ALTER TABLE bookable_units
  ADD COLUMN meal_plan VARCHAR(30) NULL AFTER smoking_policy;
