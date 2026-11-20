/**
 * listingFactGroups — a listing's category facts, grouped the way a
 * traveller weighs them (docs/LISTING_DETAIL_INFORMATION_DEPTH.md §5):
 * a tour reads "How the tour runs", "Who it's for" and, as its own
 * section, "Meeting and pickup"; a car reads its body and capacity, its
 * engine and drive, then the driver and mileage terms.
 *
 * Every row comes from stored data — a category attribute the partner
 * filled in, the real start times of the listing's bookable units, or (for
 * a fixed meeting point) the listing's own public place —
 * and a fact without data is left out, so a group (and a section) exists
 * only when it has something true to say. Facts the key facts strip
 * already shows (`consumedCodes`) are not repeated.
 *
 * The grouping is presentation config: an attribute this file does not
 * name (a newly seeded one) still shows, in "More details", so no stored
 * fact is ever silently hidden. One pure function feeds both the in-page
 * navigation (`listingDetailSections.js`) and the sections themselves, so
 * a link never points at a section that renders nothing.
 */

import { Clock3 } from 'lucide-react';
import {
  fromAttributeValuesResponse,
  isAttributeApplicable,
} from './attributeValueMapping.js';
import {
  formatValueList,
  hasMetadataValue,
  toMetadataRow,
} from './metadataValueFormat.js';

/** The section a group renders in (`listingDetailSections.js` ids). */
const FACT_SECTIONS = Object.freeze({
  ATTRIBUTES: 'attributes',
  MEETING: 'meeting',
});

// The real start times of the listing's time-slotted units (tour
// departures, attraction slots, venue sessions).
const START_TIMES = '@startTimes';
const SESSION_TIMES = '@sessionTimes';

const AUDIENCE = {
  key: 'audience',
  codes: ['min_age', 'min_group_size', 'max_group_size', 'languages_offered'],
};

const PROPERTY_GROUPS = [
  {
    key: 'roomsSpace',
    codes: [
      'space_type',
      'max_guests',
      'bedrooms',
      'beds',
      'bathrooms',
      'floor_area_sqm',
      'view_type',
    ],
  },
  { key: 'stay', codes: ['check_in_method', 'languages_spoken'] },
];

/** Groups per category visual key (`categoryPresentation.js`), in reading order. */
const GROUPS_BY_CATEGORY = {
  tours: [
    {
      key: 'tourRun',
      codes: [
        'tour_format',
        'guide_type',
        'duration_minutes',
        'difficulty',
        'transport_modes',
        'meals_included',
        'weather_policy',
      ],
    },
    AUDIENCE,
    {
      key: 'meeting',
      section: FACT_SECTIONS.MEETING,
      codes: [
        'meeting_point_type',
        'pickup_details',
        START_TIMES,
        'end_point_type',
        'end_point_details',
      ],
    },
  ],
  attractions: [
    {
      key: 'visitRun',
      codes: [
        'attraction_type',
        'visit_format',
        'setting',
        'duration_minutes',
        START_TIMES,
      ],
    },
    AUDIENCE,
  ],
  'entertainment-venues': [
    {
      key: 'venueRun',
      codes: [
        'venue_type',
        'setting',
        'seating_type',
        'duration_minutes',
        SESSION_TIMES,
      ],
    },
    AUDIENCE,
  ],
  'car-rentals': [
    {
      key: 'vehicle',
      codes: [
        'vehicle_make',
        'vehicle_model',
        'vehicle_year',
        'body_type',
        'seats',
        'doors',
        'luggage_capacity',
      ],
    },
    { key: 'drive', codes: ['transmission', 'drive_type', 'fuel_type'] },
    {
      key: 'driverTerms',
      codes: [
        'min_driver_age',
        'min_license_years',
        'mileage_policy',
        'daily_distance_limit_km',
      ],
    },
  ],
  apartments: PROPERTY_GROUPS,
  villas: PROPERTY_GROUPS,
  'guest-houses': PROPERTY_GROUPS,
};

