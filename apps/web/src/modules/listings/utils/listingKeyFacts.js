/**
 * listingKeyFacts — the few decisive facts a traveller needs before
 * reading anything else, per category (docs/LISTING_DETAIL_FIELD_GAP.md §3,
 * the Viator "key details" / GetYourGuide key-facts pattern).
 *
 * Every fact comes from stored data — a category attribute, a policy, the
 * listing's bookable units or its authored opening hours — and a fact
 * whose data is missing is simply left out: nothing here is a default or
 * a guess. Cancellation is deliberately not a key fact: the stored policy
 * is a label the refund decision does not enforce, so it appears only in
 * the Policies section, next to that clarification.
 *
 * Returns the facts plus the attribute codes they consumed, so the
 * specification grid below does not repeat them.
 */

import {
  Clock3,
  DoorOpen,
  CarFront,
  Users2,
  Route,
  LogIn,
  LogOut,
  CalendarCheck,
} from 'lucide-react';
import {
  fromAttributeValuesResponse,
  isAttributeApplicable,
} from './attributeValueMapping.js';
import { fromPolicyValuesResponse } from './policyValueMapping.js';
import { formatMetadataValue } from '../components/ListingDetailPageContent/MetadataValueDisplay.jsx';
import { resolveAttributeIcon } from './attributeIcons.js';
import { findTodaysHours } from './openingHoursStatus.js';
import { formatDurationLabel } from '../../../utils/formatDuration.js';

export const KEY_FACT_LIMIT = 6;

const ACCOMMODATION_FACTS = [
  'space_type',
  'max_guests',
  'bedrooms',
  'beds',
  'bathrooms',
  'floor_area_sqm',
];

/** Fact order per category visual key (`categoryPresentation.js`). */
const FACTS_BY_CATEGORY = {
  hotels: [
    'star_rating',
    'check_in',
    'check_out',
    'room_types',
    'languages_spoken',
    'property_style',
  ],
  apartments: ACCOMMODATION_FACTS,
  villas: ACCOMMODATION_FACTS,
  'guest-houses': ACCOMMODATION_FACTS,
  restaurants: [
    'cuisine',
    'dining_style',
    'price_tier',
    'opening_today',
    'reservation',
    'dietary_options',
  ],
  tours: [
    'duration_minutes',
    'tour_format',
    'group_size',
    'languages_offered',
    'difficulty',
    'min_age',
  ],
  'car-rentals': [
    'vehicle',
    'transmission',
    'fuel_type',
    'seats',
    'doors',
    'mileage',
  ],
  attractions: [
    'attraction_type',
    'duration_minutes',
    'visit_format',
    'setting',
    'languages_offered',
    'min_age',
  ],
  'entertainment-venues': [
    'venue_type',
    'duration_minutes',
    'setting',
    'min_age',
    'languages_offered',
    'group_size',
  ],
};

function hasValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0)
  );
}

function label(t, factKey) {
  return t(`pages.listingDetail.keyFacts.labels.${factKey}`);
}

/**
 * @param {{
 *   categoryVisualKey: string,
 *   metadata: { attributes: object[], policies: object[] } | undefined,
 *   listing: object,
 *   units?: object[],
 *   weeklyHours?: object[],
 *   now?: Date,
 * }} input
 * @param {Function} t
 * @returns {{ facts: Array<{key: string, icon: Function, label: string, value: string}>, consumedAttributeCodes: string[] }}
 */
