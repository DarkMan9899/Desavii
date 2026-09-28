/**
 * Marketplace Product Completeness Sprint B (Car Rental Pickup/Return
 * Interval) — pure chronology validation, the single choke point
 * `AvailabilityService#reserveCapacity` calls before ever trusting a
 * client-supplied pickup/return time.
 */

import { describe, test, expect } from '@jest/globals';
import {
  isVehicleUnitType,
  validateRentalInterval,
} from '../../../../src/core/domain/rentalIntervalValidation.js';

describe('isVehicleUnitType', () => {
  test('true only for VEHICLE', () => {
    expect(isVehicleUnitType('VEHICLE')).toBe(true);
    expect(isVehicleUnitType('TOUR_DEPARTURE')).toBe(false);
    expect(isVehicleUnitType('HOTEL_ROOM')).toBe(false);
    expect(isVehicleUnitType(undefined)).toBe(false);
  });
});

describe('validateRentalInterval', () => {
  // Step L6.2E: the former date-only fallback is gone — both times are
  // required for every rental.
  test('invalid when neither time is supplied — a rental needs its pickup and return times', () => {
    expect(
      validateRentalInterval({ dateFrom: '2027-09-10', dateTo: '2027-09-12' }),
    ).toEqual({ valid: false, reason: 'INCOMPLETE_RENTAL_INTERVAL' });
  });

  test('valid: a genuine multi-day rental regardless of the hour on each end', () => {
    // Sep 10 18:00 -> Sep 12 08:00: the LATER calendar day already makes
    // this a positive duration, even though 08:00 < 18:00 as a bare time.
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-10',
        dateTo: '2027-09-12',
        startTime: '18:00',
        endTime: '08:00',
      }),
    ).toEqual({ valid: true });
  });

  test('valid: same-day rental with return strictly after pickup', () => {
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-10',
        dateTo: '2027-09-10',
        startTime: '09:00',
        endTime: '18:00',
      }),
    ).toEqual({ valid: true });
  });

  test('rejects a same-day rental where return is before pickup', () => {
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-10',
        dateTo: '2027-09-10',
        startTime: '18:00',
        endTime: '09:00',
      }),
    ).toEqual({ valid: false, reason: 'RETURN_NOT_AFTER_PICKUP' });
  });

  test('rejects a zero-duration rental (identical pickup and return datetime) — zero-duration rentals are not a supported product', () => {
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-10',
        dateTo: '2027-09-10',
        startTime: '10:00',
        endTime: '10:00',
      }),
    ).toEqual({ valid: false, reason: 'RETURN_NOT_AFTER_PICKUP' });
  });

  test('rejects a return date before the pickup date, even with a later time of day', () => {
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-12',
        dateTo: '2027-09-10',
        startTime: '08:00',
        endTime: '18:00',
      }),
    ).toEqual({ valid: false, reason: 'RETURN_NOT_AFTER_PICKUP' });
  });

  test('rejects an incomplete interval — only one of startTime/endTime supplied', () => {
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-10',
        dateTo: '2027-09-12',
        startTime: '10:00',
      }),
    ).toEqual({ valid: false, reason: 'INCOMPLETE_RENTAL_INTERVAL' });
    expect(
      validateRentalInterval({
        dateFrom: '2027-09-10',
        dateTo: '2027-09-12',
        endTime: '10:00',
      }),
    ).toEqual({ valid: false, reason: 'INCOMPLETE_RENTAL_INTERVAL' });
  });
});
