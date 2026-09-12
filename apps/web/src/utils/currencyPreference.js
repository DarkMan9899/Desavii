/**
 * Currency-switcher persistence (Pass 8) — mirrors `workspacePreference.js`'s
 * shape (a plain, try/catch-guarded `localStorage` helper, not a Context;
 * `CurrencyProvider` is the only reader/writer). Versioned key (`:v1`) so
 * a later change to the stored shape can be detected and ignored rather
 * than misread.
 *
 * The stored value exists ONLY once a customer has explicitly picked a
 * currency — nothing is ever written here for the locale-derived default
 * (`currencyPolicy.js#getDefaultCurrencyForLocale`). This is the brief's
 * required "explicit override" vs "default derived from locale"
 * distinction: no stored value means "still on the locale default,"
 * recomputed fresh on every locale change; a stored value means "the
 * customer chose this," which a later locale switch must never silently
 * clobber (`CurrencyProvider`'s own header comment explains why).
 */

import { SUPPORTED_CURRENCIES } from './currencyPolicy.js';

const STORAGE_KEY = 'desavii:currency:v1';

export function getCurrencyOverride() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_CURRENCIES.includes(value) ? value : null;
  } catch {
    // Storage unavailable (private browsing, disabled cookies) — treat as
    // "no override recorded," same fallback `workspacePreference.js` uses.
    return null;
  }
}

export function setCurrencyOverride(currency) {
  if (!SUPPORTED_CURRENCIES.includes(currency)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // Ignore — losing this preference is not worth failing the switch
    // action that triggered it.
  }
}

export default { getCurrencyOverride, setCurrencyOverride };