/** Distinct start times ("09:00") of the listing's time-slotted units, in order. */
export function resolveStartTimes(units = []) {
  return [
    ...new Set(
      units.map((unit) => unit.time_slot_start).filter((time) => !!time),
    ),
  ].sort();
}

// A fixed meeting point is the listing's own place: its public street
// address (when it has one) and city, in the page's language — more useful
// than the bare word "Fixed location". Hotel pickup keeps its own label,
// followed by the partner's pickup details.
function meetingPointValue(value, location) {
  if (value !== 'FIXED_LOCATION' || !location) return null;
  const place = [location.address_line, location.city_name]
    .filter(Boolean)
    .join(', ');
  return place || null;
}

function timesRow(key, labelKey, units, t) {
  const times = resolveStartTimes(units);
  return times.length > 0
    ? {
        key,
        icon: Clock3,
        label: t(labelKey),
        value: formatValueList(times, t),
      }
    : null;
}

/**
 * @param {{
 *   categoryVisualKey: string,
 *   metadata: { attributes?: object[] } | undefined,
 *   listing: { attribute_values?: object[] },
 *   location?: { address_line?: string|null, city_name?: string|null } | null,
 *   locale: string,
 *   units?: object[],
 *   consumedCodes?: string[],
 * }} input
 * @param {Function} t - i18next `t`
 * @returns {{ attributes: Array<{key: string, heading: string|null, rows: object[]}>, meeting: Array<{key: string, heading: string|null, rows: object[]}> }}
 */
export function resolveListingFactGroups(
  {
    categoryVisualKey,
    metadata,
    listing,
    location = null,
    locale,
    units = [],
    consumedCodes = [],
  },
  t,
) {
  const definitions = metadata?.attributes ?? [];
  const values = fromAttributeValuesResponse(
    definitions,
    listing.attribute_values,
  );
  const consumed = new Set(consumedCodes);
  const shown = new Map(
    definitions
      .filter(
        (definition) =>
          isAttributeApplicable(definition, values) &&
          !consumed.has(definition.code) &&
          hasMetadataValue(values[definition.code]),
      )
      .map((definition) => [definition.code, definition]),
  );

  const rowFor = (code) => {
    if (code === START_TIMES) {
      return timesRow(code, 'pages.listingDetail.facts.startTimes', units, t);
    }
    if (code === SESSION_TIMES) {
      return timesRow(code, 'pages.listingDetail.facts.sessionTimes', units, t);
    }
    const definition = shown.get(code);
    if (!definition) return null;
    const row = toMetadataRow(
      'attributes',
      definition,
      values[code],
      t,
      locale,
    );
    const place =
      code === 'meeting_point_type'
        ? meetingPointValue(values[code], location)
        : null;
    return place ? { ...row, value: place } : row;
  };

  const configured = GROUPS_BY_CATEGORY[categoryVisualKey] ?? [];
  const named = new Set(configured.flatMap((group) => group.codes));
  const unnamed = [...shown.keys()].filter((code) => !named.has(code));
  const groups = [
    ...configured,
    { key: configured.length > 0 ? 'more' : 'all', codes: unnamed },
  ]
    .map((group) => ({
      key: group.key,
      section: group.section ?? FACT_SECTIONS.ATTRIBUTES,
      rows: group.codes.map(rowFor).filter(Boolean),
    }))
    .filter((group) => group.rows.length > 0);

  // A section with one group needs no sub-heading: the section heading
  // already names it.
  const inSection = (section) => {
    const sectionGroups = groups.filter((group) => group.section === section);
    return sectionGroups.map((group) => ({
      key: group.key,
      heading:
        sectionGroups.length > 1
          ? t(`pages.listingDetail.facts.groups.${group.key}`)
          : null,
      rows: group.rows,
    }));
  };

  return {
    attributes: inSection(FACT_SECTIONS.ATTRIBUTES),
    meeting: inSection(FACT_SECTIONS.MEETING),
  };
}

export default resolveListingFactGroups;
