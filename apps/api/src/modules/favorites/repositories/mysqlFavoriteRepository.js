/**
 * MySQL-backed Favorite repository — Phase 12 (Product Polish: minimal
 * Favorites module). Owns `favorites` (migration 0009, unused until now).
 *
 * The listing-summary join below is a small, self-contained subset of
 * `mysqlSearchRepository.js`'s read pattern (title/cover image/price/
 * city/rating) — not a shared query, since a favorites list has none of
 * search's relevance-ranking/dynamic-filter complexity and duplicating
 * a handful of JOINs here is far simpler than threading an `listingIds`
 * filter through the search module's query builder for one caller.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';

/**
 * Card-composition-closure fix — the 9-category cross-category audit
 * found Favorites cards never activate any category-specific internal
 * design because `category_slug` (and the same generic per-category
 * metadata fields Search's own cards use) never reached this query.
 * Verbatim copy of `mysqlSearchRepository.js`'s own `CARD_METADATA_
 * SELECT` — that constant isn't exported, and per this file's own
 * existing header comment ("duplicating a handful of JOINs here is far
 * simpler than threading an `listingIds` filter through the search
 * module's query builder"), duplicating this self-contained SQL
 * fragment is the established pattern for this repository rather than
 * importing across modules. Every field here is `NULL` whenever that
 * attribute was never authored for the listing — never a guessed/
 * fabricated default, same rule the search module documents.
 */
const CARD_METADATA_SELECT = `
      (SELECT lc.slug FROM listing_category_listing lcl_card
         JOIN listing_categories lc ON lc.id = lcl_card.category_id
         WHERE lcl_card.listing_id = l.id
         ORDER BY lcl_card.category_id ASC LIMIT 1
      ) AS category_slug,
      (SELECT GROUP_CONCAT(ao_cuisine.code ORDER BY ao_cuisine.sort_order SEPARATOR ',')
         FROM listing_attribute_option lao_cuisine
         JOIN attribute_options ao_cuisine ON ao_cuisine.id = lao_cuisine.attribute_option_id
         JOIN attribute_definitions ad_cuisine ON ad_cuisine.id = ao_cuisine.attribute_definition_id
         WHERE lao_cuisine.listing_id = l.id AND ad_cuisine.code = 'cuisine'
      ) AS cuisine_codes,
      (SELECT ao_tier.code
         FROM listing_attribute_option lao_tier
         JOIN attribute_options ao_tier ON ao_tier.id = lao_tier.attribute_option_id
         JOIN attribute_definitions ad_tier ON ad_tier.id = ao_tier.attribute_definition_id
         WHERE lao_tier.listing_id = l.id AND ad_tier.code = 'price_tier'
         LIMIT 1
      ) AS price_tier_code,
      (SELECT ao_star.code
         FROM listing_attribute_option lao_star
         JOIN attribute_options ao_star ON ao_star.id = lao_star.attribute_option_id
         JOIN attribute_definitions ad_star ON ad_star.id = ao_star.attribute_definition_id
         WHERE lao_star.listing_id = l.id AND ad_star.code = 'star_rating'
         LIMIT 1
      ) AS star_rating_code,
      (SELECT ao_trans.code
         FROM listing_attribute_option lao_trans
         JOIN attribute_options ao_trans ON ao_trans.id = lao_trans.attribute_option_id
         JOIN attribute_definitions ad_trans ON ad_trans.id = ao_trans.attribute_definition_id
         WHERE lao_trans.listing_id = l.id AND ad_trans.code = 'transmission'
         LIMIT 1
      ) AS transmission_code,
      (SELECT lav_bed.value
         FROM listing_attribute_values_integer lav_bed
         JOIN attribute_definitions ad_bed ON ad_bed.id = lav_bed.attribute_definition_id
         WHERE lav_bed.listing_id = l.id AND ad_bed.code = 'bedrooms'
         LIMIT 1
      ) AS bedrooms_value,
      (SELECT lav_dur.value
         FROM listing_attribute_values_integer lav_dur
         JOIN attribute_definitions ad_dur ON ad_dur.id = lav_dur.attribute_definition_id
         WHERE lav_dur.listing_id = l.id AND ad_dur.code = 'duration_minutes'
         LIMIT 1
      ) AS duration_minutes_value`;

