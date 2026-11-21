/**
 * reservationSummaryRows — the label/value rows the reservation panel's
 * summary shows for a flow (docs/BOOKING_WIDGET_REBUILD.md §4, W-07):
 * a stay's nights and rooms, a rental's days and cars, a departure's
 * people. A row appears only once its value is known; a count of one room
 * or one car is not repeated back.
 */

import { BOOKING_FLOWS, FLOW_CONFIG } from './bookingFlows.js';
import { computeStayLength } from './bookingRuleWindow.js';

const QUANTITY_ROW_KEY = Object.freeze({
  rooms: 'pages.listingDetail.reservation.summary.rooms',
  vehicles: 'pages.listingDetail.reservation.summary.vehicles',
});

/**
 * @param {object} input
 * @param {string} input.flow one of BOOKING_FLOWS
 * @param {{start: string|null, end: string|null}} input.dateRange
 * @param {number} input.quantity
 * @param {string|null} input.peopleLabel a departure's people label
 * @param {Function} t i18next `t`
 * @returns {Array<{key: string, label: string, value: number}>}
 */
export function buildReservationSummaryRows(
  { flow, dateRange, quantity, peopleLabel = null },
  t,
) {
  const config = FLOW_CONFIG[flow] ?? FLOW_CONFIG[BOOKING_FLOWS.GENERIC];
  const rows = [];
  if (config.duration && dateRange.start && dateRange.end) {
    const length = computeStayLength(
      config.duration,
      dateRange.start,
      dateRange.end,
    );
    if (length > 0) {
      rows.push({
        key: 'duration',
        label: t(`pages.listingDetail.reservation.summary.${config.duration}`),
        value: length,
      });
    }
  }
  const quantityKey = QUANTITY_ROW_KEY[config.quantity];
  if (quantityKey && quantity > 1) {
    rows.push({ key: 'quantity', label: t(quantityKey), value: quantity });
  }
  if (config.quantity === 'people' && peopleLabel && dateRange.start) {
    rows.push({ key: 'people', label: peopleLabel, value: quantity });
  }
  return rows;
}

export default buildReservationSummaryRows;
