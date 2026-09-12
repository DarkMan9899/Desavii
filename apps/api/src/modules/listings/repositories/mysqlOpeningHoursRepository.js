/**
 * MySQL implementation of the Opening Hours repository (Pass 6, Restaurant
 * vertical). Owns `listing_opening_hours` (migration 0046). Full-replace
 * on write — same "DELETE then re-INSERT the given rows" shape
 * `mysqlListingRepository.js#replaceHighlights` already uses for a
 * listing sub-resource with a small, fixed cardinality (there are at most
 * 7 days; a partner re-submits the whole week each save, exactly like a
 * highlights list is re-submitted whole).
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';

function toTimeString(value) {
  return value ? String(value).slice(0, 5) : null;
}

function toDayDomain(row) {
  return {
    dayOfWeek: row.day_of_week,
    opensAt: toTimeString(row.opens_at),
    closesAt: toTimeString(row.closes_at),
    isClosed: Boolean(row.is_closed),
  };
}

export class MySqlOpeningHoursRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /** Only the days actually authored — an absent day means "not published", never assumed. */
  async findByListingId(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT day_of_week, opens_at, closes_at, is_closed
       FROM listing_opening_hours
       WHERE listing_id = ?
       ORDER BY day_of_week ASC`,
      [listingId],
    );
    return rows.map(toDayDomain);
  }

  async replaceForListing(listingId, days, userId, connection = this.#pool) {
    await connection.query(
      'DELETE FROM listing_opening_hours WHERE listing_id = ?',
      [listingId],
    );
    // eslint-disable-next-line no-restricted-syntax -- small, fixed (<=7) set; sequential is fine
    for (const day of days) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design, matches replaceHighlights
      await connection.query(
        `INSERT INTO listing_opening_hours
           (listing_id, day_of_week, opens_at, closes_at, is_closed, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          day.dayOfWeek,
          day.isClosed ? null : day.opensAt,
          day.isClosed ? null : day.closesAt,
          day.isClosed ? 1 : 0,
          userId,
        ],
      );
    }
    return this.findByListingId(listingId, connection);
  }
}

export default MySqlOpeningHoursRepository;
