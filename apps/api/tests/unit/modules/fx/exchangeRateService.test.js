/**
 * Pass 8 (Multi-Currency / CBA FX Pricing) — `ExchangeRateService`
 * orchestration: cache-aside, live-fetch normalization/persistence, and
 * the brief §11/§12 last-known-good fallback chain, down to "no
 * last-known-good has ever existed" (never invented, simply omitted).
 *
 * `findCurrencyByCode` is mocked at the module boundary (it calls
 * `getMysqlPool()` internally, which this unit test never wants to
 * touch) — everything else (`provider`, `exchangeRateRepository`,
 * `redis`) is injected directly via the constructor, so only this one
 * cross-cutting dependency needs `jest.unstable_mockModule`.
 */

import { describe, test, expect, jest, afterEach } from '@jest/globals';

const CURRENCY_REPOSITORY_PATH =
  '../../../../src/infrastructure/database/repositories/currencyRepository.js';
const SERVICE_PATH =
  '../../../../src/modules/fx/services/exchangeRateService.js';

const CURRENCIES = {
  AMD: { id: 1, code: 'AMD', decimalPlaces: 2 },
  USD: { id: 2, code: 'USD', decimalPlaces: 2 },
  RUB: { id: 3, code: 'RUB', decimalPlaces: 2 },
};

function noopRedis() {
  return { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
}

async function loadService() {
  jest.unstable_mockModule(CURRENCY_REPOSITORY_PATH, () => ({
    findCurrencyByCode: jest.fn(async (code) => CURRENCIES[code] ?? null),
  }));
  const { ExchangeRateService } = await import(SERVICE_PATH);
  return ExchangeRateService;
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock(CURRENCY_REPOSITORY_PATH);
});

