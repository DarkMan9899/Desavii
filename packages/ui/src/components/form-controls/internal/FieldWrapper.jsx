/**
 * FieldWrapper — private, shared chrome for Input and Textarea.
 *
 * Not part of the public @desavii/ui API (not re-exported from any
 * barrel). COMPONENT_LIBRARY.md's Textarea entry states its
 * States/Accessibility/Animation are "identical to Input" and its
 * Dependencies are "Input's shared styling base" — this component is
 * that shared base, implemented once so the label/helperText/error
 * wiring (FRONTEND_ARCHITECTURE.md §8.3: "accessibility is not a prop
 * you opt into") can never drift between the two fields.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import Label from '../Label/Label.jsx';
import styles from './FieldWrapper.module.scss';

function ErrorIcon() {
  return (
    <svg
      className={styles.errorIcon}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.75 4.5a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4ZM10 13.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z"
      />
    </svg>
  );
}

export default function FieldWrapper({
  id = undefined,
  label = undefined,
  required = false,
  disabled = false,
  size = 'md',
  error = undefined,
  helperText = undefined,
  // Step L2 — `{ current, max }`: an optional live character count for a
  // bounded text field (`Input`/`Textarea`'s own `maxLength`). Rendered
  // as a plain, non-`aria-live` paragraph — referenced by
  // `aria-describedby` so a screen-reader user can check it deliberately
  // (e.g. "read description"), but never announced on every keystroke
  // the way a live region would (brief §23's "no excessive
  // screen-reader noise").
  characterCount = undefined,
  children,
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;
  const countId = `${fieldId}-count`;
  // Only reference an id that is actually rendered below — helperText/
  // characterCount are suppressed while an error is present, so they
  // must drop out of aria-describedby too, or the attribute would point
  // at a non-existent element.
  const describedBy =
    [
      error ? errorId : null,
      helperText && !error ? helperId : null,
      characterCount && !error ? countId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={styles.field}>
      {label && (
        <Label
          htmlFor={fieldId}
          required={required}
          disabled={disabled}
          size={size}
        >
          {label}
        </Label>
      )}
      {children({ id: fieldId, describedBy, hasError: Boolean(error) })}
      {(helperText || characterCount) && !error && (
        <div className={styles.footer}>
          {helperText && (
            <p id={helperId} className={styles.helperText}>
              {helperText}
            </p>
          )}
          {characterCount && (
            <p id={countId} className={styles.characterCount}>
              {characterCount.current}/{characterCount.max}
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
  );
}

FieldWrapper.propTypes = {
  id: PropTypes.string,
  label: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  error: PropTypes.string,
  helperText: PropTypes.string,
  characterCount: PropTypes.shape({
    current: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
  }),
  children: PropTypes.func.isRequired,
};
