/**
 * Canonical listing-card metadata SQL — the real facts every public listing
 * card can show (Search list and map, the Home Featured / Category TOP
 * feeds, Favorites, the Company profile), and the one row mapper that reads
 * them (docs/LISTING_CARDS.md).
 *
 * A deliberate exception to the "each module owns its own copy" convention
 * for card SQL, for the same reason as `listingVisibilitySql.js` and
 * `listingCardPriceSql.js`: a fact that drifts on one surface is a
 * correctness bug (Search, Favorites and the Company profile each used to
 * carry a verbatim copy of this fragment).
 *
 * Truthfulness rules:
 * - Only stored values; every column is NULL (or an empty list) when the
 *   listing never authored that fact — never a default or a guess.
 * - An attribute counts only while it applies to one of the listing's
 *   categories (`category_attributes`), and an amenity only while it
 *   applies to one of them (`amenity_category_applicability`, the Step
 *   L6.1 rule the amenity filter already uses) — a value left behind by a
 *   category change is never shown.
 * - Only the attributes and amenities a card can feature are read
 *   (`CARD_ENUM_ATTRIBUTES`, `CARD_NUMBER_ATTRIBUTES`,
 *   `CARD_AMENITY_CODES`): a card never needs a listing's whole catalogue.
 *
 * Three aggregated subqueries (enum options, integer values, amenities)
 * replace one correlated subquery per fact. Requires the caller's query to
 * alias `listings` as `l`. Every list below is a fixed code constant, never
 * request input; `sqlCodeList` still refuses anything but a plain code.
 */

/** ENUM / MULTI_ENUM attributes a card can show. */
export const CARD_ENUM_ATTRIBUTES = Object.freeze([
  'star_rating',
  'cuisine',
  'price_tier',
  'transmission',
  'tour_format',
  'body_type',
  'fuel_type',
  'attraction_type',
  'visit_format',
  'venue_type',
  'languages_offered',
]);

/** INTEGER attributes a card can show. */
export const CARD_NUMBER_ATTRIBUTES = Object.freeze([
  'bedrooms',
  'duration_minutes',
  'max_guests',
  'seats',
  'min_age',
  'max_group_size',
]);

/**
 * Amenities that decide whether a listing is worth opening, per category
 * (the web card's own priority lists in `categoryCardConfig.js` pick from
 * these). Everyday amenities (WiFi, heating, TV) are deliberately absent:
 * nearly every listing has them, so they tell a traveller nothing.
 */
export const CARD_AMENITY_CODES = Object.freeze([
  'AIRPORT_SHUTTLE',
  'BBQ',
  'BREAKFAST_INCLUDED',
  'CHILD_SEAT',
  'DEDICATED_WORKSPACE',
  'FAMILY_FRIENDLY',
  'FIREPLACE',
  'GARDEN',
  'GPS_NAVIGATION',
  'JACUZZI',
  'KIDS_MENU',
  'KITCHEN',
  'LIVE_MUSIC',
  'OUTDOOR_SEATING',
  'PARKING',
  'PET_FRIENDLY',
  'POOL',
  'PRIVATE_DINING_ROOM',
  'SAUNA',
  'SPA',
  'TERRACE',
  'WASHING_MACHINE',
  'WHEELCHAIR_ACCESSIBLE',
  'WINTER_TYRES',
]);

const SQL_CODE = /^[A-Za-z_]+$/;

function sqlCodeList(codes) {
  return codes
    .map((code) => {
      if (!SQL_CODE.test(code)) {
        throw new Error(`listingCardMetadataSql: invalid code "${code}"`);
      }
      return `'${code}'`;
    })
    .join(', ');
}

/** The attribute applies to one of the listing's categories. */
const ATTRIBUTE_APPLIES = (definitionAlias) => `EXISTS (
    SELECT 1 FROM category_attributes ca_card
    JOIN listing_category_listing lcl_ca ON lcl_ca.category_id = ca_card.category_id
    WHERE lcl_ca.listing_id = l.id AND ca_card.attribute_definition_id = ${definitionAlias}.id
  )`;

