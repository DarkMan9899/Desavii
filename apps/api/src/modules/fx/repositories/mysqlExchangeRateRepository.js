/**
 * MySQL-backed `exchange_rates` repository — Pass 8 (Multi-Currency /
 * CBA FX Pricing).
 *
 * `exchange_rates` (migration 0001) already existed as unused schema
 * scaffolding before this pass, with its own header comment establishing
 * the exact contract this repository fulfils: "Daily FX snapshot for
 * *display* conversion only... rate_to_base = amount of AMD equal to 1
 * unit of currency_id." This is the persistent "last known good" half of
 * brief §11/§12 — Redis (short-TTL cache, in `exchangeRateService.js`)
 * sits in front of this table, never replaces it, so a Redis restart or
 * cold cache never loses the most recent real CBA rate.
 *
 * One row per (currency, rate_date) — `upsertRate` is idempotent by
 * design (`ON DUPLICATE KEY UPDATE`), matching every other reference-data
 * upsert helper in this codebase (`seeds/helpers.js`'s `upsertByCode`).
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';

export class MySqlExchangeRateRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /**
   * @param {{currencyId: number, rateToBase: string, rateDate: string}} params
   *   `rateToBase` is the normalized "AMD per 1 unit" decimal string
   *   (`fxConversion.js#normalizeAmdPerUnit`'s output) — never the raw,
   *   un-normalized CBA `Rate`.
   */
  async upsertRate({ currencyId, rateToBase, rateDate }) {
    await this.#pool.query(
      `INSERT INTO exchange_rates (currency_id, rate_to_base, rate_date)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rate_to_base = VALUES(rate_to_base)`,
      [currencyId, rateToBase, rateDate],
    );
  }

  /**
   * The most recent stored rate for one currency, regardless of how old —
   * the "last known good" read (brief §12). `null` when this currency has
   * never once been successfully fetched.
   * @returns {Promise<{rateToBase: string, rateDate: string, fetchedAt: Date}|null>}
   */
  async findLatestForCurrency(currencyId) {
    const [rows] = await this.#pool.query(
      `SELECT rate_to_base, rate_date, created_at
       FROM exchange_rates
       WHERE currency_id = ?
       ORDER BY rate_date DESC, id DESC
       LIMIT 1`,
      [currencyId],
    );
    if (!rows[0]) return null;
    return {
      rateToBase: rows[0].rate_to_base,
      rateDate: rows[0].rate_date,
      fetchedAt: rows[0].created_at,
    };
  }

  /**
   * The most recent stored rate for EVERY currency that has ever been
   * fetched — one query for the whole last-known-good set, rather than
   * one round trip per supported currency.
   * @returns {Promise<Map<number, {rateToBase: string, rateDate: string, fetchedAt: Date}>>}
   */
  async findLatestForAllCurrencies() {
    const [rows] = await this.#pool.query(
      `SELECT er.currency_id, er.rate_to_base, er.rate_date, er.created_at
       FROM exchange_rates er
       INNER JOIN (
         SELECT currency_id, MAX(rate_date) AS max_rate_date
         FROM exchange_rates
         GROUP BY currency_id
       ) latest
         ON latest.currency_id = er.currency_id AND latest.max_rate_date = er.rate_date`,
    );
    return new Map(
      rows.map((row) => [
        row.currency_id,
        {
          rateToBase: row.rate_to_base,
          rateDate: row.rate_date,
          fetchedAt: row.created_at,
        },
      ]),
    );
  }
}

export default MySqlExchangeRateRepository;
