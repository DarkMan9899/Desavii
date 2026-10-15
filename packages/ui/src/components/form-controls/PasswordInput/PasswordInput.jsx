/**
 * PasswordInput — an `Input` whose typed password can be shown and hidden
 * with an eye / eye-off button inside the field.
 *
 * - The same `<input>` element stays mounted; only its `type` flips
 *   between `password` and `text`, so the value, a password manager's
 *   autofill (`autoComplete` is forwarded like any other attribute) and
 *   React Hook Form's `ref` all survive the toggle.
 * - The button is `type="button"` (never submits the form), sits after
 *   the input in the tab order, and is named for what it will do next —
 *   `showLabel` / `hideLabel`, which the app passes translated, as
 *   `packages/ui` carries no i18n.
 * - A pointer press on the button keeps focus in the field, and the
 *   caret/selection is restored after the type change, so someone
 *   checking what they typed can keep typing. From the keyboard, focus
 *   stays on the button, as for any button.
 * - Each instance owns its own visibility: a password and its
 *   confirmation are revealed independently.
 */

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Eye, EyeOff } from 'lucide-react';
import Input from '../Input/Input.jsx';
import styles from './PasswordInput.module.scss';

const PasswordInput = forwardRef(function PasswordInput(
  {
    showLabel = 'Show password',
    hideLabel = 'Hide password',
    disabled = false,
    ...inputProps
  },
  forwardedRef,
) {
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef(null);
  const pendingSelection = useRef(null);

  function setInputRef(node) {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      // eslint-disable-next-line no-param-reassign -- the documented way
      // to write to an object ref forwarded by a caller (e.g. React Hook
      // Form's Controller), mirroring Select.jsx's `setTriggerRef`.
      forwardedRef.current = node;
    }
  }

  function toggleVisibility() {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      pendingSelection.current = [input.selectionStart, input.selectionEnd];
    }
    setIsVisible((visible) => !visible);
  }

  // Changing an input's `type` can reset its caret; put it back where the
  // person was typing.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const input = inputRef.current;
    if (!selection || !input) return;
    pendingSelection.current = null;
    input.setSelectionRange(selection[0], selection[1]);
  }, [isVisible]);

  const ToggleIcon = isVisible ? EyeOff : Eye;

  return (
    <Input
      // A thin specialization of Input: every other Input prop passes through.
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...inputProps}
      ref={setInputRef}
      type={isVisible ? 'text' : 'password'}
      disabled={disabled}
      trailingAction={
        <button
          type="button"
          className={styles.toggle}
          aria-label={isVisible ? hideLabel : showLabel}
          disabled={disabled}
          // Keeps focus (and the caret) in the field on a pointer press.
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleVisibility}
        >
          <ToggleIcon aria-hidden="true" focusable="false" />
        </button>
      }
    />
  );
});

/* eslint-disable react/require-default-props -- defaults live on the
   forwardRef-wrapped render function above (see Input.jsx's note). */
PasswordInput.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  // The button's accessible name while the password is hidden / shown.
  showLabel: PropTypes.string,
  hideLabel: PropTypes.string,
  disabled: PropTypes.bool,
};
/* eslint-enable react/require-default-props */

export default PasswordInput;
