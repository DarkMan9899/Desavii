import { createContext, useContext } from 'react';

/**
 * The DOM node a floating panel (DatePicker's calendar) must portal into.
 *
 * Provided by `feedback-overlays/internal/Overlay` with its own
 * `role="dialog"` element, so a panel opened from inside a Modal or
 * Drawer is mounted INSIDE that dialog instead of at the end of
 * `document.body`:
 *
 *  - Stacking: the panel joins the overlay's own stacking context
 *    (`$z-drawer` / `$z-modal-backdrop` on the backdrop), so its local
 *    `$z-dropdown` paints above the overlay's content at whatever layer
 *    the overlay itself lives on. A body-level panel at `$z-dropdown`
 *    painted BENEATH every overlay — the mobile booking Drawer's date
 *    pickers could not be tapped at all.
 *  - Accessibility: the overlay is `aria-modal="true"` and
 *    `useFocusTrap` marks every other `document.body` child
 *    `aria-hidden`; a panel outside the dialog would be inert to
 *    assistive technology and outside the Tab trap.
 *
 * Outside any overlay there is no provider, and `document.body` remains
 * the target — `null` during SSR/prerender, where nothing is portaled.
 */
export const PortalContainerContext = createContext(null);

export default function usePortalContainer() {
  const overlayContainer = useContext(PortalContainerContext);
  if (overlayContainer) return overlayContainer;
  return typeof document === 'undefined' ? null : document.body;
}
