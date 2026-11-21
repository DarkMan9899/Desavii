import { describe, test, expect } from 'vitest';
import {
  BOOKING_FLOWS,
  FLOW_CONFIG,
  resolveBookingFlow,
  resolveBookingCtaKey,
} from './bookingFlows.js';

const unit = (type) => ({ id: 1, bookable_unit_type: type });

describe('resolveBookingFlow', () => {
  test.each([
    ['HOTEL_ROOM', BOOKING_FLOWS.STAY],
    ['PROPERTY_UNIT', BOOKING_FLOWS.HOME],
    ['TOUR_DEPARTURE', BOOKING_FLOWS.DEPARTURE],
    ['VEHICLE', BOOKING_FLOWS.VEHICLE],
    ['RESTAURANT_TABLE', BOOKING_FLOWS.RESTAURANT],
  ])('%s units run the %s flow', (type, flow) => {
    expect(resolveBookingFlow([unit(type)])).toBe(flow);
  });

  test('no units, or only unknown types, is the generic flow', () => {
    expect(resolveBookingFlow()).toBe(BOOKING_FLOWS.GENERIC);
    expect(resolveBookingFlow(null)).toBe(BOOKING_FLOWS.GENERIC);
    expect(resolveBookingFlow([unit('SPACESHIP')])).toBe(BOOKING_FLOWS.GENERIC);
  });
});

describe('FLOW_CONFIG', () => {
  test('a car rental never asks for guests and counts days', () => {
    expect(FLOW_CONFIG.VEHICLE.guests).toBeNull();
    expect(FLOW_CONFIG.VEHICLE.duration).toBe('days');
    expect(FLOW_CONFIG.VEHICLE.quantity).toBe('vehicles');
  });

  test('a departure is one date whose quantity is its people', () => {
    expect(FLOW_CONFIG.DEPARTURE.dateMode).toBe('single');
    expect(FLOW_CONFIG.DEPARTURE.quantity).toBe('people');
    expect(FLOW_CONFIG.DEPARTURE.guests).toBeNull();
  });

  test('a restaurant is one date, a party, and nothing counted', () => {
    expect(FLOW_CONFIG.RESTAURANT).toEqual({
      dateMode: 'single',
      quantity: null,
      guests: 'party',
      duration: null,
    });
  });
});

describe('resolveBookingCtaKey', () => {
  const key = (suffix) => `pages.listingDetail.reservation.cta.${suffix}`;

  test.each([
    [{ flow: BOOKING_FLOWS.STAY }, 'stay'],
    [{ flow: BOOKING_FLOWS.HOME }, 'stay'],
    [{ flow: BOOKING_FLOWS.VEHICLE }, 'vehicle'],
    [{ flow: BOOKING_FLOWS.RESTAURANT }, 'restaurant'],
    [
      { flow: BOOKING_FLOWS.RESTAURANT, withPreorder: true },
      'restaurantPreorder',
    ],
    [{ flow: BOOKING_FLOWS.DEPARTURE, categorySlug: 'tours' }, 'tour'],
    [
      { flow: BOOKING_FLOWS.DEPARTURE, categorySlug: 'attractions' },
      'attraction',
    ],
    [
      { flow: BOOKING_FLOWS.DEPARTURE, categorySlug: 'entertainment-venues' },
      'entertainment',
    ],
    [{ flow: BOOKING_FLOWS.DEPARTURE, listingType: 'TOUR' }, 'tour'],
    // Unknown category: never labelled a tour, a visit or a session.
    [{ flow: BOOKING_FLOWS.DEPARTURE, listingType: 'ATTRACTION' }, 'generic'],
    [{ flow: BOOKING_FLOWS.DEPARTURE }, 'generic'],
    [
      {
        flow: BOOKING_FLOWS.DEPARTURE,
        categorySlug: 'unknown-category',
        listingType: 'ATTRACTION',
      },
      'generic',
    ],
    [{ flow: BOOKING_FLOWS.GENERIC }, 'generic'],
  ])('%o → %s', (input, suffix) => {
    expect(resolveBookingCtaKey(input)).toBe(key(suffix));
  });

  test('a pre-order changes only a restaurant action', () => {
    expect(
      resolveBookingCtaKey({ flow: BOOKING_FLOWS.STAY, withPreorder: true }),
    ).toBe(key('stay'));
  });
});