function toFavoritedListingDomain(row) {
  return {
    favoriteId: row.favorite_id,
    favoritedAt: row.favorited_at,
    id: row.id,
    listingTypeCode: row.listing_type_code,
    slug: row.slug,
    statusCode: row.status_code,
    title: row.title,
    cityName: row.city_name,
    coverImageUrl: row.cover_image_url,
    priceAmount: row.price_amount,
    priceCurrencyCode: row.price_currency_code,
    ratingAverage:
      row.rating_average !== null ? Number(row.rating_average) : null,
    reviewCount: Number(row.review_count),
    // Same mapping rules as `mysqlSearchRepository.js`'s own
    // `toSearchResultDomain` — real value or `null`, never guessed;
    // `cuisine_codes` is GROUP_CONCAT'd into a comma string by the
    // subquery above, split back into option codes here.
    categorySlug: row.category_slug ?? null,
    cuisineCodes: row.cuisine_codes ? row.cuisine_codes.split(',') : null,
    priceTierCode: row.price_tier_code ?? null,
    starRatingCode: row.star_rating_code ?? null,
    transmissionCode: row.transmission_code ?? null,
    bedroomsValue:
      row.bedrooms_value !== undefined && row.bedrooms_value !== null
        ? Number(row.bedrooms_value)
        : null,
    durationMinutesValue:
      row.duration_minutes_value !== undefined &&
      row.duration_minutes_value !== null
        ? Number(row.duration_minutes_value)
        : null,
  };
}

export class MySqlFavoriteRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async find(customerUserId, listingId) {
    const [rows] = await this.#pool.query(
      'SELECT id FROM favorites WHERE customer_user_id = ? AND listing_id = ? LIMIT 1',
      [customerUserId, listingId],
    );
    return rows[0] ?? null;
  }

  async add(customerUserId, listingId) {
    await this.#pool.query(
      'INSERT IGNORE INTO favorites (customer_user_id, listing_id) VALUES (?, ?)',
      [customerUserId, listingId],
    );
  }

  async remove(customerUserId, listingId) {
    await this.#pool.query(
      'DELETE FROM favorites WHERE customer_user_id = ? AND listing_id = ?',
      [customerUserId, listingId],
    );
  }

  /** All of a customer's favorited listing ids — cheap, unpaginated (used to hydrate heart-toggle state on card grids). */
  async listListingIdsForCustomer(customerUserId) {
    const [rows] = await this.#pool.query(
      'SELECT listing_id FROM favorites WHERE customer_user_id = ?',
      [customerUserId],
    );
    return rows.map((row) => row.listing_id);
  }

  /** Cursor-paginated, listing-summary-joined — powers the Favorites list page. */
  async listForCustomer(customerUserId, { cursor, limit } = {}) {
    const decoded = decodeCursor(cursor);
    const conditions = ['f.customer_user_id = ?', 'l.deleted_at IS NULL'];
    const params = [customerUserId];
    if (
      decoded &&
      decoded.favoritedAt !== undefined &&
      decoded.id !== undefined
    ) {
      conditions.push('(f.created_at, f.id) < (?, ?)');
      params.push(decoded.favoritedAt, decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT
         f.id AS favorite_id, f.created_at AS favorited_at,
         l.id, ltype.code AS listing_type_code, ls.code AS status_code, l.slug,
         COALESCE(lt.title, lt2.title, '') AS title,
         c.name AS city_name,
         m.url AS cover_image_url,
         lp.amount AS price_amount, cur.code AS price_currency_code,
         (SELECT AVG(rv.rating) FROM reviews rv
            JOIN moderation_statuses rs ON rs.id = rv.status_id
            WHERE rv.listing_id = l.id AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
         ) AS rating_average,
         (SELECT COUNT(*) FROM reviews rv
            JOIN moderation_statuses rs ON rs.id = rv.status_id
            WHERE rv.listing_id = l.id AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
         ) AS review_count,
         ${CARD_METADATA_SELECT}
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       JOIN listing_types ltype ON ltype.id = l.listing_type_id
       JOIN listing_statuses ls ON ls.id = l.status_id
       LEFT JOIN listing_locations loc ON loc.listing_id = l.id
       LEFT JOIN cities c ON c.id = loc.city_id
       LEFT JOIN listing_translations lt ON lt.listing_id = l.id AND lt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       LEFT JOIN listing_translations lt2 ON lt2.listing_id = l.id
       LEFT JOIN media m ON m.mediable_type = 'listing' AND m.mediable_id = l.id AND m.is_cover = 1 AND m.deleted_at IS NULL
       LEFT JOIN listing_pricing lp ON lp.listing_id = l.id
       LEFT JOIN currencies cur ON cur.id = lp.currency_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    return buildPageMeta(rows.map(toFavoritedListingDomain), limit, (row) => ({
      favoritedAt: row.favoritedAt,
      id: row.favoriteId,
    }));
  }
}

export default MySqlFavoriteRepository;
