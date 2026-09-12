/**
 * FixtureExchangeRateProvider — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Deterministic, no-network provider matching `CbaExchangeRateProvider`'s
 * exact interface (`code`, `fetchLatestRates()`), used automatically in
 * `NODE_ENV=test` (see `config/index.js`'s `fx.provider`) so CI/prerender
 * never depends on api.cba.am's live availability (brief §29) — mirrors
 * `modules/ai/providers/localHeuristicProvider.js`'s identical role for
 * the AI provider registry.
 */

const DEFAULT_RATES = Object.freeze([
  { iso: 'USD', amount: '1', rate: '400.00' },
  { iso: 'RUB', amount: '1', rate: '4.50' },
]);

export class FixtureExchangeRateProvider {
  #rates;

  #currentDate;

  constructor({
    rates = DEFAULT_RATES,
    currentDate = '2026-01-01T00:00:00',
  } = {}) {
    this.#rates = rates;
    this.#currentDate = currentDate;
  }

  // eslint-disable-next-line class-methods-use-this
  get code() {
    return 'fixture';
  }

  async fetchLatestRates() {
    return { currentDate: this.#currentDate, rates: this.#rates };
  }
}

export default FixtureExchangeRateProvider;
