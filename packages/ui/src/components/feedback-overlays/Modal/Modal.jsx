/**
 * Modal — COMPONENT_LIBRARY.md Part II §4 "Modal".
 * Focused, blocking overlay for confirmations and short forms. Behaviour
 * (portal, backdrop, focus trap, Escape, scroll lock, background inert)
 * comes entirely from the shared `internal/Overlay`; this file owns only
 * the visual card shape and the header/body/footer composition.
 *
 * Sprint L fix: `children` is optional, not required. `Overlay` renders
 * nothing at all while `!isOpen`, but React still validates whatever
 * `children` this component itself was passed regardless of `isOpen` —
 * so a caller whose modal content depends on data that may not exist
 * yet (e.g. `ListingGallery`'s lightbox, which has nothing to show
 * before an image is selected) legitimately passes `null` while closed,
 * which `.isRequired` always rejects (it fails on `null`/`undefined`
 * before deferring to the base type, even though plain `PropTypes.node`
 * itself allows `null`). That was firing "Failed prop type" at every
 * such call site.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import Overlay from '../internal/Overlay.jsx';
import Button from '../../primitives/Button/Button.jsx';
import styles from './Modal.module.scss';

const SIZES = ['sm', 'md', 'lg', 'full'];

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 5l10 10M15 5 5 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Modal({
  isOpen,
  onClose,
  title = undefined,
  ariaLabel = 'Dialog',
  closeLabel = 'Close',
  size = 'md',
  closeOnBackdropClick = true,
  preventClose = false,
  footer = undefined,
  children = undefined,
}) {
  const titleId = useId();

  return (
    <Overlay
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdropClick={closeOnBackdropClick}
      preventClose={preventClose}
      labelledBy={title ? titleId : undefined}
      ariaLabel={title ? undefined : ariaLabel}
      backdropClassName={styles.backdrop}
      className={[styles.modal, styles[`modal--${size}`]]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.header}>
        {title && (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        )}
        {!preventClose && (
          <Button
            variant="ghost"
            size="sm"
            ariaLabel={closeLabel}
            onClick={onClose}
            iconLeft={<CloseIcon />}
          />
        )}
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </Overlay>
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  ariaLabel: PropTypes.string,
  closeLabel: PropTypes.string,
  size: PropTypes.oneOf(SIZES),
  closeOnBackdropClick: PropTypes.bool,
  preventClose: PropTypes.bool,
  footer: PropTypes.node,
  children: PropTypes.node,
};
export { SIZES as MODAL_SIZES };
