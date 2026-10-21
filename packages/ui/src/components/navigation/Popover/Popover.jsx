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
 *
 * Viewport containment: `placement` anchors the panel to a trigger edge,
 * but a trigger near the other edge of a narrow screen (a filter chip on
 * a tablet) would still push it past the viewport. Once open — and again
 * when the window or the panel resizes — the panel is shifted sideways
 * just enough to keep `VIEWPORT_MARGIN` clear on both sides (the same
 * margin the floating Select and DatePicker panels keep), and it is never
 * wider than the viewport minus those margins. The shift uses the CSS
 * `translate` property, so a consumer's own `transform` still applies.
 * Vertically the panel stays attached to its trigger in the page flow;
 * when it opens with its bottom below the fold, the page scrolls just
 * enough to show it whole (only on opening, so a panel that later grows
 * never makes the page jump).
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from './Popover.module.scss';

const PLACEMENTS = ['bottom-start', 'bottom-end', 'top-start', 'top-end'];
const VIEWPORT_MARGIN = 8;
const SHIFT_PROPERTY = '--popover-shift-x';

/** How far to move a panel sideways so it sits inside the viewport. */
function viewportShift(panelEl) {
  panelEl.style.setProperty(SHIFT_PROPERTY, '0px');
  const rect = panelEl.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const overRight = rect.right - (viewportWidth - VIEWPORT_MARGIN);
  if (overRight > 0) {
    return Math.max(VIEWPORT_MARGIN - rect.left, -overRight);
  }
  return Math.max(0, VIEWPORT_MARGIN - rect.left);
}

export default function Popover({
  isOpen,
  onClose,
  trigger,
  children,
  placement = 'bottom-start',
  panelClassName = undefined,
}) {
  const containerRef = useRef(null);
  const panelRef = useRef(null);

  // Before paint, so an out-of-bounds panel never flashes at its anchor.
  useLayoutEffect(() => {
    const panelEl = panelRef.current;
    if (!isOpen || !panelEl) return undefined;
    const place = () => {
      panelEl.style.setProperty(SHIFT_PROPERTY, `${viewportShift(panelEl)}px`);
    };
    place();
    const { bottom, height } = panelEl.getBoundingClientRect();
    if (
      bottom > window.innerHeight - VIEWPORT_MARGIN &&
      height < window.innerHeight
    ) {
      panelEl.scrollIntoView?.({ block: 'nearest' });
    }
    window.addEventListener('resize', place);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(panelEl);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [isOpen]);

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
          ref={panelRef}
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
