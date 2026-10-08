import { describe, test, expect } from 'vitest';
import {
  initialHourlySettings,
  validateHourlySettings,
} from './hourlyBookingSettings.js';

const COMPLETE = {
  enabled: true,
  priceAmount: '8000',
  currency: 'AMD',
  minHours: '2',
  maxHours: '6',
  availableFrom: '10:00',
  availableUntil: '20:00',
};
const KEY = (name) => `partner.listingWizard.availability.${name}`;

describe('Step L6.3B — the Partner’s hourly room settings', () => {
  test('a room without hourly booking starts off and empty', () => {
    expect(initialHourlySettings({})).toEqual({
      enabled: false,
      priceAmount: '',
      currency: null,
      minHours: '',
      maxHours: '',
      availableFrom: '',
      availableUntil: '',
    });
  });

  test('an hourly room starts with its stored values', () => {
    expect(
      initialHourlySettings({
        hourlyEnabled: true,
        hourlyPriceAmount: '8000.00',
        hourlyPriceCurrency: 'USD',
        hourlyMinDurationHours: 2,
        hourlyMaxDurationHours: 6,
        hourlyAvailableFrom: '10:00',
        hourlyAvailableUntil: '24:00',
      }),
    ).toEqual({
      enabled: true,
      priceAmount: '8000',
      currency: 'USD',
      minHours: '2',
      maxHours: '6',
      availableFrom: '10:00',
      availableUntil: '24:00',
    });
  });

  test('off: nothing is sent for a new room; an existing hourly room sends only the switch', () => {
    expect(
      validateHourlySettings(
        { ...COMPLETE, enabled: false },
        { wasEnabled: false },
      ),
    ).toEqual({
      errors: {},
      payload: {},
    });
    expect(
      validateHourlySettings(
        { ...COMPLETE, enabled: false },
        { wasEnabled: true },
      ),
    ).toEqual({
      errors: {},
      payload: { hourlyEnabled: false },
    });
  });

  test('on and complete: the full configuration with numbers', () => {
    expect(validateHourlySettings(COMPLETE, { wasEnabled: false })).toEqual({
      errors: {},
      payload: {
        hourlyEnabled: true,
        hourlyPriceAmount: 8000,
        hourlyPriceCurrency: 'AMD',
        hourlyMinDurationHours: 2,
        hourlyMaxDurationHours: 6,
        hourlyAvailableFrom: '10:00',
        hourlyAvailableUntil: '20:00',
      },
    });
  });

  test('a free (0) hourly rate is allowed', () => {
    expect(
      validateHourlySettings(
        { ...COMPLETE, priceAmount: '0' },
        { wasEnabled: false },
      ).payload.hourlyPriceAmount,
    ).toBe(0);
  });

  test.each([
    [{ priceAmount: '' }, 'hourlyPriceAmount', 'hourlyRequired'],
    [{ priceAmount: '-5' }, 'hourlyPriceAmount', 'hourlyPriceInvalid'],
    [{ priceAmount: '10.555' }, 'hourlyPriceAmount', 'hourlyPricePrecision'],
    [
      { priceAmount: '99999999999' },
      'hourlyPriceAmount',
      'hourlyPriceTooLarge',
    ],
    [{ currency: null }, 'hourlyPriceCurrency', 'hourlyRequired'],
    [{ minHours: '' }, 'hourlyMinDurationHours', 'hourlyRequired'],
    [
      { minHours: '5', maxHours: '3' },
      'hourlyMaxDurationHours',
      'hourlyDurationRangeInvalid',
    ],
    [
      { availableFrom: '20:00', availableUntil: '10:00' },
      'hourlyAvailableUntil',
      'hourlyWindowInvalid',
    ],
    [
      { availableFrom: '10:00', availableUntil: '11:00' },
      'hourlyAvailableUntil',
      'hourlyWindowInvalid',
    ],
  ])(
    '%p is refused with its own message and nothing is sent',
    (patch, field, key) => {
      const result = validateHourlySettings(
        { ...COMPLETE, ...patch },
        { wasEnabled: false },
      );
      expect(result.errors[field]).toBe(KEY(key));
      expect(result.payload).toEqual({});
    },
  );
});