export function resolveListingKeyFacts(
  {
    categoryVisualKey,
    metadata,
    listing,
    units = [],
    weeklyHours = [],
    now = new Date(),
  },
  t,
) {
  const factKeys = FACTS_BY_CATEGORY[categoryVisualKey];
  if (!factKeys || !metadata) return { facts: [], consumedAttributeCodes: [] };

  const attributeDefinitions = metadata.attributes ?? [];
  const attributes = fromAttributeValuesResponse(
    attributeDefinitions,
    listing.attribute_values,
  );
  const definitionsByCode = new Map(
    attributeDefinitions
      .filter((definition) => isAttributeApplicable(definition, attributes))
      .map((definition) => [definition.code, definition]),
  );
  const policies = fromPolicyValuesResponse(
    metadata.policies ?? [],
    listing.policy_values,
  );

  const attribute = (code) =>
    definitionsByCode.has(code) && hasValue(attributes[code])
      ? attributes[code]
      : undefined;
  const formatted = (code) =>
    formatMetadataValue(definitionsByCode.get(code), attributes[code], t);

  // Each producer returns `{ fact, codes }` (the attribute codes the fact
  // shows) or `null`; only the facts actually kept consume their codes, so
  // nothing that misses the strip disappears from the specification grid.
  const fromAttribute = (code) =>
    attribute(code) === undefined
      ? null
      : {
          codes: [code],
          fact: {
            key: code,
            icon: resolveAttributeIcon(code),
            label: label(t, code),
            value:
              code === 'duration_minutes'
                ? formatDurationLabel(attribute(code), t)
                : formatted(code),
          },
        };
  const fact = (key, icon, value, codes = []) => ({
    codes,
    fact: { key, icon, label: label(t, key), value },
  });

  const composite = {
    check_in: () =>
      hasValue(policies.check_in_time)
        ? fact('check_in', LogIn, policies.check_in_time)
        : null,
    check_out: () =>
      hasValue(policies.check_out_time)
        ? fact('check_out', LogOut, policies.check_out_time)
        : null,
    room_types: () => {
      const roomTypes = units.filter(
        (unit) => unit.bookable_unit_type === 'HOTEL_ROOM',
      ).length;
      return roomTypes > 0
        ? fact(
            'room_types',
            DoorOpen,
            t('pages.listingDetail.keyFacts.values.roomTypes', {
              count: roomTypes,
            }),
          )
        : null;
    },
    opening_today: () => {
      const today = findTodaysHours(weeklyHours, now);
      if (!today) return null;
      return fact(
        'opening_today',
        Clock3,
        today.isClosed
          ? t('pages.listingDetail.openingHours.closed')
          : `${today.opensAt} – ${today.closesAt}`,
      );
    },
    // Restaurant reservations are free (payment-exempt) — stated only when
    // the listing really takes them, i.e. has a bookable table.
    reservation: () =>
      units.some((unit) => unit.bookable_unit_type === 'RESTAURANT_TABLE')
        ? fact(
            'reservation',
            CalendarCheck,
            t('pages.listingDetail.keyFacts.values.freeReservation'),
          )
        : null,
    group_size: () => {
      const min = attribute('min_group_size');
      const max = attribute('max_group_size');
      if (min === undefined && max === undefined) return null;
      let value;
      if (min !== undefined && max !== undefined) {
        value = t('pages.listingDetail.keyFacts.values.groupRange', {
          min,
          max,
        });
      } else if (max !== undefined) {
        value = t('pages.listingDetail.keyFacts.values.groupUpTo', {
          count: max,
        });
      } else {
        value = t('pages.listingDetail.keyFacts.values.groupFrom', {
          count: min,
        });
      }
      return fact('group_size', Users2, value, [
        'min_group_size',
        'max_group_size',
      ]);
    },
    vehicle: () => {
      const codes = ['vehicle_make', 'vehicle_model', 'vehicle_year'].filter(
        (code) => attribute(code) !== undefined,
      );
      return codes.length > 0
        ? fact(
            'vehicle',
            CarFront,
            codes.map((code) => String(attribute(code))).join(' '),
            codes,
          )
        : null;
    },
    mileage: () => {
      if (attribute('mileage_policy') === undefined) return null;
      const limit = attribute('daily_distance_limit_km');
      return fact(
        'mileage',
        Route,
        limit !== undefined
          ? t('pages.listingDetail.keyFacts.values.distancePerDay', {
              count: limit,
            })
          : formatted('mileage_policy'),
        ['mileage_policy', 'daily_distance_limit_km'],
      );
    },
  };

  const kept = factKeys
    .map((factKey) =>
      composite[factKey] ? composite[factKey]() : fromAttribute(factKey),
    )
    .filter(Boolean)
    .slice(0, KEY_FACT_LIMIT);

  return {
    facts: kept.map((entry) => entry.fact),
    consumedAttributeCodes: kept.flatMap((entry) => entry.codes),
  };
}

export default resolveListingKeyFacts;