describe('ExchangeRateService', () => {
  test('a cache hit is returned as-is, without calling the provider', async () => {
    const ExchangeRateService = await loadService();
    const cached = {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000', USD: '400.00000000' },
      effectiveAt: '2026-09-01',
      source: 'cba',
    };
    const provider = { code: 'cba', fetchLatestRates: jest.fn() };
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify(cached)),
      set: jest.fn(),
    };
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: { findLatestForAllCurrencies: jest.fn() },
      redis,
    });

    const result = await service.getRates();
    expect(result).toEqual(cached);
    expect(provider.fetchLatestRates).not.toHaveBeenCalled();
  });

  test('cache miss + successful live fetch: normalizes (Amount != 1), persists, and caches the result', async () => {
    const ExchangeRateService = await loadService();
    const provider = {
      code: 'cba',
      fetchLatestRates: jest.fn().mockResolvedValue({
        currentDate: '2026-09-12',
        rates: [
          { iso: 'USD', amount: '1', rate: '363.28' },
          // Amount != 1 — must normalize to 23.597 / 10 = 2.35970000.
          { iso: 'RUB', amount: '10', rate: '23.597' },
        ],
      }),
    };
    const upsertRate = jest.fn().mockResolvedValue();
    const redis = noopRedis();
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: {
        upsertRate,
        findLatestForAllCurrencies: jest.fn().mockResolvedValue(new Map()),
      },
      redis,
    });

    const result = await service.getRates();

    expect(result.baseCurrency).toBe('AMD');
    expect(result.rates.AMD).toBe('1.00000000');
    expect(result.rates.USD).toBe('363.28000000');
    expect(result.rates.RUB).toBe('2.35970000');
    expect(result.source).toBe('cba');
    expect(result.effectiveAt).toBe('2026-09-12');

    expect(upsertRate).toHaveBeenCalledWith({
      currencyId: CURRENCIES.USD.id,
      rateToBase: '363.28000000',
      rateDate: '2026-09-12',
    });
    expect(upsertRate).toHaveBeenCalledWith({
      currencyId: CURRENCIES.RUB.id,
      rateToBase: '2.35970000',
      rateDate: '2026-09-12',
    });
    expect(redis.set).toHaveBeenCalled();
  });

  test('total provider failure falls back to last-known-good for every currency that has one', async () => {
    const ExchangeRateService = await loadService();
    const provider = {
      code: 'cba',
      fetchLatestRates: jest.fn().mockRejectedValue(new Error('CBA is down')),
    };
    const lastKnownGood = new Map([
      [
        CURRENCIES.USD.id,
        { rateToBase: '360.00000000', rateDate: '2026-09-10' },
      ],
      [CURRENCIES.RUB.id, { rateToBase: '4.40000000', rateDate: '2026-09-10' }],
    ]);
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: {
        findLatestForAllCurrencies: jest.fn().mockResolvedValue(lastKnownGood),
      },
      redis: noopRedis(),
    });

    const result = await service.getRates();

    expect(result.source).toBe('last-known-good');
    expect(result.rates.USD).toBe('360.00000000');
    expect(result.rates.RUB).toBe('4.40000000');
    expect(result.effectiveAt).toBe('2026-09-10');
  });

  test('a currency with NO last-known-good ever (and a failed live fetch) is simply omitted — never invented', async () => {
    const ExchangeRateService = await loadService();
    const provider = {
      code: 'cba',
      fetchLatestRates: jest.fn().mockRejectedValue(new Error('CBA is down')),
    };
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: {
        findLatestForAllCurrencies: jest.fn().mockResolvedValue(new Map()),
      },
      redis: noopRedis(),
    });

    const result = await service.getRates();

    expect(result.rates.AMD).toBe('1.00000000');
    expect(result.rates.USD).toBeUndefined();
    expect(result.rates.RUB).toBeUndefined();
    expect(result.effectiveAt).toBeNull();
  });

  test('a Redis read error falls through to a live fetch instead of throwing', async () => {
    const ExchangeRateService = await loadService();
    const provider = {
      code: 'cba',
      fetchLatestRates: jest.fn().mockResolvedValue({
        currentDate: '2026-09-12',
        rates: [{ iso: 'USD', amount: '1', rate: '363.28' }],
      }),
    };
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      set: jest.fn(),
    };
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: {
        upsertRate: jest.fn().mockResolvedValue(),
        findLatestForAllCurrencies: jest.fn().mockResolvedValue(new Map()),
      },
      redis,
    });

    const result = await service.getRates();
    expect(result.rates.USD).toBe('363.28000000');
  });

  test('a Redis write error never fails the request — the resolved rates are still returned', async () => {
    const ExchangeRateService = await loadService();
    const provider = {
      code: 'cba',
      fetchLatestRates: jest.fn().mockResolvedValue({
        currentDate: '2026-09-12',
        rates: [{ iso: 'USD', amount: '1', rate: '363.28' }],
      }),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockRejectedValue(new Error('write failed')),
    };
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: {
        upsertRate: jest.fn().mockResolvedValue(),
        findLatestForAllCurrencies: jest.fn().mockResolvedValue(new Map()),
      },
      redis,
    });

    await expect(service.getRates()).resolves.toMatchObject({
      rates: { USD: '363.28000000' },
    });
  });

  test('a malformed individual rate entry from the provider is skipped rather than failing the whole response', async () => {
    const ExchangeRateService = await loadService();
    const provider = {
      code: 'cba',
      fetchLatestRates: jest.fn().mockResolvedValue({
        currentDate: '2026-09-12',
        rates: [
          { iso: 'USD', amount: '1', rate: '363.28' },
          // Zero amount -> normalizeAmdPerUnit throws -> this entry is
          // dropped, USD is still resolved normally.
          { iso: 'RUB', amount: '0', rate: '5.00' },
        ],
      }),
    };
    const service = new ExchangeRateService({
      provider,
      exchangeRateRepository: {
        upsertRate: jest.fn().mockResolvedValue(),
        findLatestForAllCurrencies: jest.fn().mockResolvedValue(new Map()),
      },
      redis: noopRedis(),
    });

    const result = await service.getRates();
    expect(result.rates.USD).toBe('363.28000000');
    expect(result.rates.RUB).toBeUndefined();
  });
});
