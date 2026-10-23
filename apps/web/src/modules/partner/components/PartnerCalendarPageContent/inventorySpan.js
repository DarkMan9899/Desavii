/**
 * What a block or external reservation's `date_from`–`date_to` actually
 * takes out of inventory, in the unit's own terms (Calendar Excellence).
 *
 * A hotel room or whole property is booked by the night, checkout
 * exclusive: 24–25 October is one night (the 24th), and the 25th stays
 * free. Every other unit type counts both ends: a tour departure blocked
 * 24–25 October is two days. Same rule as the backend's
 * `resolveConsumedRange`, through its frontend mirror.
 *
 * `MAX_DATE_SPAN_DAYS` mirrors the API's `validation/dateSpan.js`: a range
 * may end at most that many days after it starts.
 */

import {
  isAccommodationUnitType,
  resolveConsumedRange,
} from '../../../listings/utils/accommodationDateSemantics.js';

export const MAX_DATE_SPAN_DAYS = 366;

const MS_PER_DAY = 86_400_000;

function daysBetween(fromIso, toIso) {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) /
      MS_PER_DAY,
  );
}

/** `true` when `dateTo` falls more than `MAX_DATE_SPAN_DAYS` after `dateFrom`. */
export function exceedsMaxDateSpan(dateFrom, dateTo) {
  return daysBetween(dateFrom, dateTo) > MAX_DATE_SPAN_DAYS;
}

/**
 * @returns {{ unit: 'nights' | 'days', count: number }}
 */
export function describeInventorySpan(bookableUnitType, dateFrom, dateTo) {
  const consumed = resolveConsumedRange(bookableUnitType, dateFrom, dateTo);
  const count = daysBetween(consumed.dateFrom, consumed.dateTo) + 1;
  const isNightly =
    isAccommodationUnitType(bookableUnitType) && dateFrom !== dateTo;
  return { unit: isNightly ? 'nights' : 'days', count };
}

export default describeInventorySpan;
