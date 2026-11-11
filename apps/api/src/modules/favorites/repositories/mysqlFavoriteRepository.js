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
import { CARD_PRICE_SELECT } from '../../listings/repositories/listingCardPriceSql.js';
import {
  CARD_METADATA_SELECT,
  toCardMetadataDomain,
} from '../../listings/repositories/listingCardMetadataSql.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';
import { scopePubliclyVisibleListing } from '../../listings/repositories/listingVisibilitySql.js';

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
    // The shared card facts (`listingCardMetadataSql.js`).
    ...toCardMetadataDomain(row),
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

  /**
   * Step A2 (Engagement Analytics): both methods now return whether a
   * genuine state transition happened (`affectedRows > 0`) — `add` on an
   * already-favorited listing, or `remove` on an already-absent one, each
   * return `false` — so `FavoriteService` can gate its analytics/domain
   * event on a real transition, never a no-op.
   */
  async add(customerUserId, listingId) {
    const [result] = await this.#pool.query(
      'INSERT IGNORE INTO favorites (customer_user_id, listing_id) VALUES (?, ?)',
      [customerUserId, listingId],
    );
    return result.affectedRows > 0;
  }

  async remove(customerUserId, listingId) {
    const [result] = await this.#pool.query(
      'DELETE FROM favorites WHERE customer_user_id = ? AND listing_id = ?',
      [customerUserId, listingId],
    );
    return result.affectedRows > 0;
  }

  /** All of a customer's favorited listing ids — cheap, unpaginated (used to hydrate heart-toggle state on card grids). */
  async listListingIdsForCustomer(customerUserId) {
    const [rows] = await this.#pool.query(
      'SELECT listing_id FROM favorites WHERE customer_user_id = ?',
      [customerUserId],
    );
    return rows.map((row) => row.listing_id);
  }

  /**
   * Cursor-paginated, listing-summary-joined — powers the Favorites list
   * page. Step B4 fix: previously this filtered ONLY `deleted_at IS NULL`
   * — no status check at all — so an UNPUBLISHED/ARCHIVED (and, once
   * lifecycle expiry existed, an expired/frozen) listing stayed visible in
   * a customer's public Favorites list forever. Now scoped to the same
   * canonical public-visibility predicate every other public surface
   * uses. The underlying `favorites` row itself is never touched here —
   * only which rows this read returns — so a listing that's later
   * renewed/republished reappears automatically with no separate
   * "restore favorite" step.
   */
  async listForCustomer(customerUserId, { cursor, limit } = {}) {
    const decoded = decodeCursor(cursor);
    const conditions = [
      'f.customer_user_id = ?',
      'l.deleted_at IS NULL',
      scopePubliclyVisibleListing(),
    ];
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
         ${CARD_PRICE_SELECT},
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

  /**
   * Step A5 (Partner Analytics) — the "net saves" headline's authoritative
   * source: a CURRENT count of `favorites` rows, never a historical
   * `favorite_adds - favorite_removes` derivation (the two can diverge
   * once either event falls outside a selected analytics range). Scoped
   * to non-soft-deleted listings only — a B7-purged listing is no longer
   * a current marketplace listing, so its lingering favorite rows (never
   * cleaned up independently, `favorites` has no cascade/cleanup job)
   * should not inflate a partner's current-saves snapshot. Frozen-but-
   * not-deleted listings DO still count — the favorite relation itself
   * is unaffected by publish state.
   */
  async countCurrentForPartner(partnerId) {
    const [[row]] = await this.#pool.query(
      `SELECT COUNT(*) AS cnt
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       WHERE l.partner_id = ? AND l.deleted_at IS NULL`,
      [partnerId],
    );
    return Number(row.cnt);
  }

  /**
   * Same current-count semantics as {@link countCurrentForPartner}, one
   * grouped query per listing id — used by the Partner analytics listings
   * endpoint so a page of N listings never triggers N separate favorite
   * counts (brief §19's "no N+1" rule, applied here too even though it
   * was written about the raw-event unique-visitor query).
   */
  async countCurrentGroupedByListingIds(listingIds) {
    if (listingIds.length === 0) return new Map();
    const placeholders = listingIds.map(() => '?').join(', ');
    const [rows] = await this.#pool.query(
      `SELECT listing_id, COUNT(*) AS cnt FROM favorites
       WHERE listing_id IN (${placeholders})
       GROUP BY listing_id`,
      listingIds,
    );
    return new Map(rows.map((row) => [row.listing_id, Number(row.cnt)]));
  }

  /** Single-listing current count — the caller has already verified this listing is not soft-deleted. */
  async countCurrentForListing(listingId) {
    const [[row]] = await this.#pool.query(
      `SELECT COUNT(*) AS cnt FROM favorites WHERE listing_id = ?`,
      [listingId],
    );
    return Number(row.cnt);
  }
}

export default MySqlFavoriteRepository;
