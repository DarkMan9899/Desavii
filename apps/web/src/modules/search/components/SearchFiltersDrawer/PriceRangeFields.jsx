/**
 * PriceRangeFields — minimum/maximum "from" price, in AMD. Prices are
 * authored in AMD only, and the filter compares against exactly the
 * price each card shows as "from", so the inputs say AMD rather than
 * pretending to filter in the visitor's display currency (which would
 * need a conversion the filter itself never does).
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input } from '@desavii/ui/components/form-controls';
import styles from './SearchFiltersDrawer.module.scss';

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

  return (
    <div
      role="group"
      aria-label={t('search.filters.sections.price')}
      aria-describedby={hintId}
      className={styles.priceFields}
    >
      <div className={styles.priceInputs}>
        <Input
          type="text"
          inputMode="numeric"
          label={t('search.filters.price.minLabel')}
          value={priceMin}
          onChange={(event) => onChange({ priceMin: toDigits(event) })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Input
          type="text"
          inputMode="numeric"
          label={t('search.filters.price.maxLabel')}
          value={priceMax}
          onChange={(event) => onChange({ priceMax: toDigits(event) })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
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
