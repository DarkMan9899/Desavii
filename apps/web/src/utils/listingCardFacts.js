/**
 * listingCardFacts — the few facts a traveller decides on before opening a
 * listing (docs/LISTING_CARDS.md): its category's own priorities
 * (`categoryCardConfig.js` `factKeys`), filled from what the listing really
 * stored, most decisive first, `CARD_FACT_LIMIT` at most.
 *
 * Works on the flat card DTOs (`listingCardFactsDto.js` on the API). A fact
 * whose value is missing — or whose label has no translation — is skipped,
 * never shown as a raw code or a default. Labels and icons are the ones
 * Listing Detail uses (`partner.listingWizard.options.*`,
 * `listingFactIcons.js`), so a fact reads the same on the card and the page.
 */

import { CalendarCheck } from 'lucide-react';
import { ATTRIBUTE_ICONS, AMENITY_ICONS } from './listingFactIcons.js';
import { formatDurationLabel } from './formatDuration.js';
import { resolveCardConfig } from './categoryCardConfig.js';

/** Facts a card shows besides the rating. */
export const CARD_FACT_LIMIT = 3;

const AMENITY_PREFIX = 'amenity:';
/** More languages than this read as a count ("4 languages"). */
const MAX_NAMED_LANGUAGES = 2;
/** Cuisines named on a card; the page lists them all. */
const MAX_NAMED_CUISINES = 2;

function isPositiveNumber(value) {
  const number = Number(value);
  return (
    value !== null && value !== '' && Number.isFinite(number) && number > 0
  );
}

/** A translated label, or '' when the key has no translation. */
function label(t, key, options = {}) {
  return t(key, { ...options, defaultValue: '' });
}

function optionLabel(t, attribute, code) {
  return code
    ? label(t, `partner.listingWizard.options.${attribute}.${code}`)
    : '';
}

function optionLabels(t, attribute, codes, limit) {
  const labels = (codes ?? [])
    .map((code) => optionLabel(t, attribute, code))
    .filter(Boolean);
  return labels.length > 0 && labels.length <= limit ? labels.join(', ') : null;
}

const ENUM_FACTS = [
  'tour_format',
  'body_type',
  'fuel_type',
  'attraction_type',
  'visit_format',
  'venue_type',
  'transmission',
];

/** factKey → (dto, t) → label ('' / null when the listing has no value). */
const LABELS = {
  star_rating: (dto, t) =>
    isPositiveNumber(dto.star_rating)
      ? label(t, 'search.card.starRating', { count: Number(dto.star_rating) })
      : null,
  cuisine: (dto, t) => {
    const named = (dto.cuisine ?? []).slice(0, MAX_NAMED_CUISINES);
    return optionLabels(t, 'cuisine', named, MAX_NAMED_CUISINES);
  },
  bedrooms: (dto, t) =>
    isPositiveNumber(dto.bedrooms)
      ? label(t, 'search.card.bedroomsCount', { count: Number(dto.bedrooms) })
      : null,
  duration_minutes: (dto, t) =>
    isPositiveNumber(dto.duration_minutes)
      ? formatDurationLabel(Number(dto.duration_minutes), t)
      : null,
  max_guests: (dto, t) =>
    isPositiveNumber(dto.max_guests)
      ? label(t, 'listingCard.fact.maxGuests', {
          count: Number(dto.max_guests),
        })
      : null,
  seats: (dto, t) =>
    isPositiveNumber(dto.seats)
      ? label(t, 'listingCard.fact.seats', { count: Number(dto.seats) })
      : null,
  min_age: (dto, t) =>
    isPositiveNumber(dto.min_age)
      ? label(t, 'listingCard.fact.minAge', { count: Number(dto.min_age) })
      : null,
  group_size: (dto, t) =>
    isPositiveNumber(dto.max_group_size)
      ? label(t, 'pages.listingDetail.keyFacts.values.groupUpTo', {
          count: Number(dto.max_group_size),
        })
      : null,
  languages_offered: (dto, t) => {
    const codes = dto.languages_offered ?? [];
    if (codes.length > MAX_NAMED_LANGUAGES) {
      return label(t, 'listingCard.fact.languages', { count: codes.length });
    }
    return optionLabels(t, 'languages_offered', codes, MAX_NAMED_LANGUAGES);
  },
  reservable: (dto, t) =>
    dto.reservable === true
      ? label(t, 'listingCard.fact.freeReservation')
      : null,
  ...Object.fromEntries(
    ENUM_FACTS.map((attribute) => [
      attribute,
      (dto, t) => optionLabel(t, attribute, dto[attribute]),
    ]),
  ),
};

const ICONS = {
  ...ATTRIBUTE_ICONS,
  group_size: ATTRIBUTE_ICONS.max_group_size,
  reservable: CalendarCheck,
};

function resolveFact(factKey, dto, t) {
  if (factKey.startsWith(AMENITY_PREFIX)) {
    const code = factKey.slice(AMENITY_PREFIX.length);
    if (!(dto.amenities ?? []).includes(code)) return null;
    const amenityLabel = label(t, `listingCard.amenity.${code}`);
    return amenityLabel
      ? { key: factKey, icon: AMENITY_ICONS[code], label: amenityLabel }
      : null;
  }
  const value = LABELS[factKey]?.(dto, t);
  return value ? { key: factKey, icon: ICONS[factKey], label: value } : null;
}

/**
 * @param {object} dto - a flat listing card DTO.
 * @param {string|undefined} categoryVisualKey - its category slug.
 * @param {Function} t - i18next `t`.
 * @returns {Array<{key: string, icon: Function|undefined, label: string}>}
 */
export function resolveCardFacts(dto, categoryVisualKey, t) {
  const facts = [];
  resolveCardConfig(categoryVisualKey).factKeys.some((factKey) => {
    const fact = resolveFact(factKey, dto, t);
    if (fact) facts.push(fact);
    return facts.length === CARD_FACT_LIMIT;
  });
  return facts;
}

export default resolveCardFacts;
