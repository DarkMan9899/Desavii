/**
 * Phase 17 §60/§61 date-semantics fix — resolves the actual calendar-day
 * range a stay/rental/departure consumes and gets priced for, given the
 * bookable unit's type.
 *
 * Every date-range write in this codebase (holds, bookings, manual
 * blocks, external reservations) previously treated `[dateFrom, dateTo]`
 * as inclusive on both ends everywhere, uniformly. That is correct for a
 * fixed-duration booking (a 3-day car rental, a tour running Mon-Wed) but
 * wrong for lodging: a guest who checks in 2026-08-10 and checks out
 * 2026-08-12 stays 2 nights (Aug 10, Aug 11) — checkout morning is not an
 * occupied night. Treating `dateTo` as inclusive there both over-consumes
 * capacity and over-charges by one full day/night on every accommodation
 * booking, a real, silent pricing bug, not merely a display quirk.
 *
 * `HOTEL_ROOM`/`PROPERTY_UNIT` (Sprint 9's `BOOKABLE_UNIT_TYPES`) are the
 * only two types this platform models as lodging — `RESTAURANT_TABLE`
 * (a single sitting), `TOUR_DEPARTURE` (a fixed-length itinerary or, per
 * Phase 17's additive `time_slot_start/end`, a single-day departure), and
 * `VEHICLE` (a rental billed by the calendar day, inclusive of the return
 * day) all keep the original inclusive-both-ends "duration" semantics —
 * this fix must NOT be applied to them (per the Phase 17 spec's explicit
 * instruction not to blindly generalize the accommodation fix).
 *
 * This is the single choke point every capacity-consuming write path
 * (`AvailabilityService#reserveCapacity`/`#restoreCapacityForRange`/
 * `#consumeCapacityForRange`) and the booking-pricing path
 * (`BookingService#resolveItem`) call through, so the fix applies
 * uniformly regardless of source (customer booking, partner manual
 * block, phone/OTA external reservation, or iCal sync) — never
 * re-implemented per call site.
 */

export const ACCOMMODATION_BOOKABLE_UNIT_TYPES = Object.freeze([
  'HOTEL_ROOM',
  'PROPERTY_UNIT',
]);

export function isAccommodationUnitType(bookableUnitTypeCode) {
  return ACCOMMODATION_BOOKABLE_UNIT_TYPES.includes(bookableUnitTypeCode);
}

function previousDay(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * @param {string} bookableUnitTypeCode
 * @param {string} dateFrom - 'YYYY-MM-DD', the request's check-in/start date
 * @param {string} dateTo - 'YYYY-MM-DD', the request's checkout/end date
 * @returns {{dateFrom: string, dateTo: string}} the range actually
 *   consumed/priced — unchanged for non-accommodation types, or for a
 *   same-day accommodation range (`dateFrom === dateTo`), which then covers
 *   that one day. Step L6.2E: a CUSTOMER lodging hold can never be same-day
 *   (`ZERO_NIGHT_STAY`, `AvailabilityService#reserveCapacity`), so this
 *   branch only serves Partner inventory writes — a manual block or an
 *   external reservation for a single night.
 */
export function resolveConsumedRange(bookableUnitTypeCode, dateFrom, dateTo) {
  if (isAccommodationUnitType(bookableUnitTypeCode) && dateFrom !== dateTo) {
    return { dateFrom, dateTo: previousDay(dateTo) };
  }
  return { dateFrom, dateTo };
}

export default {
  ACCOMMODATION_BOOKABLE_UNIT_TYPES,
  isAccommodationUnitType,
  resolveConsumedRange,
};
