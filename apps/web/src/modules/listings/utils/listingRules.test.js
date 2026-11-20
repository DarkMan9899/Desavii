import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { resolveListingRules } from './listingRules.js';

const en = i18n.getFixedT('en');
const ru = i18n.getFixedT('ru');

const POLICIES = [
  { code: 'pets_allowed', data_type: 'BOOLEAN' },
  { code: 'check_out_time', data_type: 'STRING' },
  { code: 'check_in_time', data_type: 'STRING' },
  { code: 'cancellation_policy', data_type: 'ENUM' },
];

const summary = (rules) => rules.map((rule) => [rule.title, rule.description]);

describe('resolveListingRules', () => {
  test('policies read arrival first, whatever order the category declares; yes/no reads Allowed / Not allowed', () => {
    const rules = resolveListingRules(
      {
        policies: POLICIES,
        listing: {
          listing_type: 'PROPERTY',
          policy_values: [
            { code: 'pets_allowed', value: 'false' },
            { code: 'check_out_time', value: '11:00' },
            { code: 'check_in_time', value: '15:00' },
          ],
        },
      },
      en,
    );
    expect(summary(rules)).toEqual([
      ['Check-in', '15:00'],
      ['Check-out', '11:00'],
      ['Pets', 'Not allowed'],
    ]);
    rules.forEach((rule) => expect(rule.icon).toBeTruthy());
  });

  test('the cancellation rule carries its honest disclaimer', () => {
    const [rule] = resolveListingRules(
      {
        policies: POLICIES,
        listing: {
          listing_type: 'TOUR',
          policy_values: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
        },
      },
      en,
    );
    expect(rule.details).toBeTruthy();
  });

  test('a stay states its minimum and maximum nights and the booking notice', () => {
    const rules = resolveListingRules(
      {
        listing: {
          listing_type: 'PROPERTY',
          booking_rules: {
            minimum_stay_nights: 2,
            maximum_stay_nights: 14,
            advance_booking_min_hours: 48,
          },
        },
      },
      en,
    );
    expect(summary(rules)).toEqual([
      ['Minimum stay', '2 nights'],
      ['Maximum stay', '14 nights'],
      ['Book ahead', 'At least 2 days before'],
    ]);
  });

  test('a car counts rental days, never nights', () => {
    const rules = resolveListingRules(
      {
        listing: {
          listing_type: 'CAR_RENTAL',
          booking_rules: { minimum_stay_nights: 3 },
        },
      },
      en,
    );
    expect(summary(rules)).toEqual([['Minimum rental', '3 days']]);
  });

  test('a tour has no stay; only its booking notice applies, in hours when not whole days', () => {
    const rules = resolveListingRules(
      {
        listing: {
          listing_type: 'TOUR',
          booking_rules: {
            minimum_stay_nights: 2,
            advance_booking_min_hours: 36,
          },
        },
      },
      en,
    );
    expect(summary(rules)).toEqual([
      ['Book ahead', 'At least 36 hours before'],
    ]);
  });

  test('no restriction is not a rule: one-night minimum, zero notice and no rules at all are left out', () => {
    expect(
      resolveListingRules(
        {
          listing: {
            listing_type: 'PROPERTY',
            booking_rules: {
              minimum_stay_nights: 1,
              maximum_stay_nights: null,
              advance_booking_min_hours: 0,
            },
          },
        },
        en,
      ),
    ).toEqual([]);
    expect(
      resolveListingRules(
        { listing: { listing_type: 'HOTEL', booking_rules: null } },
        en,
      ),
    ).toEqual([]);
  });

  test('Russian plural forms', () => {
    const rules = resolveListingRules(
      {
        listing: {
          listing_type: 'PROPERTY',
          booking_rules: {
            minimum_stay_nights: 5,
            advance_booking_min_hours: 2,
          },
        },
      },
      ru,
    );
    expect(summary(rules)).toEqual([
      ['Минимальный срок', '5 ночей'],
      ['Бронирование заранее', 'Не позднее чем за 2 часа'],
    ]);
  });
});
