/**
 * Step L6.2H1 — shared checks that seeded listings are priced only with
 * models their category offers, and that participant-priced copy never
 * promises a basis booking doesn't charge. Each query takes a SQL scope over
 * the `listings l` alias (e.g. `l.id >= ?` or `l.slug LIKE ?`) so the demo
 * pipeline and the Sprint J catalog tests assert the same rules on their
 * own rows.
 */

// Hourly / per-session / per-lane pricing claims, in EN, HY and RU.
export const NON_PER_PERSON_PRICE_CLAIMS =
  /per hour|by the hour|hourly|per session|per lane|per play area|по час|за час|за сессию|ժամով|ըստ սեսիայի/i;

/** @returns {Promise<Array<{category: string, model: string, offered: number}>>} */
export async function listSeededPricing(db, scopeSql, params) {
  const [rows] = await db.query(
    `SELECT c.slug AS category, pm.code AS model,
       EXISTS (
         SELECT 1 FROM category_pricing_models cpm
         WHERE cpm.category_id = c.id AND cpm.pricing_model_id = lp.pricing_model_id
       ) AS offered
     FROM listings l
     JOIN listing_pricing lp ON lp.listing_id = l.id
     JOIN pricing_models pm ON pm.id = lp.pricing_model_id
     JOIN listing_category_listing lcl ON lcl.listing_id = l.id
     JOIN listing_categories c ON c.id = lcl.category_id
     WHERE ${scopeSql}`,
    params,
  );
  return rows;
}

/**
 * Tour and Entertainment Venue translations (the two categories that used to
 * offer PER_HOUR) whose title/summary/description claim a non-per-person price.
 * @returns {Promise<{checked: number, claims: string[]}>}
 */
export async function findPriceBasisClaims(db, scopeSql, params) {
  const [rows] = await db.query(
    `SELECT l.slug, lang.code AS locale, lt.title, lt.summary, lt.description
     FROM listings l
     JOIN listing_translations lt ON lt.listing_id = l.id
     JOIN languages lang ON lang.id = lt.language_id
     JOIN listing_category_listing lcl ON lcl.listing_id = l.id
     JOIN listing_categories c ON c.id = lcl.category_id
     WHERE ${scopeSql} AND c.slug IN ('tours', 'entertainment-venues')`,
    params,
  );
  const claims = rows
    .filter((row) =>
      NON_PER_PERSON_PRICE_CLAIMS.test(
        [row.title, row.summary, row.description].join(' '),
      ),
    )
    .map((row) => `${row.slug} (${row.locale})`);
  return { checked: rows.length, claims };
}

// Step L6.2H3B — a departure's (TOUR_DEPARTURE's) capacity counts people,
// billed per person. Copy that promises a private group, a whole-day guide
// booking, or a lane inventory contradicts that model. Deliberately whole
// phrases: a bare "частн" also matches "участники" (participants).
export const DEPARTURE_CAPACITY_CONTRADICTIONS =
  /private guide|one-on-one|seat-based|for your party only|частн(ый|ого) гид|индивидуальн\S* бронирован|անհատական ուղեկց|\b(six|6) (bowling )?lanes\b|шесть(ю)? (боулинг-)?дорож|վեց (բոուլինգ )?ուղ/i;

/**
 * Every text a customer reads on the scoped listings that have a
 * TOUR_DEPARTURE unit — translations, highlights, itinerary and FAQs — that
 * contradicts "capacity = people".
 * @returns {Promise<{checked: number, contradictions: string[]}>}
 */
export async function findDepartureCopyContradictions(db, scopeSql, params) {
  const departureListings = `
    SELECT l.id FROM listings l
    WHERE ${scopeSql} AND EXISTS (
      SELECT 1 FROM bookable_units bu
      JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
      WHERE bu.listing_id = l.id AND but.code = 'TOUR_DEPARTURE'
    )`;
  const [rows] = await db.query(
    `SELECT l.slug, CONCAT_WS(' ', lt.title, lt.summary, lt.description) AS text
       FROM listings l JOIN listing_translations lt ON lt.listing_id = l.id
       WHERE l.id IN (${departureListings})
     UNION ALL
     SELECT l.slug, h.text FROM listings l JOIN listing_highlights h ON h.listing_id = l.id
       WHERE l.id IN (${departureListings})
     UNION ALL
     SELECT l.slug, CONCAT_WS(' ', s.title, s.description)
       FROM listings l JOIN listing_itinerary_steps s ON s.listing_id = l.id
       WHERE l.id IN (${departureListings})
     UNION ALL
     SELECT l.slug, CONCAT_WS(' ', f.question, f.answer)
       FROM listings l JOIN listing_faqs f ON f.listing_id = l.id
       WHERE l.id IN (${departureListings})`,
    [...params, ...params, ...params, ...params],
  );
  const contradictions = [
    ...new Set(
      rows
        .filter((row) => DEPARTURE_CAPACITY_CONTRADICTIONS.test(row.text ?? ''))
        .map((row) => row.slug),
    ),
  ];
  return { checked: rows.length, contradictions };
}
