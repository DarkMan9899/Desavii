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