export const CARD_METADATA_SELECT = `
      (SELECT lc.slug FROM listing_category_listing lcl_card
         JOIN listing_categories lc ON lc.id = lcl_card.category_id
         WHERE lcl_card.listing_id = l.id
         ORDER BY lcl_card.category_id ASC LIMIT 1
      ) AS category_slug,
      (SELECT GROUP_CONCAT(CONCAT(ad_card.code, '=', ao_card.code)
           ORDER BY ad_card.code, ao_card.sort_order, ao_card.id SEPARATOR ',')
         FROM listing_attribute_option lao_card
         JOIN attribute_options ao_card ON ao_card.id = lao_card.attribute_option_id
         JOIN attribute_definitions ad_card ON ad_card.id = ao_card.attribute_definition_id
         WHERE lao_card.listing_id = l.id
           AND ad_card.code IN (${sqlCodeList(CARD_ENUM_ATTRIBUTES)})
           AND ${ATTRIBUTE_APPLIES('ad_card')}
      ) AS card_enum_facts,
      (SELECT GROUP_CONCAT(CONCAT(ad_num.code, '=', v_num.value)
           ORDER BY ad_num.code SEPARATOR ',')
         FROM listing_attribute_values_integer v_num
         JOIN attribute_definitions ad_num ON ad_num.id = v_num.attribute_definition_id
         WHERE v_num.listing_id = l.id
           AND ad_num.code IN (${sqlCodeList(CARD_NUMBER_ATTRIBUTES)})
           AND ${ATTRIBUTE_APPLIES('ad_num')}
      ) AS card_number_facts,
      (SELECT GROUP_CONCAT(DISTINCT a_card.code ORDER BY a_card.code SEPARATOR ',')
         FROM listing_amenity_listing lal_card
         JOIN listing_amenities a_card ON a_card.id = lal_card.amenity_id
         WHERE lal_card.listing_id = l.id
           AND a_card.code IN (${sqlCodeList(CARD_AMENITY_CODES)})
           AND EXISTS (
             SELECT 1 FROM listing_category_listing lcl_am
             JOIN amenity_category_applicability aca_card
               ON aca_card.category_id = lcl_am.category_id
              AND aca_card.amenity_id = lal_card.amenity_id
             WHERE lcl_am.listing_id = l.id
           )
      ) AS card_amenity_codes,
      -- A restaurant takes reservations only when it has a real table.
      EXISTS (
        SELECT 1 FROM bookable_units bu_res
        JOIN bookable_unit_types but_res ON but_res.id = bu_res.bookable_unit_type_id
        WHERE bu_res.listing_id = l.id AND bu_res.deleted_at IS NULL
          AND but_res.code = 'RESTAURANT_TABLE'
      ) AS card_reservable,
      -- Step L6.2H1: the listing's own pricing model, so a card labels its
      -- price by the basis booking uses rather than by category. NULL when
      -- no listing-level pricing row exists (listing_pricing is 1:1).
      (SELECT pm_card.code
         FROM listing_pricing lp_card
         JOIN pricing_models pm_card ON pm_card.id = lp_card.pricing_model_id
         WHERE lp_card.listing_id = l.id
      ) AS pricing_model_code`;

/** The columns `CARD_METADATA_SELECT` yields, for an outer SELECT list. */
export const CARD_METADATA_COLUMNS = Object.freeze([
  'category_slug',
  'card_enum_facts',
  'card_number_facts',
  'card_amenity_codes',
  'card_reservable',
  'pricing_model_code',
]);

/** "code=value,code=value" → Map(code → [values]) in stored order. */
function parsePairs(text) {
  const pairs = new Map();
  if (typeof text !== 'string' || text === '') return pairs;
  text.split(',').forEach((entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) return;
    const code = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (!pairs.has(code)) pairs.set(code, []);
    pairs.get(code).push(value);
  });
  return pairs;
}

/**
 * Maps the `CARD_METADATA_SELECT` columns of a row onto the card domain
 * fields. A column absent from a narrower SELECT maps to null / [] / false.
 */
export function toCardMetadataDomain(row) {
  const enums = parsePairs(row.card_enum_facts);
  const numbers = parsePairs(row.card_number_facts);
  const one = (code) => enums.get(code)?.[0] ?? null;
  const many = (code) => enums.get(code) ?? null;
  const number = (code) => {
    const value = Number(numbers.get(code)?.[0]);
    return numbers.has(code) && Number.isFinite(value) ? value : null;
  };
  return {
    categorySlug: row.category_slug ?? null,
    cuisineCodes: many('cuisine'),
    priceTierCode: one('price_tier'),
    starRatingCode: one('star_rating'),
    transmissionCode: one('transmission'),
    tourFormatCode: one('tour_format'),
    bodyTypeCode: one('body_type'),
    fuelTypeCode: one('fuel_type'),
    attractionTypeCode: one('attraction_type'),
    visitFormatCode: one('visit_format'),
    venueTypeCode: one('venue_type'),
    languagesOfferedCodes: many('languages_offered'),
    bedroomsValue: number('bedrooms'),
    durationMinutesValue: number('duration_minutes'),
    maxGuestsValue: number('max_guests'),
    seatsValue: number('seats'),
    minAgeValue: number('min_age'),
    maxGroupSizeValue: number('max_group_size'),
    amenityCodes: row.card_amenity_codes
      ? row.card_amenity_codes.split(',')
      : [],
    isReservable: Number(row.card_reservable) === 1,
    pricingModelCode: row.pricing_model_code ?? null,
  };
}
