/**
 * Launch-blocker remediation (P0-C) — bookable unit types whose
 * `capacity`/`availability_calendar.quantity_available` means "how many
 * interchangeable units of inventory exist" (compared against a fixed
 * `SEARCH_REQUESTED_QUANTITY`, never against the requested guest count),
 * as opposed to a per-unit occupancy ceiling (compared directly against
 * guests — see `mysqlSearchRepository.js`'s availability EXISTS block).
 *
 * HOTEL_ROOM/PROPERTY_UNIT: room-type inventory count.
 * VEHICLE: fleet inventory — under the current data model, one row per
 *   VIN — never a passenger-seat count (no such field exists; inventing
 *   one is out of scope here). Comparing it against `guests` was the
 *   P0-C bug: a single available vehicle was wrongly excluded from any
 *   `guests >= 2` search.
 * RESTAURANT_TABLE (Step L6.2H2B): concurrent reservations — one booking
 *   item takes exactly one, whatever the party size, so a party of any
 *   size needs just one free slot. There is no covers/table-size model to
 *   compare a party against.
 * TOUR_DEPARTURE is deliberately NOT here — its `capacity` is a genuine
 *   seat/occupancy ceiling, compared directly against guests.
 *
 * Deliberately a separate list from `accommodationDateSemantics.js`'s
 * `ACCOMMODATION_BOOKABLE_UNIT_TYPES` — that one governs checkout-
 * exclusive vs. inclusive DATE semantics, which stay unchanged for
 * VEHICLE (inclusive-both-ends), so VEHICLE must never be added there.
 */

import { ACCOMMODATION_BOOKABLE_UNIT_TYPES } from './accommodationDateSemantics.js';

export const INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES = Object.freeze([
  ...ACCOMMODATION_BOOKABLE_UNIT_TYPES,
  'VEHICLE',
  'RESTAURANT_TABLE',
]);

export default { INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES };
