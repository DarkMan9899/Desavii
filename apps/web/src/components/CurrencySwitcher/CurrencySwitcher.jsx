/**
 * CurrencySwitcher — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Deliberately mirrors `LanguageSwitcher.jsx`'s exact shape (a `role`
 * group of small pressed-state buttons, same SCSS tokens) — the brief's
 * own "fits the existing premium header without a giant control"
 * requirement is best met by reusing a pattern the header already
 * accommodates, not inventing a new visual language next to it.
 *
 * Picking a currency here always sets an explicit override
 * (`CurrencyProvider`'s own header explains why that never gets clobbered
 * by a later locale switch) — there is no "reset to automatic" control in
 * this pass's scope; the brief's three required test sequences only cover
 * fresh-default / override-persists / override-survives-locale-switch,
 * none of which need one.
 */

import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { SUPPORTED_CURRENCIES } from '../../utils/currencyPolicy.js';
import styles from './CurrencySwitcher.module.scss';

export default function CurrencySwitcher() {
  const { t } = useTranslation();
  const { currency, setCurrency } = useCurrency();

  return (
    <div
      role="group"
      aria-label={t('a11y.switchCurrency')}
      className={styles.switcher}
    >
      {SUPPORTED_CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          className={[styles.option, code === currency && styles.optionActive]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={code === currency}
          onClick={() => setCurrency(code)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
