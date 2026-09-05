/**
 * Phase 7 (Booking Flow): unit coverage for the two additive DTO
 * mappings — `toPublicBookableUnitResponse` (the trimmed public unit
 * shape) and `toCalendarDayResponse`'s new `price_amount`/`price_currency`
 * fields. Pure mapping functions, no database needed, mirroring
 * `tests/unit/modules/listings/listingDto.test.js`'s convention.
 */

import { describe, test, expect } from '@jest/globals';
import {
  toPublicBookableUnitResponse,
  toCalendarDayResponse,
  toPublicAvailabilitySummaryResponse,
} from '../../../../src/modules/availability/dto/availabilityDto.js';

describe('toPublicBookableUnitResponse', () => {
  test('exposes id/bookable_unit_type/capacity/time-slot fields — never listing_id or timestamps', () => {
    const response = toPublicBookableUnitResponse({
      id: 7,
      listingId: 42,
      bookableUnitTypeCode: 'HOTEL_ROOM',
      capacity: 2,
      timeSlotStart: null,
      timeSlotEnd: null,
      unitLabel: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });

    expect(response).toEqual({
      id: 7,
      bookable_unit_type: 'HOTEL_ROOM',
      capacity: 2,
      time_slot_start: null,
      time_slot_end: null,
      unit_label: null,
      // Sprint C-2: structured room fields are unconditionally present
      // (generic on every unit type), honestly null when this bare
      // fixture never set them.
      room_size_sqm: null,
      bathroom_type: null,
      view_type: null,
      smoking_policy: null,
    });
  });

  test('includes the time-slot label for a time-slot unit (e.g. an Activity departure)', () => {
    const response = toPublicBookableUnitResponse({
      id: 8,
      listingId: 42,
      bookableUnitTypeCode: 'TOUR_DEPARTURE',
      capacity: 6,
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      unitLabel: 'Morning departure',
    });

    expect(response).toMatchObject({
      time_slot_start: '09:00',
      time_slot_end: '11:00',
      unit_label: 'Morning departure',
    });
  });

  // Sprint A (Time-Aware Booking Foundation): the `?date=`-augmented shape
  // `availabilityService.js#getPublicUnits` returns is additive-only —
  // absent entirely (not present-but-null) when no date was requested,
  // matching every other additive field convention in this codebase
  // (e.g. `bookingRepository.js`'s `customerFirstName`).
  test('omits the per-date availability/price fields entirely when no date was requested', () => {
    const response = toPublicBookableUnitResponse({
      id: 9,
      bookableUnitTypeCode: 'TOUR_DEPARTURE',
      capacity: 8,
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      unitLabel: 'Morning departure',
    });

    expect(response).not.toHaveProperty('availability_status_for_date');
    expect(response).not.toHaveProperty('remaining_count_for_date');
    expect(response).not.toHaveProperty('price_amount_for_date');
    expect(response).not.toHaveProperty('price_currency_for_date');
  });

  test('includes a bucketed per-date availability status and price when the service resolved one for a specific date', () => {
    const response = toPublicBookableUnitResponse({
      id: 9,
      bookableUnitTypeCode: 'TOUR_DEPARTURE',
      capacity: 8,
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      unitLabel: 'Morning departure',
      remainingForDate: 3,
      priceForDateAmount: '9500.00',
      priceForDateCurrencyCode: 'AMD',
    });

    expect(response.availability_status_for_date).toBe('LOW');
    expect(response.remaining_count_for_date).toBe(3);
    expect(response.price_amount_for_date).toBe('9500.00');
    expect(response.price_currency_for_date).toBe('AMD');
  });

  test('never leaks the raw remaining count once comfortably above the low-stock threshold, same as the range-level summary', () => {
    const response = toPublicBookableUnitResponse({
      id: 9,
      bookableUnitTypeCode: 'TOUR_DEPARTURE',
      capacity: 8,
      remainingForDate: 8,
      priceForDateAmount: '9500.00',
      priceForDateCurrencyCode: 'AMD',
    });

    expect(response.availability_status_for_date).toBe('AVAILABLE');
    expect(response.remaining_count_for_date).toBeNull();
  });

  test('a sold-out date (zero remaining) is reported honestly, not hidden', () => {
    const response = toPublicBookableUnitResponse({
      id: 9,
      bookableUnitTypeCode: 'TOUR_DEPARTURE',
      capacity: 8,
      remainingForDate: 0,
      priceForDateAmount: null,
      priceForDateCurrencyCode: null,
    });

    expect(response.availability_status_for_date).toBe('SOLD_OUT');
    expect(response.remaining_count_for_date).toBe(0);
  });
});

describe('toCalendarDayResponse', () => {
  test('includes price_amount/price_currency when the day resolved a price', () => {
    const response = toCalendarDayResponse({
      date: '2026-07-13',
      status: 'AVAILABLE',
      priceAmount: '42000.00',
      priceCurrencyCode: 'AMD',
    });

    expect(response).toEqual({
      date: '2026-07-13',
      status: 'AVAILABLE',
      price_amount: '42000.00',
      price_currency: 'AMD',
    });
  });

  test('price_amount/price_currency are null when the day has no price override', () => {
    const response = toCalendarDayResponse({
      date: '2026-07-09',
      status: 'AVAILABLE',
    });

    expect(response).toEqual({
      date: '2026-07-09',
      status: 'AVAILABLE',
      price_amount: null,
      price_currency: null,
    });
  });
});

describe('toPublicAvailabilitySummaryResponse', () => {
  test('remaining above the low-stock threshold buckets to AVAILABLE with no exact count', () => {
    const response = toPublicAvailabilitySummaryResponse({
      unitId: 5,
      bookableUnitTypeCode: 'HOTEL_ROOM',
      remaining: 12,
    });
    expect(response).toEqual({
      unit_id: 5,
      bookable_unit_type: 'HOTEL_ROOM',
      availability_status: 'AVAILABLE',
      remaining_count: null,
    });
  });

  test('remaining at the low-stock threshold buckets to LOW and includes the exact count', () => {
    const response = toPublicAvailabilitySummaryResponse({
      unitId: 5,
      bookableUnitTypeCode: 'TOUR_DEPARTURE',
      remaining: 5,
    });
    expect(response).toEqual({
      unit_id: 5,
      bookable_unit_type: 'TOUR_DEPARTURE',
      availability_status: 'LOW',
      remaining_count: 5,
    });
  });

  test('remaining below the low-stock threshold buckets to LOW and includes the exact count', () => {
    const response = toPublicAvailabilitySummaryResponse({
      unitId: 5,
      bookableUnitTypeCode: 'HOTEL_ROOM',
      remaining: 2,
    });
    expect(response).toEqual({
      unit_id: 5,
      bookable_unit_type: 'HOTEL_ROOM',
      availability_status: 'LOW',
      remaining_count: 2,
    });
  });

  test('zero remaining buckets to SOLD_OUT', () => {
    const response = toPublicAvailabilitySummaryResponse({
      unitId: 5,
      bookableUnitTypeCode: 'HOTEL_ROOM',
      remaining: 0,
    });
    expect(response).toEqual({
      unit_id: 5,
      bookable_unit_type: 'HOTEL_ROOM',
      availability_status: 'SOLD_OUT',
      remaining_count: 0,
    });
  });
});
