/**
 * Select / Dropdown — COMPONENT_LIBRARY.md Part II §2 "Select / Dropdown".
 *
 * Custom-styled, never the native browser <select> — the trigger is a
 * `role="button"` div (not a native <button>) so that, in multi-select
 * mode, each selected chip's own remove <button> can be nested inside it
 * without creating an invalid button-in-button HTML structure.
 *
 * Simplifications made against the full spec, given no shared Tag/Icon/
 * Modal primitives exist yet in this sprint's scope:
 *  - Multi-select chips are a local, minimal chip element rather than
 *    the shared Tag primitive (Tag isn't built yet).
 *  - The Mobile "full-screen sheet" behaviour is a fixed, pinned-to-
 *    bottom panel (no backdrop/focus-trap) rather than a full modal —
 *    the shared Modal/Drawer primitive this would normally compose with
 *    isn't part of this sprint's scope either.
 *
 * Wrapped in `forwardRef` for the same reason `Input`/`Textarea` already
 * are (see `Input.jsx`'s own header) — React Hook Form's `Controller`
 * passes a `ref` down for its focus-on-error integration, and a bare
 * function component drops it before it reaches here, which is exactly
 * the "Function components cannot be given refs" warning every
 * `Controller`-wrapped `Select` (partner listing type, category, etc.)
 * produced. Unlike `Input`, this component already keeps its own
 * internal `triggerRef` (the div it moves focus back to on close/Escape)
 * — `setTriggerRef` below writes to both that ref and whatever the
 * caller forwarded, so neither loses the DOM node.
 */

import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Label from '../Label/Label.jsx';
import styles from './Select.module.scss';

const SIZES = ['sm', 'md', 'lg'];
const SEARCHABLE_THRESHOLD = 8;

const optionShape = PropTypes.shape({
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
});

