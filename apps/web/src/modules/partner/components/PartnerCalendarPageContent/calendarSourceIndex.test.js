import { describe, test, expect } from 'vitest';
import {
  SOURCE_TYPES,
  buildDaySourceIndex,
  getDaySources,
} from './calendarSourceIndex.js';

const UNIT_ID = 42;
const OTHER_UNIT_ID = 99;

describe('calendarSourceIndex (Sprint D-2)', () => {
  test('expands a booking spanning several days into one event per date', () => {
    const index = buildDaySourceIndex(
      {
        bookings: [
          {
            id: 1,
            date_from: '2027-07-01',
            date_to: '2027-07-03',
            status: 'CONFIRMED',
            booking_reference: 'BK-1',
            customer_display_name: 'Alan Turing',
          },
        ],
      },
      UNIT_ID,
    );

    expect(getDaySources(index, '2027-07-01')).toHaveLength(1);
    expect(getDaySources(index, '2027-07-02')).toHaveLength(1);
    expect(getDaySources(index, '2027-07-03')).toHaveLength(1);
    expect(getDaySources(index, '2027-07-04')).toHaveLength(0);
    expect(getDaySources(index, '2027-07-01')[0]).toMatchObject({
      sourceType: SOURCE_TYPES.BOOKING,
      id: 1,
      customerDisplayName: 'Alan Turing',
    });
  });

  test('holds/blocks/external reservations are scoped to the given unitId, never leaking a sibling unit', () => {
    const index = buildDaySourceIndex(
      {
        holds: [
          {
            id: 10,
            bookable_unit_id: UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
          },
          {
            id: 11,
            bookable_unit_id: OTHER_UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
          },
        ],
        blocks: [
          {
            id: 20,
            bookable_unit_id: UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            reason_code: 'MAINTENANCE',
          },
          {
            id: 21,
            bookable_unit_id: OTHER_UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            reason_code: 'MAINTENANCE',
          },
        ],
        externalReservations: [
          {
            id: 30,
            bookable_unit_id: UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            source_code: 'AIRBNB',
          },
          {
            id: 31,
            bookable_unit_id: OTHER_UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            source_code: 'AIRBNB',
          },
        ],
      },
      UNIT_ID,
    );

    const sources = getDaySources(index, '2027-07-01').map((e) => e.sourceType);
    expect(sources.sort()).toEqual(
      [SOURCE_TYPES.HOLD, SOURCE_TYPES.BLOCK, SOURCE_TYPES.EXTERNAL].sort(),
    );
  });

  test('a released manual block and a cancelled external reservation are excluded', () => {
    const index = buildDaySourceIndex(
      {
        blocks: [
          {
            id: 20,
            bookable_unit_id: UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            released_at: '2027-06-15T00:00:00Z',
          },
        ],
        externalReservations: [
          {
            id: 30,
            bookable_unit_id: UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            cancelled_at: '2027-06-15T00:00:00Z',
          },
        ],
      },
      UNIT_ID,
    );

    expect(getDaySources(index, '2027-07-01')).toHaveLength(0);
  });

  test('a window clamps iteration so a booking outside the visible range never gets indexed there', () => {
    const index = buildDaySourceIndex(
      {
        bookings: [
          {
            id: 1,
            date_from: '2027-06-28',
            date_to: '2027-07-05',
            status: 'CONFIRMED',
          },
        ],
      },
      UNIT_ID,
      { from: '2027-07-01', to: '2027-07-02' },
    );

    expect(getDaySources(index, '2027-06-28')).toHaveLength(0);
    expect(getDaySources(index, '2027-07-01')).toHaveLength(1);
    expect(getDaySources(index, '2027-07-02')).toHaveLength(1);
    expect(getDaySources(index, '2027-07-05')).toHaveLength(0);
  });

  test('a date with multiple overlapping sources returns all of them', () => {
    const index = buildDaySourceIndex(
      {
        bookings: [
          {
            id: 1,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
            status: 'CONFIRMED',
          },
        ],
        holds: [
          {
            id: 10,
            bookable_unit_id: UNIT_ID,
            date_from: '2027-07-01',
            date_to: '2027-07-01',
          },
        ],
      },
      UNIT_ID,
    );

    expect(getDaySources(index, '2027-07-01')).toHaveLength(2);
  });

  test('getDaySources returns an empty array (never undefined) for a date with no events', () => {
    const index = buildDaySourceIndex({}, UNIT_ID);
    expect(getDaySources(index, '2027-07-01')).toEqual([]);
  });
});
