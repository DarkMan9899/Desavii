/**
 * Textarea — COMPONENT_LIBRARY.md Part II §2 "Textarea".
 * "identical to Input" for States/Accessibility/Animation, built on the
 * same FieldWrapper base as Input (see that component's file header).
 *
 * Wrapped in `forwardRef` for the same reason as `Input` (see that
 * component's file header): React Hook Form's `Controller` passes a
 * `ref` callback down for its focus-on-error integration, and a bare
 * function component silently drops it before it reaches the real
 * `<textarea>`.
 */

import { useEffect, useRef, forwardRef } from 'react';
import PropTypes from 'prop-types';
import FieldWrapper from '../internal/FieldWrapper.jsx';
import styles from './Textarea.module.scss';

const SIZES = ['sm', 'md', 'lg'];

const Textarea = forwardRef(function Textarea(
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
    rows = 4,
    autoResize = false,
    id = undefined,
    name = undefined,
    required = false,
    maxLength = undefined,
  },
  forwardedRef,
) {
  const localRef = useRef(null);

  useEffect(() => {
    if (!autoResize || !localRef.current) return;
    const el = localRef.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, autoResize]);

  return (
    <FieldWrapper
      id={id}
      label={label}
      required={required}
      disabled={disabled}
      size={size}
      error={error}
      helperText={helperText}
      // Step L2 — see `Input.jsx`'s identical rationale.
      characterCount={
        maxLength != null
          ? { current: value.length, max: maxLength }
          : undefined
      }
    >
      {({ id: fieldId, describedBy }) => (
        <textarea
          ref={(node) => {
            localRef.current = node;
            if (typeof forwardedRef === 'function') {
              forwardedRef(node);
            } else if (forwardedRef) {
              forwardedRef.current = node;
            }
          }}
          id={fieldId}
          name={name}
          rows={rows}
          className={[
            styles.textarea,
            styles[`textarea--${size}`],
            error && styles['textarea--error'],
            autoResize && styles['textarea--auto-resize'],
          ]
            .filter(Boolean)
            .join(' ')}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldWrapper>
  );
});

/* eslint-disable react/require-default-props -- every optional prop below
   already has an ES6 default in the destructured params on the
   forwardRef-wrapped function above; eslint-plugin-react's default-props
   check doesn't associate propTypes on a forwardRef object with defaults
   declared on its inner render function. */
Textarea.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  onFocus: PropTypes.func,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  helperText: PropTypes.string,
  error: PropTypes.string,
  size: PropTypes.oneOf(SIZES),
  disabled: PropTypes.bool,
  rows: PropTypes.number,
  autoResize: PropTypes.bool,
  id: PropTypes.string,
  name: PropTypes.string,
  required: PropTypes.bool,
  maxLength: PropTypes.number,
};
/* eslint-enable react/require-default-props */

export default Textarea;
export { SIZES as TEXTAREA_SIZES };
