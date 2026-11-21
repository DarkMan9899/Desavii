import { describe, test, expect } from 'vitest';
import { buildReservationSummaryRows } from './reservationSummaryRows.js';
import { BOOKING_FLOWS } from './bookingFlows.js';
import { computeEstimatedTotal } from './reservationEstimate.js';

const t = (key) => key.split('.').pop();
const RANGE = { start: '2027-08-01', end: '2027-08-04' };

describe('buildReservationSummaryRows', () => {
  test('a stay counts nights, and rooms only when more than one', () => {
    expect(
      buildReservationSummaryRows(
        { flow: BOOKING_FLOWS.STAY, dateRange: RANGE, quantity: 1 },
        t,
      ),
    ).toEqual([{ key: 'duration', label: 'nights', value: 3 }]);
    expect(
      buildReservationSummaryRows(
        { flow: BOOKING_FLOWS.HOME, dateRange: RANGE, quantity: 2 },
        t,
      ),
    ).toEqual([
      { key: 'duration', label: 'nights', value: 3 },
      { key: 'quantity', label: 'rooms', value: 2 },
    ]);
  });

  test('a rental counts inclusive days and cars', () => {
    expect(
      buildReservationSummaryRows(
        { flow: BOOKING_FLOWS.VEHICLE, dateRange: RANGE, quantity: 2 },
        t,
      ),
    ).toEqual([
      { key: 'duration', label: 'days', value: 4 },
      { key: 'quantity', label: 'vehicles', value: 2 },
    ]);
  });

  test('a departure shows its people once a date is chosen', () => {
    const departure = {
      flow: BOOKING_FLOWS.DEPARTURE,
      quantity: 3,
      peopleLabel: 'Travelers',
    };
    expect(
      buildReservationSummaryRows(
        { ...departure, dateRange: { start: null, end: null } },
        t,
      ),
    ).toEqual([]);
    expect(
      buildReservationSummaryRows(
        {
          ...departure,
          dateRange: { start: '2027-08-01', end: '2027-08-01' },
        },
        t,
      ),
    ).toEqual([{ key: 'people', label: 'Travelers', value: 3 }]);
  });

  test('a same-day stay or no dates is no duration row', () => {
    expect(
      buildReservationSummaryRows(
        {
          flow: BOOKING_FLOWS.STAY,
          dateRange: { start: '2027-08-01', end: '2027-08-01' },
          quantity: 1,
        },
        t,
      ),
    ).toEqual([]);
  });

  test('a restaurant reservation has no rows of its own', () => {
    expect(
      buildReservationSummaryRows(
        { flow: BOOKING_FLOWS.RESTAURANT, dateRange: RANGE, quantity: 1 },
        t,
      ),
    ).toEqual([]);
  });
});

// §11: a car rental is billed by calendar days, both ends inclusive — the
// same table the API's `bookingFamilySemantics.test.js` proves server-side.
// Pickup/return times never change the count, so neither the summary nor
// the estimate can under- or over-state what the server charges.
describe('car rental days match the server rule', () => {
  const PRICE = '20000.00';
  const priceByDate = Object.fromEntries(
    ['2027-08-01', '2027-08-02', '2027-08-03', '2027-08-04'].map((date) => [
      date,
      { price_amount: PRICE, price_currency: 'AMD' },
    ]),
  );

  test.each([
    ['same day, 10:00 → 18:00', '2027-08-01', '2027-08-01', 1],
    ['two dates under 24 hours, 22:00 → 09:00', '2027-08-01', '2027-08-02', 2],
    ['around midnight, 23:30 → 00:30', '2027-08-01', '2027-08-02', 2],
    ['exactly 24 hours, 10:00 → 10:00', '2027-08-01', '2027-08-02', 2],
    ['24 hours and 1 minute', '2027-08-01', '2027-08-02', 2],
    ['25 hours', '2027-08-01', '2027-08-02', 2],
    ['three full days, Mon 10:00 → Thu 10:00', '2027-08-01', '2027-08-04', 4],
  ])('%s → %i rental days', (_label, start, end, days) => {
    const rows = buildReservationSummaryRows(
      {
        flow: BOOKING_FLOWS.VEHICLE,
        dateRange: { start, end },
        quantity: 1,
      },
      (key) => key,
    );
    expect(rows[0].value).toBe(days);
    expect(
      computeEstimatedTotal({ start, end }, priceByDate, 1, 'VEHICLE'),
    ).toEqual({ amount: days * 20000, currency: 'AMD' });
  });
});
