/**
 * ExchangeRateService — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Orchestrates brief §9-12 in one place: fetch the official CBA latest
 * rates, normalize Amount/Rate (brief §8, `fxConversion.js`), cache in
 * Redis (short TTL — CBA publishes rates roughly daily, brief §11's
 * "no request-per-price-rendering" rule), and persist every successfully
 * fetched rate into `exchange_rates` as the durable last-known-good store
 * (survives a Redis restart or a CBA outage, brief §12).
 *
 * Resolution is PER CURRENCY, not all-or-nothing: if CBA is reachable but
 * (hypothetically) omits RUB for a day, USD still gets a fresh live rate
 * while RUB falls back to its own last-known-good — never a single
 * currency's hiccup degrading the whole response. A currency with no
 * last-known-good EVER (only possible before this service's first
 * successful run) is simply omitted from `rates`, never invented —
 * `CurrencyProvider` on the frontend already treats a missing rate as
 * "fall back to AMD display" (brief §12's own explicit instruction).
 *
 * Mirrors `infrastructure/cache/cachedPermissionRepository.js`'s
 * fail-open discipline: a Redis error on read OR write never fails the
 * request, it just means this run skips the cache.
 */

import {
  getRedisClient,
  REDIS_KEY_PREFIXES,
} from '../../../infrastructure/cache/redisClient.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { normalizeAmdPerUnit } from '../../../core/domain/fxConversion.js';
import { getModuleLogger } from '../../../logging/logger.js';
import config from '../../../config/index.js';

const log = getModuleLogger('fx:service');

/** The only currencies this pass supports end-to-end (brief §1/§9) — AMD is always the identity rate, never fetched from CBA. */
export const SUPPORTED_DISPLAY_CURRENCIES = Object.freeze(['USD', 'RUB']);
export const BASE_CURRENCY = 'AMD';

// Namespaced by `config.env` — dev, test, and any future staging/prod
// deployment all share ONE Redis instance in this codebase's current
// infrastructure (`REDIS_URL`), so an unnamespaced key would let a test
// run's deterministic fixture rates (source: 'fixture') get cache-read
// back by a real dev/prod process, or vice versa. Directly observed
// during this pass's own manual QA: running the backend test suite
// polluted the dev server's live `GET /fx/rates` response with fixture
// data via this exact shared cache. Never rely on TTL alone to hide this
// — a 3600s window is easily long enough to be visibly wrong.
const CACHE_KEY = `${REDIS_KEY_PREFIXES.CACHE}fx:rates:v1:${config.env}`;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export class ExchangeRateService {
  #provider;

  #exchangeRateRepository;

  #redis;

  #cacheTtlSeconds;

  constructor({
    provider,
    exchangeRateRepository,
    redis = getRedisClient(),
    cacheTtlSeconds = 3600,
  }) {
    this.#provider = provider;
    this.#exchangeRateRepository = exchangeRateRepository;
    this.#redis = redis;
    this.#cacheTtlSeconds = cacheTtlSeconds;
  }

  async #readCache() {
    try {
      const cached = await this.#redis.get(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      log.warn({ err }, 'FX rate cache read failed — falling through');
      return null;
    }
  }

  async #writeCache(result) {
    try {
      await this.#redis.set(
        CACHE_KEY,
        JSON.stringify(result),
        'EX',
        this.#cacheTtlSeconds,
      );
    } catch (err) {
      log.warn({ err }, 'FX rate cache write failed — best effort only');
    }
  }

  /**
   * Attempts one live CBA fetch, normalizes each supported currency's
   * rate, and persists every one it gets to `exchange_rates`. Never
   * throws — a total provider failure resolves to an empty map, letting
   * the caller fall back per currency.
   * @returns {Promise<{ratesByIso: Record<string, string>, rateDate: string|null}>}
   */
  async #fetchLive() {
    let payload;
    try {
      payload = await this.#provider.fetchLatestRates();
    } catch (err) {
      log.warn(
        { err, provider: this.#provider.code },
        'Live FX provider fetch failed',
      );
      return { ratesByIso: {}, rateDate: null };
    }

    const rateDate = payload.currentDate
      ? String(payload.currentDate).slice(0, 10)
      : todayDateString();
    const ratesByIso = {};

    await Promise.all(
      payload.rates
        .filter((entry) => SUPPORTED_DISPLAY_CURRENCIES.includes(entry.iso))
        .map(async (entry) => {
          let amdPerUnit;
          try {
            amdPerUnit = normalizeAmdPerUnit(entry.rate, entry.amount);
          } catch (err) {
            log.warn(
              { err, entry },
              'Skipping an FX rate entry that failed to normalize',
            );
            return;
          }
          ratesByIso[entry.iso] = amdPerUnit;
          const currency = await findCurrencyByCode(entry.iso);
          if (!currency) return; // Not seeded — nothing to persist against.
          try {
            await this.#exchangeRateRepository.upsertRate({
              currencyId: currency.id,
              rateToBase: amdPerUnit,
              rateDate,
            });
          } catch (err) {
            log.warn(
              { err, iso: entry.iso },
              'Failed to persist a fetched FX rate as last-known-good',
            );
          }
        }),
    );

    return { ratesByIso, rateDate };
  }

  /**
   * Public: the current display-conversion rate set (brief §13's public
   * API shape, minus the DTO's snake_case — see `fxDto.js`).
   * @returns {Promise<{baseCurrency: string, rates: Record<string, string>, effectiveAt: string|null, source: string}>}
   */
  async getRates() {
    const cached = await this.#readCache();
    if (cached) return cached;

    const { ratesByIso: liveRates, rateDate: liveRateDate } =
      await this.#fetchLive();
    const lastKnownGoodByCurrencyId = await this.#exchangeRateRepository
      .findLatestForAllCurrencies()
      .catch((err) => {
        log.warn({ err }, 'Failed to read last-known-good FX rates');
        return new Map();
      });

    const rates = { [BASE_CURRENCY]: '1.00000000' };
    let effectiveAt = null;
    let usedLastKnownGood = false;

    await Promise.all(
      SUPPORTED_DISPLAY_CURRENCIES.map(async (iso) => {
        if (liveRates[iso]) {
          rates[iso] = liveRates[iso];
          effectiveAt = effectiveAt ?? liveRateDate;
          return;
        }
        const currency = await findCurrencyByCode(iso);
        const lastKnownGood =
          currency && lastKnownGoodByCurrencyId.get(currency.id);
        if (lastKnownGood) {
          rates[iso] = lastKnownGood.rateToBase;
          usedLastKnownGood = true;
          effectiveAt =
            effectiveAt ?? String(lastKnownGood.rateDate).slice(0, 10);
        }
        // else: no last-known-good has ever existed for this currency —
        // it is simply omitted (brief §12), never invented.
      }),
    );

    const result = {
      baseCurrency: BASE_CURRENCY,
      rates,
      effectiveAt,
      source: usedLastKnownGood ? 'last-known-good' : this.#provider.code,
    };
    await this.#writeCache(result);
    return result;
  }
}

export default ExchangeRateService;