function ChevronIcon({ open }) {
  return (
    <svg
      className={[styles.chevron, open && styles['chevron--open']]
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
ChevronIcon.propTypes = { open: PropTypes.bool.isRequired };

function CheckIcon() {
  return (
    <svg
      className={styles.checkIcon}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const Select = forwardRef(function Select(
  {
    options,
    value = undefined,
    onChange,
    multiple = false,
    searchable = false,
    label = undefined,
    ariaLabel = undefined,
    error = undefined,
    size = 'md',
    disabled = false,
    placeholder = 'Select…',
    required = false,
    id = undefined,
    searchPlaceholder = 'Search…',
    noOptionsMessage = 'No results',
    getRemoveChipLabel = (optionLabel) => `Remove ${optionLabel}`,
  },
  forwardedRef,
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);

  function setTriggerRef(node) {
    triggerRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      // eslint-disable-next-line no-param-reassign -- the documented way
      // to write to an object ref forwarded by a caller (e.g. React Hook
      // Form's Controller); it is not this component's own prop.
      forwardedRef.current = node;
    }
  }
  const generatedId = useId();
  const fieldId = id || generatedId;
  const listboxId = `${fieldId}-listbox`;
  const errorId = `${fieldId}-error`;
  const labelId = `${fieldId}-label`;

  const isSearchable = searchable || options.length > SEARCHABLE_THRESHOLD;
  const selectedValues = useMemo(() => {
    if (!multiple) return [];
    return Array.isArray(value) ? value : [];
  }, [multiple, value]);

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !query) return options;
    const q = query.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query, isSearchable]);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && isSearchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, isSearchable]);

  function closePanel() {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    if (triggerRef.current) triggerRef.current.focus();
  }

  function selectOption(option) {
    if (!option || option.disabled) return;
    if (multiple) {
      const isSelected = selectedValues.includes(option.value);
      const next = isSelected
        ? selectedValues.filter((v) => v !== option.value)
        : [...selectedValues, option.value];
      onChange(next);
    } else {
      onChange(option.value);
      closePanel();
    }
  }

  function removeValue(optionValue, event) {
    event.stopPropagation();
    onChange(selectedValues.filter((v) => v !== optionValue));
  }

  function enabledIndices() {
    return filteredOptions
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index !== -1);
  }

  function moveActive(delta) {
    setActiveIndex((current) => {
      const indices = enabledIndices();
      if (indices.length === 0) return current;
      const currentPos = indices.indexOf(current);
      let nextPos;
      if (currentPos === -1) {
        nextPos = delta > 0 ? 0 : indices.length - 1;
      } else {
        nextPos = (currentPos + delta + indices.length) % indices.length;
      }
      return indices[nextPos];
    });
  }

  function jumpToLetter(letter) {
    const indices = enabledIndices();
    const startPos = Math.max(indices.indexOf(activeIndex), -1) + 1;
    const ordered = [...indices.slice(startPos), ...indices.slice(0, startPos)];
    const match = ordered.find((index) =>
      filteredOptions[index].label
        .toLowerCase()
        .startsWith(letter.toLowerCase()),
    );
    if (match !== undefined) setActiveIndex(match);
  }

  function handleTriggerKeyDown(event) {
    if (disabled) return;

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (activeIndex >= 0) selectOption(filteredOptions[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        closePanel();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (!isSearchable && event.key.length === 1) {
          jumpToLetter(event.key);
        }
        break;
    }
  }

  function triggerLabel() {
    if (multiple) return null;
    const selected = options.find((option) => option.value === value);
    return selected ? selected.label : placeholder;
  }

  const isPlaceholder = multiple
    ? selectedValues.length === 0
    : value === null || value === undefined;

  return (
    <div className={styles.field} ref={containerRef}>
      {label && (
        <Label
          htmlFor={fieldId}
          id={labelId}
          required={required}
          disabled={disabled}
          size={size}
        >
          {label}
        </Label>
      )}
      <div className={styles.wrapper}>
        <div
          id={fieldId}
          ref={setTriggerRef}
          data-testid="select-trigger"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-describedby={error ? errorId : undefined}
          aria-disabled={disabled || undefined}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          className={[
            styles.trigger,
            styles[`trigger--${size}`],
            error && styles['trigger--error'],
            disabled && styles['trigger--disabled'],
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          onKeyDown={handleTriggerKeyDown}
        >
          {multiple ? (
            <span className={styles.chips}>
              {selectedValues.length === 0 && (
                <span className={styles.placeholder}>{placeholder}</span>
              )}
              {selectedValues.map((selectedValue) => {
                const option = options.find((o) => o.value === selectedValue);
                if (!option) return null;
                return (
                  <span key={selectedValue} className={styles.chip}>
                    <span className={styles.chipLabel}>{option.label}</span>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      aria-label={getRemoveChipLabel(option.label)}
                      onClick={(event) => removeValue(selectedValue, event)}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className={isPlaceholder ? styles.placeholder : styles.value}>
              {triggerLabel()}
            </span>
          )}
          <ChevronIcon open={open} />
        </div>

        {open && (
          <div className={styles.panel}>
            {isSearchable && (
              <input
                ref={searchInputRef}
                type="text"
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleTriggerKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            )}
            <ul
              id={listboxId}
              role="listbox"
              tabIndex={0}
              aria-multiselectable={multiple || undefined}
              aria-labelledby={label ? labelId : undefined}
              aria-label={!label ? ariaLabel : undefined}
              className={styles.list}
            >
              {filteredOptions.length === 0 && (
                <li role="presentation" className={styles.empty}>
                  {noOptionsMessage}
                </li>
              )}
              {filteredOptions.map((option, index) => {
                const isSelected = multiple
                  ? selectedValues.includes(option.value)
                  : option.value === value;
                return (
                  // Keyboard operability is provided at the trigger/container level via
                  // aria-activedescendant + handleTriggerKeyDown (WAI-ARIA listbox
                  // pattern); these rows are intentionally never focused directly, so a
                  // per-row onKeyDown would be dead code. onClick remains for pointer users.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    className={[
                      styles.option,
                      isSelected && styles['option--selected'],
                      index === activeIndex && styles['option--active'],
                      option.disabled && styles['option--disabled'],
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span>{option.label}</span>
                    {isSelected && <CheckIcon />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

/* eslint-disable react/require-default-props -- every optional prop below
   already has an ES6 default in the destructured params on the
   forwardRef-wrapped function above; eslint-plugin-react's default-props
   check doesn't associate propTypes on a forwardRef object with defaults
   declared on its inner render function (see Input.jsx's identical note). */
Select.propTypes = {
  options: PropTypes.arrayOf(optionShape).isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.arrayOf(
      PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    ),
  ]),
  onChange: PropTypes.func.isRequired,
  multiple: PropTypes.bool,
  searchable: PropTypes.bool,
  label: PropTypes.string,
  // Used as the trigger's accessible name only when no visible `label`
  // is rendered — e.g. a compact bar where a separate label line would
  // waste vertical space, but the trigger still needs a name for AT.
  ariaLabel: PropTypes.string,
  error: PropTypes.string,
  size: PropTypes.oneOf(SIZES),
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  id: PropTypes.string,
  searchPlaceholder: PropTypes.string,
  noOptionsMessage: PropTypes.string,
  getRemoveChipLabel: PropTypes.func,
};
/* eslint-enable react/require-default-props */

export default Select;
export { SIZES as SELECT_SIZES };
