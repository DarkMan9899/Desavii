/**
 * Overlay — private, shared behaviour for Modal and Drawer.
 *
 * Not part of the public @desavii/ui API (not re-exported from any
 * barrel). Centralizes exactly what COMPONENT_LIBRARY.md's Drawer entry
 * calls "identical focus-trap and dismissal behavior to Modal": a
 * portal to `document.body`, a dismissible backdrop, and
 * `useFocusTrap`'s focus/Escape/scroll-lock handling — via
 * `role="dialog"` + `aria-modal="true"` (COMPONENT_LIBRARY.md Modal
 * Accessibility). Visual shape (centered card vs. edge-anchored panel)
 * is each consumer's own `.module.scss`, passed in via `className`.
 *
 * The dialog element is also published through `PortalContainerContext`
 * (see `hooks/usePortalContainer.js`), so floating panels opened from
 * inside this overlay (DatePicker's calendar) portal into the dialog
 * rather than behind it at the end of `document.body`. Those panels
 * position themselves with `position: fixed`, so the dialog element
 * must never hold a persistent `transform`/`filter` (either would make
 * it their containing block) — the consumers' enter animations end at
 * `transform` none and declare no `animation-fill-mode`.
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import useFocusTrap from '../../../hooks/useFocusTrap.js';
import { PortalContainerContext } from '../../../hooks/usePortalContainer.js';
import styles from './Overlay.module.scss';

export default function Overlay({
  isOpen,
  onClose = undefined,
  closeOnBackdropClick = true,
  preventClose = false,
  ariaLabel = undefined,
  labelledBy = undefined,
  className = undefined,
  backdropClassName = undefined,
  children,
}) {
  const containerRef = useRef(null);
  // `useFocusTrap` reads the node imperatively via `containerRef`; the
  // context needs it as state so descendants re-render once it exists.
  const [portalContainer, setPortalContainer] = useState(null);
  const attachContainer = useCallback((node) => {
    containerRef.current = node;
    setPortalContainer(node);
  }, []);

  useFocusTrap({ containerRef, isOpen, onClose, preventClose });

  if (!isOpen) return null;

  return createPortal(
    // Backdrop click-to-close is a pointer-only convenience — keyboard
    // users dismiss via Escape, handled by useFocusTrap; the backdrop
    // itself is never meant to be part of the tab order.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className={[styles.backdrop, backdropClassName].filter(Boolean).join(' ')}
      onClick={closeOnBackdropClick && !preventClose ? onClose : undefined}
    >
      {/* stops a click inside the panel from bubbling to the backdrop and
          closing the dialog — not an interactive affordance of its own. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={attachContainer}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        <PortalContainerContext.Provider value={portalContainer}>
          {children}
        </PortalContainerContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

Overlay.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  closeOnBackdropClick: PropTypes.bool,
  preventClose: PropTypes.bool,
  ariaLabel: PropTypes.string,
  labelledBy: PropTypes.string,
  className: PropTypes.string,
  backdropClassName: PropTypes.string,
  children: PropTypes.node.isRequired,
};
