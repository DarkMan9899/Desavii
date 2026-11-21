/**
 * QuantityStepper — a labelled whole-number field with − / + buttons
 * (docs/BOOKING_WIDGET_REBUILD.md §4, W-10). The number stays a real,
 * labelled input, so it can be typed and is read by assistive technology
 * as "Rooms, 2"; the buttons name what they change ("Fewer rooms" reads as
 * "Decrease Rooms") and are disabled at the bounds instead of silently
 * doing nothing.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import styles from './QuantityStepper.module.scss';

export default function QuantityStepper({
  label,
  value,
  onChange,
  min = 1,
  max = undefined,
  disabled = false,
  helperText = undefined,
  compact = false,
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const helperId = useId();
  const atMin = value <= min;
  const atMax = max !== undefined && max !== null && value >= max;

  return (
    <div className={compact ? styles.compact : styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <button
          type="button"
          className={styles.step}
          aria-label={t('pages.listingDetail.reservation.stepper.decrease', {
            label,
          })}
          aria-controls={inputId}
          disabled={disabled || atMin}
          onClick={() => onChange(value - 1)}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          className={styles.input}
          value={value}
          min={min}
          max={max ?? undefined}
          disabled={disabled}
          aria-describedby={helperText ? helperId : undefined}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          className={styles.step}
          aria-label={t('pages.listingDetail.reservation.stepper.increase', {
            label,
          })}
          aria-controls={inputId}
          disabled={disabled || atMax}
          onClick={() => onChange(value + 1)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {helperText && (
        <p id={helperId} className={styles.helper}>
          {helperText}
        </p>
      )}
    </div>
  );
}

QuantityStepper.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  disabled: PropTypes.bool,
  helperText: PropTypes.string,
  compact: PropTypes.bool,
};
