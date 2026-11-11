/**
 * categoryCardConfig — what a listing card shows per category, besides the
 * shared geometry (`components/ListingCard`):
 *
 * - `priceUnitKey`: the default price basis ("/ night", "/ day",
 *   "/ person") for a row with no listing-level pricing model. Mirrors the
 *   REAL seeded `category_pricing_models` mapping (`apps/api/src/
 *   infrastructure/database/seeds/007_pricing_and_policies.js`
 *   `CATEGORY_PRICING_MODELS`), so the basis is never a fabricated label.
 * - `factKeys`: the facts a traveller decides on for that category, most
 *   decisive first (docs/LISTING_CARDS.md). A card shows the first
 *   `CARD_FACT_LIMIT` the listing really has (`listingCardFacts.js`). A key
 *   is an attribute or composite fact, `amenity:<CODE>` (one of the API's
 *   `CARD_AMENITY_CODES`) or `reservable`. Stays never show car facts and
 *   car rentals never show guest or night facts, by construction.
 *
 * An unknown category gets no basis and no facts rather than invented ones.
 * Lives in dependency-free top-level `utils/` because both `modules/search`
 * and `modules/favorites` cards reach it, and `modules/listings` already
 * depends on `modules/search`.
 */

const PRICE_UNIT_BY_CATEGORY = Object.freeze({
  hotels: 'perNight',
  apartments: 'perNight',
  villas: 'perNight',
  'guest-houses': 'perNight',
  restaurants: 'perPerson',
  tours: 'perPerson',
  'car-rentals': 'perDay',
  attractions: 'perPerson',
  'entertainment-venues': 'perPerson',
});

const FACT_KEYS_BY_CATEGORY = Object.freeze({
  hotels: Object.freeze([
    'star_rating',
    'amenity:BREAKFAST_INCLUDED',
    'amenity:POOL',
    'amenity:SPA',
    'amenity:AIRPORT_SHUTTLE',
    'amenity:PARKING',
    'amenity:PET_FRIENDLY',
  ]),
  apartments: Object.freeze([
    'max_guests',
    'bedrooms',
    'amenity:KITCHEN',
    'amenity:BREAKFAST_INCLUDED',
    'amenity:POOL',
    'amenity:WASHING_MACHINE',
    'amenity:DEDICATED_WORKSPACE',
    'amenity:PARKING',
    'amenity:PET_FRIENDLY',
  ]),
  villas: Object.freeze([
    'max_guests',
    'bedrooms',
    'amenity:POOL',
    'amenity:JACUZZI',
    'amenity:SAUNA',
    'amenity:FIREPLACE',
    'amenity:TERRACE',
    'amenity:GARDEN',
    'amenity:BBQ',
    'amenity:PARKING',
    'amenity:PET_FRIENDLY',
  ]),
  'guest-houses': Object.freeze([
    'max_guests',
    'bedrooms',
    'amenity:BREAKFAST_INCLUDED',
    'amenity:GARDEN',
    'amenity:KITCHEN',
    'amenity:PARKING',
    'amenity:FAMILY_FRIENDLY',
  ]),
  restaurants: Object.freeze([
    'cuisine',
    'reservable',
    'amenity:OUTDOOR_SEATING',
    'amenity:LIVE_MUSIC',
    'amenity:PRIVATE_DINING_ROOM',
    'amenity:KIDS_MENU',
    'amenity:PARKING',
  ]),
  tours: Object.freeze([
    'duration_minutes',
    'tour_format',
    'languages_offered',
    'group_size',
    'amenity:FAMILY_FRIENDLY',
    'amenity:WHEELCHAIR_ACCESSIBLE',
  ]),
  'car-rentals': Object.freeze([
    'transmission',
    'seats',
    'body_type',
    'fuel_type',
    'amenity:CHILD_SEAT',
    'amenity:GPS_NAVIGATION',
    'amenity:WINTER_TYRES',
  ]),
  attractions: Object.freeze([
    'attraction_type',
    'duration_minutes',
    'visit_format',
    'languages_offered',
    'amenity:FAMILY_FRIENDLY',
    'amenity:WHEELCHAIR_ACCESSIBLE',
    'amenity:PARKING',
  ]),
  'entertainment-venues': Object.freeze([
    'venue_type',
    'duration_minutes',
    'min_age',
    'languages_offered',
    'amenity:FAMILY_FRIENDLY',
    'amenity:WHEELCHAIR_ACCESSIBLE',
    'amenity:PARKING',
  ]),
});

const NO_FACTS = Object.freeze([]);

/**
 * @param {string} categoryVisualKey - a real category slug, or a
 *   lower-cased `listing_type` fallback when the slug isn't known yet.
 * @returns {{priceUnitKey: string|null, factKeys: readonly string[]}}
 */
export function resolveCardConfig(categoryVisualKey) {
  return {
    priceUnitKey: PRICE_UNIT_BY_CATEGORY[categoryVisualKey] ?? null,
    factKeys: FACT_KEYS_BY_CATEGORY[categoryVisualKey] ?? NO_FACTS,
  };
}

export default { resolveCardConfig };
