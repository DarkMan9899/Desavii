/**
 * Multi-currency policy (Pass 8) — the ONE place a locale maps to its
 * default display currency (hy->AMD, en->USD, ru->RUB, per the brief's
 * explicit `getDefaultCurrencyForLocale` requirement). No other file may
 * scatter its own `if (locale === 'en') ...` — everything (the currency
 * switcher's initial value, `CurrencyProvider`, the SSR/prerender path)
 * calls this one function.
 *
 * `SUPPORTED_CURRENCIES` is the same fixed AMD/USD/RUB set the backend
 * enforces (`bookingService.js`'s `ALLOWED_DISPLAY_CURRENCIES`,
 * `bookingValidators.js`'s schema enum) — never an arbitrary ISO code.
 */

export const SUPPORTED_CURRENCIES = ['AMD', 'USD', 'RUB'];
export const BASE_CURRENCY = 'AMD';

const LOCALE_DEFAULT_CURRENCY = {
  hy: 'AMD',
  en: 'USD',
  ru: 'RUB',
};

/** @param {string} locale @returns {'AMD'|'USD'|'RUB'} */
export function getDefaultCurrencyForLocale(locale) {
  return LOCALE_DEFAULT_CURRENCY[locale] ?? BASE_CURRENCY;
}

export default {
  SUPPORTED_CURRENCIES,
  BASE_CURRENCY,
  getDefaultCurrencyForLocale,
};
