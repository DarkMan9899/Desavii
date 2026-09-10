/**
 * Input — COMPONENT_LIBRARY.md Part II §2 "Input".
 *
 * Controlled exclusively (FRONTEND_ARCHITECTURE.md §8.2): `value` and
 * `onChange` are both required so a parent always owns and can validate
 * the current field state (e.g. via React Hook Form's `Controller`).
 *
 * Any prop not named below (`onKeyDown`, `role`, `aria-*`, `autoComplete`,
 * ...) is forwarded straight to the native `<input>` — the same
 * polymorphic-forwarding rationale the `layout` primitives already use
 * (see `Stack.jsx`'s file header), needed here for consumers building a
 * combobox/autocomplete on top of this field without re-implementing its
 * label/error/icon chrome.
 *
 * Wrapped in `forwardRef` so React Hook Form's `Controller` (which passes
 * a `ref` callback down for its own focus-on-error/native-validation
 * integration) attaches to the real `<input>` instead of silently no-op'ing
 * — a bare function component drops any `ref` prop before it reaches here.
 */

import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import FieldWrapper from '../internal/FieldWrapper.jsx';
import styles from './Input.module.scss';

const SIZES = ['sm', 'md', 'lg'];
const TYPES = [
  'text',
  'email',
  'password',
  'number',
  'tel',
  'time',
  'date',
  'datetime-local',
  'url',
];

const Input = forwardRef(function Input(
  {
    value,
    onChange,
    onBlur = undefined,
    onFocus = undefined,
    label = undefined,
    placeholder = undefined,
    helperText = undefined,
    error = undefined,
    size = 'md',
    disabled = false,
    iconLeft = undefined,
    iconRight = undefined,
    type = 'text',
    id = undefined,
    name = undefined,
    required = false,
    ...rest
  },
  ref,
) {
  return (
    <FieldWrapper
      id={id}
      label={label}
      required={required}
      disabled={disabled}
      size={size}
      error={error}
      helperText={helperText}
    >
      {({ id: fieldId, describedBy }) => (
        <span
          className={[
            styles.inputWrapper,
            styles[`inputWrapper--${size}`],
            error && styles['inputWrapper--error'],
            disabled && styles['inputWrapper--disabled'],
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {iconLeft && (
            <span className={styles.icon} aria-hidden="true">
              {iconLeft}
            </span>
          )}
          <input
            ref={ref}
            id={fieldId}
            name={name}
            type={type}
            className={styles.input}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            // See file header: forwards arbitrary DOM attributes/handlers.
            // eslint-disable-next-line react/jsx-props-no-spreading
            {...rest}
          />
          {iconRight && (
            <span className={styles.icon} aria-hidden="true">
              {iconRight}
            </span>
          )}
        </span>
      )}
    </FieldWrapper>
  );
});

/* eslint-disable react/require-default-props -- every optional prop below
   already has an ES6 default in the destructured params on the
   forwardRef-wrapped function above; eslint-plugin-react's default-props
   check doesn't associate propTypes on a forwardRef object with defaults
   declared on its inner render function. */
Input.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  onFocus: PropTypes.func,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  helperText: PropTypes.string,
  error: PropTypes.string,
  size: PropTypes.oneOf(SIZES),
  disabled: PropTypes.bool,
  iconLeft: PropTypes.node,
  iconRight: PropTypes.node,
  type: PropTypes.oneOf(TYPES),
  id: PropTypes.string,
  name: PropTypes.string,
  required: PropTypes.bool,
};
/* eslint-enable react/require-default-props */

export default Input;
export { SIZES as INPUT_SIZES, TYPES as INPUT_TYPES };
