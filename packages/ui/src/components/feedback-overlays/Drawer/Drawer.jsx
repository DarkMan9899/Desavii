/**
 * Drawer — COMPONENT_LIBRARY.md Part II §4 "Drawer".
 * Side-anchored (desktop) or bottom-anchored (mobile) panel for
 * detail/edit views and filter panels. Behaviour is identical to Modal
 * (COMPONENT_LIBRARY.md's own words) and comes entirely from the shared
 * `internal/Overlay`; this file owns only the edge-anchored shape.
 *
 * `anchor="auto"` (the default) implements the spec's "auto-selected by
 * breakpoint": bottom sheet below the Tablet breakpoint, right panel at
 * Tablet and up. Passing `anchor="right"`/`"bottom"` explicitly pins it
 * regardless of viewport, for the rarer case that needs a fixed anchor.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import Overlay from '../internal/Overlay.jsx';
import Button from '../../primitives/Button/Button.jsx';
import styles from './Drawer.module.scss';

const ANCHORS = ['auto', 'right', 'bottom'];

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

export default function Drawer({
  isOpen,
  onClose,
  title = undefined,
  ariaLabel = 'Panel',
  closeLabel = 'Close',
  anchor = 'auto',
  closeOnBackdropClick = true,
  preventClose = false,
  children,
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
      backdropClassName={[styles.backdrop, styles[`backdrop--${anchor}`]].join(
        ' ',
      )}
      className={[styles.drawer, styles[`drawer--${anchor}`]].join(' ')}
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
    </Overlay>
  );
}

Drawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  ariaLabel: PropTypes.string,
  closeLabel: PropTypes.string,
  anchor: PropTypes.oneOf(ANCHORS),
  closeOnBackdropClick: PropTypes.bool,
  preventClose: PropTypes.bool,
  children: PropTypes.node.isRequired,
};
export { ANCHORS as DRAWER_ANCHORS };
