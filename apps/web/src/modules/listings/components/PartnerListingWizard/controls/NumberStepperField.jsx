/**
 * NumberStepperField — the "Number inputs / Stepper controls" branch of
 * `MetadataFieldRenderer` (INTEGER/DECIMAL attributes — bedrooms,
 * bathrooms, seats, duration, group size, ...). Not
 * `@desavii/ui`'s primitive registry: it's a thin composition of
 * `Label` + `Button` (both reused as-is, no forked copies) around a
 * plain native number input, since neither primitive exposes an
 * interactive-icon slot — `Input`'s `iconLeft`/`iconRight` are wrapped
 * `aria-hidden="true"` (decorative-icon only, per that component's own
 * implementation), so a real +/- button can't live there without
 * becoming a keyboard/screen-reader trap.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { Label } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import styles from './NumberStepperField.module.scss';

// Step L4 (brief §18) — a plain decimal string only (optional leading
// `-`, digits, optional single `.`, digits), permissive enough to match
// every legitimate intermediate typing state ("", "-", "1.", ...).
// Structurally cannot match anything containing `e`/`E`/`+`, so
// scientific notation ("1e3") is rejected before `Number()` ever sees
// it — `Number("1e3")` is a normal finite number (1000), so the
// existing `Number.isFinite` guard alone can't tell a deliberate large
// integer from an accidental "e" keystroke a native `type="number"`
// input happily accepts.
const PLAIN_DECIMAL_STRING_PATTERN = /^-?\d*\.?\d*$/;

export default function NumberStepperField({
  label,
  unit = undefined,
  min = undefined,
  max = undefined,
  step = 1,
  value = undefined,
  onChange,
  error = undefined,
  required = false,
  disabled = false,
  integerOnly = false,
  decreaseAriaLabel,
  increaseAriaLabel,
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const current = value ?? min ?? 0;

  function clamp(next) {
    if (!Number.isFinite(next)) return;
    let result = next;
    if (min != null) result = Math.max(min, result);
    if (max != null) result = Math.min(max, result);
    onChange(result);
  }

  // Step L4 (brief §12, §18) — the typed-input path only (the +/- step
  // buttons below already always move by exactly `step`, which for the
  // `step={1}` an INTEGER attribute is given can never itself produce a
  // fraction). A malformed or (for an INTEGER attribute) fractional
  // value is rejected outright — the same "invalid input, don't call
  // onChange" convention `clamp`'s own non-finite guard already
  // established — never silently rounded/truncated into a different
  // number the Partner didn't type.
  function handleTypedChange(event) {
    const raw = event.target.value;
    if (!PLAIN_DECIMAL_STRING_PATTERN.test(raw)) return;
    const next = Number(raw);
    if (integerOnly && Number.isFinite(next) && !Number.isInteger(next)) {
      return;
    }
    clamp(next);
  }

  return (
    <div className={styles.field}>
      <Label htmlFor={fieldId} required={required} disabled={disabled}>
        {label}
      </Label>
      <div className={styles.row}>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || (min != null && current <= min)}
          ariaLabel={decreaseAriaLabel}
          onClick={() => clamp(current - step)}
        >
          −
        </Button>
        <input
          id={fieldId}
          type="number"
          className={styles.input}
          value={current}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? 'true' : undefined}
          onChange={handleTypedChange}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || (max != null && current >= max)}
          ariaLabel={increaseAriaLabel}
          onClick={() => clamp(current + step)}
        >
          +
        </Button>
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

NumberStepperField.propTypes = {
  label: PropTypes.string.isRequired,
  unit: PropTypes.string,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  integerOnly: PropTypes.bool,
  decreaseAriaLabel: PropTypes.string.isRequired,
  increaseAriaLabel: PropTypes.string.isRequired,
};
