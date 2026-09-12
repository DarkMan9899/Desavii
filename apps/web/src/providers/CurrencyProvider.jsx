/**
 * CurrencyProvider — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Mounted inside `routes/index.jsx`'s `LocaleValidator` (not
 * `AppProviders.jsx`) — the same reasoning `LanguageSwitcher.jsx`'s own
 * header already documents for locale itself: the URL's `:locale`
 * segment is the authoritative source, and `LocaleValidator` is the one
 * place every locale-prefixed route already passes through. `locale` is
 * passed in as a prop (the caller already resolved it via `useParams()`)
 * rather than this component re-deriving it, so it stays testable without
 * a Router.
 *
 * Default-vs-override model (brief §6, "explicit, clearly-modeled
 * distinction"): `currencyPreference.js` never stores anything for the
 * locale-derived default — only an explicit `setCurrency` call ever
 * writes to `localStorage`. So:
 *   - no stored value -> `currency` is always
 *     `getDefaultCurrencyForLocale(locale)`, recomputed on every locale
 *     change (a fresh visit in a new locale gets that locale's default).
 *   - a stored value -> `currency` is that value, on EVERY locale,
 *     forever, until the customer explicitly picks a different one. A
 *     later locale switch never silently reverts it — documented here as
 *     this pass's deliberate resolution of the brief's "survives...
 *     unless documented otherwise" clause.
 *
 * `rates` (`GET /fx/rates`, brief §13) is fetched once here and read by
 * every `<Money>` consumer via context — never a request-per-price-render
 * (brief §11). A fetch failure leaves `rates` `null`; `formatMoney`
 * already falls back to AMD display when a rate it needs is missing, so
 * no consumer needs its own error handling for this.
 */

import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import CurrencyContext from '../contexts/CurrencyContext.jsx';
import * as fxApi from '../api/fx.js';
import { getDefaultCurrencyForLocale } from '../utils/currencyPolicy.js';
import {
  getCurrencyOverride,
  setCurrencyOverride,
} from '../utils/currencyPreference.js';

// CBA publishes rates roughly daily — matches the backend's own ~hourly
// cache TTL (`config.fx.rateCacheTtlSeconds`) closely enough that this
// never re-fetches faster than the backend could possibly have a new
// value, while still refreshing well within a single browsing session.
const RATES_STALE_TIME_MS = 60 * 60 * 1000;

export default function CurrencyProvider({ locale, children }) {
  const [override, setOverride] = useState(() => getCurrencyOverride());

  const ratesQuery = useQuery({
    queryKey: ['fx', 'rates'],
    // `fxApi.getRates()` resolves to the raw `{success, data, meta,
    // error}` envelope (every `api/` function does — see api/search.js's
    // own header) — unwrapping to just the payload is this query layer's
    // job, same convention `useCategoriesQuery.js` already follows.
    queryFn: async () => {
      const { data } = await fxApi.getRates();
      return data;
    },
    staleTime: RATES_STALE_TIME_MS,
    retry: false,
  });

  const defaultCurrency = useMemo(
    () => getDefaultCurrencyForLocale(locale),
    [locale],
  );
  const currency = override ?? defaultCurrency;

  const setCurrency = useCallback((nextCurrency) => {
    setCurrencyOverride(nextCurrency);
    setOverride(nextCurrency);
  }, []);

  const value = useMemo(
    () => ({
      currency,
      isExplicitOverride: override !== null,
      setCurrency,
      rates: ratesQuery.data?.rates ?? null,
      ratesSource: ratesQuery.data?.source ?? null,
      ratesEffectiveAt: ratesQuery.data?.effectiveAt ?? null,
    }),
    [currency, override, setCurrency, ratesQuery.data],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

CurrencyProvider.propTypes = {
  locale: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
