/**
 * PriceRangeFields — minimum/maximum "from" price, in AMD. Every listing
 * is priced in AMD and the filter compares against exactly the "from"
 * price each card shows, so the inputs say AMD rather than pretending to
 * filter in the visitor's display currency (which would need a conversion
 * the filter never does). Presentational: `useSearchDraft` owns the typed
 * text and applies it once typing pauses, and only as a valid range.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input } from '@desavii/ui/components/form-controls';
import styles from './PriceRangeFields.module.scss';

const DIGITS_ONLY = /\D/g;

export default function PriceRangeFields({
  priceMin,
  priceMax,
  onChange,
  error = undefined,
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const errorId = useId();
  const toDigits = (event) => event.target.value.replace(DIGITS_ONLY, '');
  const currency = (
    <span className={styles.currency}>
      {t('search.filters.price.currency')}
    </span>
  );
  const describedBy = [error ? errorId : null, hintId]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="group"
      aria-label={t('search.filters.sections.price')}
      className={styles.priceFields}
    >
      <div className={styles.inputs}>
        <Input
          type="text"
          inputMode="numeric"
          label={t('search.filters.price.minLabel')}
          value={priceMin}
          onChange={(event) => onChange({ priceMin: toDigits(event) })}
          iconRight={currency}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <Input
          type="text"
          inputMode="numeric"
          label={t('search.filters.price.maxLabel')}
          value={priceMax}
          onChange={(event) => onChange({ priceMax: toDigits(event) })}
          iconRight={currency}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p id={hintId} className={styles.hint}>
        {t('search.filters.price.hint')}
      </p>
    </div>
  );
}

PriceRangeFields.propTypes = {
  priceMin: PropTypes.string.isRequired,
  priceMax: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
};
