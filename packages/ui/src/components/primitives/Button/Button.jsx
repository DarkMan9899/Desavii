/**
 * Button — COMPONENT_LIBRARY.md Part II §1 "Button".
 *
 * The single interactive-action element used platform-wide. Native
 * <button> semantics throughout (never a styled <div>), so keyboard
 * activation (Space/Enter) and default focus behaviour come for free.
 *
 * Icon is referenced as a "Dependency" in the spec but is not yet a
 * standalone ui/ primitive (COMPONENT_LIBRARY.md Part II §1's Icon entry
 * is out of scope so far). `iconLeft`/`iconRight` therefore accept any
 * renderable node (e.g. a lucide-react icon element supplied by the
 * consumer). The loading indicator reuses `feedback-overlays/Spinner`
 * (COMPONENT_LIBRARY.md's "inline within a Button" Spinner variant) in
 * `decorative` mode, since this button already carries `aria-busy` and
 * its own accessible name.
 */

import PropTypes from 'prop-types';
import Spinner from '../../feedback-overlays/Spinner/Spinner.jsx';
import styles from './Button.module.scss';

const VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'];
const SIZES = ['sm', 'md', 'lg'];

export default function Button({
  children = undefined,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  iconLeft = undefined,
  iconRight = undefined,
  fullWidth = false,
  type = 'button',
  onClick = undefined,
  ariaLabel = undefined,
  ariaHasPopup = undefined,
}) {
  const iconOnly = !children && (iconLeft || iconRight);

  const className = [
    styles.button,
    styles[`button--${variant}`],
    styles[`button--${size}`],
    fullWidth && styles['button--full-width'],
    loading && styles['button--loading'],
    iconOnly && styles['button--icon-only'],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type === 'submit' ? 'submit' : 'button'}
      className={className}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      aria-haspopup={ariaHasPopup}
      onClick={onClick}
    >
      <span className={styles.content}>
        {iconLeft && (
          <span className={styles.icon} aria-hidden="true">
            {iconLeft}
          </span>
        )}
        {children && <span className={styles.label}>{children}</span>}
        {iconRight && (
          <span className={styles.icon} aria-hidden="true">
            {iconRight}
          </span>
        )}
      </span>
      {loading && (
        <span className={styles.spinnerWrapper}>
          <Spinner size="sm" decorative />
        </span>
      )}
    </button>
  );
}

Button.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(VARIANTS),
  size: PropTypes.oneOf(SIZES),
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  iconLeft: PropTypes.node,
  iconRight: PropTypes.node,
  fullWidth: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit']),
  onClick: PropTypes.func,
  ariaLabel: PropTypes.string,
  // The kind of popup this button opens (WAI-ARIA `aria-haspopup`), e.g. a
  // "Show all" button that opens a dialog.
  ariaHasPopup: PropTypes.oneOf(['dialog', 'menu', 'listbox']),
};

export { VARIANTS as BUTTON_VARIANTS, SIZES as BUTTON_SIZES };
