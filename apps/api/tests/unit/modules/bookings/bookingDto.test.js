/**
 * Phase 8 (Auth / User Dashboard): unit coverage for
 * `toBookingSummaryResponse`'s additive `date_from`/`date_to` fields
 * (earliest/latest booking-item dates, resolved via a repository-level
 * LEFT JOIN). Pure mapping function, no database needed, mirroring
 * `tests/unit/modules/availability/availabilityDto.test.js`'s convention.
 */

import { describe, test, expect } from '@jest/globals';
import {
  toBookingResponse,
  toBookingSummaryResponse,
} from '../../../../src/modules/bookings/dto/bookingDto.js';

describe('toBookingResponse', () => {
  test('includes partner_owner_user_id when bookingService resolved one', () => {
    const response = toBookingResponse({
      id: 1,
      bookingReference: 'BK-20260101-ABCDEF23',
      customerUserId: 2,
      partnerId: 5,
      partnerOwnerUserId: 7,
      listingId: 5,
      bookingTypeCode: 'PROPERTY_UNIT',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '85000.00',
    });

    expect(response.partner_owner_user_id).toBe(7);
  });

  test('partner_owner_user_id is null when the partner has no resolvable owner', () => {
    const response = toBookingResponse({
      id: 1,
      bookingReference: 'BK-20260101-ABCDEF23',
      customerUserId: 2,
      partnerId: 5,
      listingId: 5,
      bookingTypeCode: 'PROPERTY_UNIT',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '85000.00',
    });

    expect(response.partner_owner_user_id).toBeNull();
  });

  // P2.2C preflight: `toBookingItemResponse`'s `unit_label`/
  // `bookable_unit_type` fields (P2.2B) had zero unit-level coverage —
  // only proven indirectly through integration tests. Covering the pure
  // mapping directly here, mirroring the two cases the frontend
  // (Partner/Admin detail pages) actually branches on: present vs. null.
  test('items carry unit_label/bookable_unit_type when the repository resolved a bookable unit', () => {
    const response = toBookingResponse({
      id: 1,
      bookingReference: 'BK-20260101-ABCDEF23',
      customerUserId: 2,
      partnerId: 5,
      listingId: 5,
      bookingTypeCode: 'HOTEL_ROOM',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '85000.00',
      items: [
        {
          id: 10,
          bookableUnitId: 3,
          unitLabel: 'Deluxe Suite',
          bookableUnitTypeCode: 'HOTEL_ROOM',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-03',
          quantity: 1,
          unitPriceAmount: '85000.00',
        },
      ],
    });

    expect(response.items[0].unit_label).toBe('Deluxe Suite');
    expect(response.items[0].bookable_unit_type).toBe('HOTEL_ROOM');
  });

  test('items expose null unit_label/bookable_unit_type for a non-accommodation booking (no bookable unit)', () => {
    const response = toBookingResponse({
      id: 2,
      bookingReference: 'BK-20260101-TOURXYZ1',
      customerUserId: 2,
      partnerId: 5,
      listingId: 6,
      bookingTypeCode: 'TOUR',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '30000.00',
      items: [
        {
          id: 11,
          bookableUnitId: null,
          dateFrom: '2026-08-01',
          dateTo: '2026-08-01',
          quantity: 2,
          unitPriceAmount: '15000.00',
        },
      ],
    });

    expect(response.items[0].unit_label).toBeNull();
    expect(response.items[0].bookable_unit_type).toBeNull();
  });

  // Sprint A (Time-Aware Booking Foundation): `start_time`/`end_time` are
  // additive, snapshotted-at-booking-time fields (mirrors `unit_label`'s
  // own pure-mapping coverage immediately above) — present for a
  // time-slot unit, null for every date-only booking (Hotel/Property/
  // Restaurant/Car Rental, and any date-only Tour/Attraction unit).
  test('items carry start_time/end_time when the repository resolved a time-slot booking', () => {
    const response = toBookingResponse({
      id: 3,
      bookingReference: 'BK-20260101-TOURDEP01',
      customerUserId: 2,
      partnerId: 5,
      listingId: 6,
      bookingTypeCode: 'TOUR_BOOKING',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '9500.00',
      items: [
        {
          id: 12,
          bookableUnitId: 4,
          unitLabel: '09:00 Departure',
          bookableUnitTypeCode: 'TOUR_DEPARTURE',
          dateFrom: '2026-09-12',
          dateTo: '2026-09-12',
          startTime: '09:00',
          endTime: '11:30',
          quantity: 1,
          unitPriceAmount: '9500.00',
        },
      ],
    });

    expect(response.items[0].start_time).toBe('09:00');
    expect(response.items[0].end_time).toBe('11:30');
  });

  test('items expose null start_time/end_time for a date-only booking', () => {
    const response = toBookingResponse({
      id: 4,
      bookingReference: 'BK-20260101-HOTELROOM',
      customerUserId: 2,
      partnerId: 5,
      listingId: 5,
      bookingTypeCode: 'HOTEL_ROOM_BOOKING',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '85000.00',
      items: [
        {
          id: 13,
          bookableUnitId: 3,
          unitLabel: 'Deluxe Suite',
          bookableUnitTypeCode: 'HOTEL_ROOM',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-03',
          quantity: 1,
          unitPriceAmount: '85000.00',
        },
      ],
    });

    expect(response.items[0].start_time).toBeNull();
    expect(response.items[0].end_time).toBeNull();
  });
});

