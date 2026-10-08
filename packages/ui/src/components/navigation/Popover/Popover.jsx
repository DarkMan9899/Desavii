/**
 * Popover — Phase 10's generic trigger/panel overlay (Header's nav
 * dropdown, UserMenu). Fully controlled: the consumer owns `isOpen`
 * (typically toggled from the trigger's own `onClick`, since `trigger`
 * is a rendered node here, not a render-prop) — this component only
 * owns positioning and the click-outside/Escape-to-close behaviour.
 *
 * Escape follows the same nested-dismiss contract as `useFocusTrap`: an
 * Escape a nested control (a Select or DatePicker inside the panel)
 * already handled — `event.defaultPrevented` — is left alone, and the
 * Escape this component consumes is marked with `preventDefault()`.
 * Both listen on `document`, so when a Popover sits inside a Modal or
 * Drawer the one registered first (the outer overlay) still runs first;
 * that nesting needs a shared dismissable-layer stack before it is used.
 */

import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from './Popover.module.scss';

const PLACEMENTS = ['bottom-start', 'bottom-end', 'top-start', 'top-end'];

export default function Popover({
  isOpen,
  onClose,
  trigger,
  children,
  placement = 'bottom-start',
  panelClassName = undefined,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        onClose();
      }
    }
    function handleKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className={styles.container} ref={containerRef}>
      {trigger}
      {isOpen && (
        <div
          className={[
            styles.panel,
            styles[`panel--${placement}`],
            panelClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  );
}

Popover.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  trigger: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  placement: PropTypes.oneOf(PLACEMENTS),
  panelClassName: PropTypes.string,
};

export { PLACEMENTS as POPOVER_PLACEMENTS };
