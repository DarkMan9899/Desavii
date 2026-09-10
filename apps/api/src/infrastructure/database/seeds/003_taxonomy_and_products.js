/**
 * Seeds root listing categories, common amenities, and the advertising
 * product catalog (Sprint 5 §15: "root categories", "common amenities",
 * "promotion placement types" — placement *types* themselves are seeded
 * in 001_lookups.js; this file seeds the purchasable *products* built on
 * top of them).
 */

import { getIdByCode, getIdsByCode } from './helpers.js';

async function upsertCategory(connection, { name, slug }) {
  await connection.query(
    `INSERT INTO listing_categories (name, slug) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [name, slug],
  );
  const [rows] = await connection.query(
    'SELECT id FROM listing_categories WHERE slug = ?',
    [slug],
  );
  return rows[0].id;
}

async function upsertCategoryTranslation(
  connection,
  { categoryId, languageId, name },
) {
  await connection.query(
    `INSERT INTO listing_category_translations (listing_category_id, language_id, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [categoryId, languageId, name],
  );
}

async function upsertAmenity(connection, name) {
  const [existing] = await connection.query(
    'SELECT id FROM listing_amenities WHERE name = ?',
    [name],
  );
  if (existing.length > 0) return existing[0].id;
  const [result] = await connection.query(
    'INSERT INTO listing_amenities (name) VALUES (?)',
    [name],
  );
  return result.insertId;
}

async function upsertAdProduct(
  connection,
  { placementTypeId, name, durationDays, priceAmount, currencyId },
) {
  const [existing] = await connection.query(
    'SELECT id FROM ad_products WHERE ad_placement_type_id = ? AND name = ?',
    [placementTypeId, name],
  );
  if (existing.length > 0) {
    await connection.query(
      'UPDATE ad_products SET duration_days = ?, price_amount = ?, currency_id = ? WHERE id = ?',
      [durationDays, priceAmount, currencyId, existing[0].id],
    );
    return existing[0].id;
  }
  const [result] = await connection.query(
    'INSERT INTO ad_products (ad_placement_type_id, name, duration_days, price_amount, currency_id) VALUES (?, ?, ?, ?, ?)',
    [placementTypeId, name, durationDays, priceAmount, currencyId],
  );
  return result.insertId;
}

// Matches the platform capability list (CLAUDE.md's Sprint 5 goal:
// Hotels, Apartments, Villas, Guest houses, Restaurants, Tours,
// Car rentals, Attractions). Entertainment Venues (Sprint I) is
// category-only — no new listing_type: partners pick the existing
// ATTRACTION type for it, the same "one category, existing type"
// pattern Apartments/Villas/Guest Houses already establish for
// PROPERTY (`listings.listing_type_id` and category membership are
// intentionally decoupled — see `listing_category_listing`'s M:N shape
// vs. `listings.listing_type_id`'s single FK).
const ROOT_CATEGORIES = [
  { name: 'Hotels', slug: 'hotels' },
  { name: 'Apartments', slug: 'apartments' },
  { name: 'Villas', slug: 'villas' },
  { name: 'Guest Houses', slug: 'guest-houses' },
  { name: 'Restaurants', slug: 'restaurants' },
  { name: 'Tours', slug: 'tours' },
  { name: 'Car Rentals', slug: 'car-rentals' },
  { name: 'Attractions', slug: 'attractions' },
  { name: 'Entertainment Venues', slug: 'entertainment-venues' },
];

// listing_category_translations feeds mysqlSearchRepository's
// searchCategories() COALESCE(locale, defaultLocale, cat.name) chain — every
// locale-facing surface that renders a category's name (search, homepage,
// PartnerListingWizard's CategoryStep) reads through it. `en` is seeded
// explicitly too rather than relying on the `cat.name` final fallback, so
// the join always resolves without touching the base row.
const CATEGORY_TRANSLATIONS = {
  hotels: { en: 'Hotels', hy: 'Հյուրանոցներ', ru: 'Отели' },
  apartments: { en: 'Apartments', hy: 'Բնակարաններ', ru: 'Квартиры' },
  villas: { en: 'Villas', hy: 'Վիլլաներ', ru: 'Виллы' },
  'guest-houses': {
    en: 'Guest Houses',
    hy: 'Հյուրատներ',
    ru: 'Гостевые дома',
  },
  restaurants: { en: 'Restaurants', hy: 'Ռեստորաններ', ru: 'Рестораны' },
  tours: { en: 'Tours', hy: 'Տուրեր', ru: 'Туры' },
  'car-rentals': { en: 'Car Rentals', hy: 'Ավտովարձույթ', ru: 'Аренда авто' },
  attractions: {
    en: 'Attractions',
    hy: 'Տեսարժան վայրեր',
    ru: 'Достопримечательности',
  },
  'entertainment-venues': {
    en: 'Entertainment Venues',
    hy: 'Ժամանցի վայրեր',
    ru: 'Развлекательные заведения',
  },
};

const COMMON_AMENITIES = [
  'WiFi',
  'Parking',
  'Pool',
  'Air Conditioning',
  'Breakfast Included',
  'Pet Friendly',
  'Airport Shuttle',
  'Non-Smoking Rooms',
];

// Base 7-day price per placement (AMD) — 30/90-day tiers apply a modest
// per-day discount relative to the 7-day rate; a "Custom Period" product
// per placement (duration_days = NULL) supports admin-defined periods.
const PLACEMENT_BASE_PRICING = {
  HOMEPAGE_HERO: 50000,
  HOMEPAGE_SECTION: 30000,
  CATEGORY_TOP: 20000,
  CITY_TOP: 20000,
  SEARCH_SPONSORED: 15000,
  LISTING_BADGE: 8000,
  BANNER: 25000,
};

const DURATION_TIERS = [
  { days: 7, multiplier: 1 },
  { days: 30, multiplier: 3.6 }, // ~14% discount vs. 4x the 7-day rate
  { days: 90, multiplier: 9.5 }, // ~26% discount vs. 12x the 7-day rate
];

export default async function seedTaxonomyAndProducts(connection) {
  const languageIds = await getIdsByCode(connection, 'languages', [
    'en',
    'hy',
    'ru',
  ]);

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of ROOT_CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const categoryId = await upsertCategory(connection, category);
    const translations = CATEGORY_TRANSLATIONS[category.slug];

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [languageCode, name] of Object.entries(translations)) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertCategoryTranslation(connection, {
        categoryId,
        languageId: languageIds.get(languageCode),
        name,
      });
    }
  }

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const amenity of COMMON_AMENITIES) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await upsertAmenity(connection, amenity);
  }

  const amdCurrencyId = await getIdByCode(connection, 'currencies', 'AMD');
  const placementIds = await getIdsByCode(
    connection,
    'ad_placement_types',
    Object.keys(PLACEMENT_BASE_PRICING),
  );

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [placementCode, basePrice] of Object.entries(
    PLACEMENT_BASE_PRICING,
  )) {
    const placementTypeId = placementIds.get(placementCode);

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const tier of DURATION_TIERS) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertAdProduct(connection, {
        placementTypeId,
        name: `${placementCode} - ${tier.days} days`,
        durationDays: tier.days,
        priceAmount: (basePrice * tier.multiplier).toFixed(2),
        currencyId: amdCurrencyId,
      });
    }

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await upsertAdProduct(connection, {
      placementTypeId,
      name: `${placementCode} - Custom Period`,
      durationDays: null,
      priceAmount: basePrice, // per-day reference rate; final price is admin-negotiated at request time
      currencyId: amdCurrencyId,
    });
  }
}