describe('toBookingSummaryResponse', () => {
  test('includes date_from/date_to from tripDateFrom/tripDateTo', () => {
    const response = toBookingSummaryResponse({
      id: 1,
      bookingReference: 'BK-20260101-ABCDEF23',
      listingId: 5,
      bookingTypeCode: 'PROPERTY_UNIT',
      statusCode: 'CONFIRMED',
      currencyCode: 'AMD',
      totalAmount: '85000.00',
      requestedAt: new Date('2026-01-01'),
      tripDateFrom: '2026-08-01',
      tripDateTo: '2026-08-03',
    });

    expect(response.date_from).toBe('2026-08-01');
    expect(response.date_to).toBe('2026-08-03');
  });

  test('date_from/date_to are null when no trip dates were resolved', () => {
    const response = toBookingSummaryResponse({
      id: 2,
      bookingReference: 'BK-20260101-ZZZZZZZZ',
      listingId: 5,
      bookingTypeCode: 'PROPERTY_UNIT',
      statusCode: 'DRAFT',
      currencyCode: 'AMD',
      totalAmount: '0.00',
      requestedAt: new Date('2026-01-01'),
    });

    expect(response.date_from).toBeNull();
    expect(response.date_to).toBeNull();
  });
});

describe('toBookingResponse — restaurant menu pre-order', () => {
  const base = {
    id: 1,
    bookingReference: 'BK-20260101-ABCDEF23',
    bookingTypeCode: 'RESTAURANT_RESERVATION',
    currencyCode: 'AMD',
    totalAmount: '0.00',
  };

  test('a reservation alone has no pre-order', () => {
    const response = toBookingResponse({
      ...base,
      items: [{ id: 3, quantity: 1, menuSelections: [] }],
    });
    expect(response.items[0].menu_preorder).toBeNull();
  });

  test('a pre-order reads its own snapshot lines, line totals and subtotal, paid at the venue', () => {
    const response = toBookingResponse({
      ...base,
      items: [
        {
          id: 3,
          quantity: 1,
          menuSelections: [
            {
              menuItemId: 7,
              title: 'Khorovats',
              sectionTitle: 'Grill',
              languageCode: 'hy',
              quantity: 2,
              unitPriceAmount: '12000.00',
              currencyCode: 'AMD',
            },
            {
              menuItemId: null,
              title: 'Gata',
              sectionTitle: null,
              languageCode: 'hy',
              quantity: 1,
              unitPriceAmount: '1500.00',
              currencyCode: 'AMD',
            },
          ],
        },
      ],
    });
    expect(response.items[0].menu_preorder).toEqual({
      lines: [
        {
          menu_item_id: 7,
          title: 'Khorovats',
          section_title: 'Grill',
          language_code: 'hy',
          quantity: 2,
          unit_price_amount: '12000.00',
          line_total_amount: '24000.00',
        },
        {
          menu_item_id: null,
          title: 'Gata',
          section_title: null,
          language_code: 'hy',
          quantity: 1,
          unit_price_amount: '1500.00',
          line_total_amount: '1500.00',
        },
      ],
      subtotal_amount: '25500.00',
      currency: 'AMD',
      payment: 'PAY_AT_VENUE',
    });
    // Never part of what the booking charges.
    expect(response.total_amount).toBe('0.00');
  });
});
