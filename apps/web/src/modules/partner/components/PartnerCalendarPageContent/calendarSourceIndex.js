/**
 * Sprint D-2 (Partner Calendar source-aware UX) — a pure, framework-free
 * helper turning the FOUR existing raw row shapes the Calendar already
 * fetches (Desavii bookings, active holds, manual blocks, external
 * reservations — the domain's real source vocabulary, see
 * `inventory_ledger.source_type`) into one date-keyed index of normalized
 * events. Month/Week/Day all read from the SAME index rather than each
 * re-deriving its own per-source date matching — never a parallel
 * availability engine, purely a presentation-layer reshaping of data the
 * backend already returns.
 *
 * Day-granularity only (`date_from`/`date_to`, inclusive) — matches every
 * one of these four backend row shapes; no hour-level precision is
 * invented here for a date-only unit. A time-sliced unit's Week/Day
 * rendering (`TimeSlotBlock.jsx`) keeps using the per-day breakdown
 * counts directly, untouched by this module.
 */

import { addDays } from './calendarDateGrid.js';

export const SOURCE_TYPES = {
  BOOKING: 'BOOKING',
  HOLD: 'HOLD',
  BLOCK: 'BLOCK',
  EXTERNAL: 'EXTERNAL',
};

/** Inclusive `[from, to]` -> `["2027-07-01", "2027-07-02", ...]`, clamped to `windowFrom`/`windowTo` when given. */
function datesInRange(from, to, windowFrom, windowTo) {
  const start = windowFrom && windowFrom > from ? windowFrom : from;
  const end = windowTo && windowTo < to ? windowTo : to;
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function addEvent(index, date, event) {
  const existing = index.get(date);
  if (existing) {
    existing.push(event);
  } else {
    index.set(date, [event]);
  }
}

/**
 * @param {object} raw
 * @param {Array} raw.bookings - `GET /bookings?partnerId&unitId&from&to` summary rows.
 * @param {Array} raw.holds - `GET /availability/units/:id/holds` rows.
 * @param {Array} raw.blocks - `GET /availability/blocks?listingId=` rows, unfiltered by unit/released.
 * @param {Array} raw.externalReservations - `GET /availability/external-reservations?listingId=` rows, unfiltered by unit/cancelled.
 * @param {number} unitId - narrows blocks/externalReservations (listing-wide fetches) to this unit.
 * @param {{from?: string, to?: string}} [window] - clamps date iteration to the visible range.
 * @returns {Map<string, Array<object>>} date (ISO) -> array of normalized events, each `{ sourceType, id, dateFrom, dateTo, ...sourceFields }`.
 */
export function buildDaySourceIndex(
  { bookings = [], holds = [], blocks = [], externalReservations = [] },
  unitId,
  { from: windowFrom, to: windowTo } = {},
) {
  const index = new Map();

  bookings
    .filter((b) => b.date_from && b.date_to)
    .forEach((b) => {
      const event = {
        sourceType: SOURCE_TYPES.BOOKING,
        id: b.id,
        dateFrom: b.date_from,
        dateTo: b.date_to,
        status: b.status,
        bookingReference: b.booking_reference,
        customerDisplayName: b.customer_display_name ?? null,
      };
      datesInRange(b.date_from, b.date_to, windowFrom, windowTo).forEach(
        (date) => addEvent(index, date, event),
      );
    });

  holds
    .filter((h) => h.bookable_unit_id === unitId)
    .forEach((h) => {
      const event = {
        sourceType: SOURCE_TYPES.HOLD,
        id: h.id,
        dateFrom: h.date_from,
        dateTo: h.date_to,
        expiresAt: h.expires_at,
      };
      datesInRange(h.date_from, h.date_to, windowFrom, windowTo).forEach(
        (date) => addEvent(index, date, event),
      );
    });

  blocks
    .filter((bl) => bl.bookable_unit_id === unitId && !bl.released_at)
    .forEach((bl) => {
      const event = {
        sourceType: SOURCE_TYPES.BLOCK,
        id: bl.id,
        dateFrom: bl.date_from,
        dateTo: bl.date_to,
        quantity: bl.quantity,
        reasonCode: bl.reason_code,
        notes: bl.notes,
      };
      datesInRange(bl.date_from, bl.date_to, windowFrom, windowTo).forEach(
        (date) => addEvent(index, date, event),
      );
    });

  externalReservations
    .filter((ext) => ext.bookable_unit_id === unitId && !ext.cancelled_at)
    .forEach((ext) => {
      const event = {
        sourceType: SOURCE_TYPES.EXTERNAL,
        id: ext.id,
        dateFrom: ext.date_from,
        dateTo: ext.date_to,
        quantity: ext.quantity,
        sourceCode: ext.source_code,
        guestName: ext.guest_name,
        externalReference: ext.external_reference,
        connectionId: ext.connection_id,
      };
      datesInRange(ext.date_from, ext.date_to, windowFrom, windowTo).forEach(
        (date) => addEvent(index, date, event),
      );
    });

  return index;
}

export function getDaySources(index, date) {
  return index.get(date) ?? [];
}

export default { SOURCE_TYPES, buildDaySourceIndex, getDaySources };
