import { useEffect, useRef } from 'react';

/**
 * Shared focus-trap + dismissal behaviour for Modal and Drawer
 * (COMPONENT_LIBRARY.md Part II §4 — Drawer's own entry states its
 * "States/Accessibility: identical focus-trap and dismissal behavior to
 * Modal", which is exactly what this hook centralizes so neither
 * component re-implements it):
 *
 *  - Traps `Tab`/`Shift+Tab` cycling within `containerRef`'s focusable
 *    descendants while `isOpen`.
 *  - Closes on `Escape` unless `preventClose`, or unless a nested popup
 *    already handled that Escape (`event.defaultPrevented`), and marks
 *    the Escape it consumes with `preventDefault()` in turn.
 *  - Moves focus into the container on open, restores it to whatever
 *    was focused before on close (COMPONENT_LIBRARY.md Modal
 *    Accessibility: "focus returns to the triggering element on close").
 *  - Locks body scroll and marks every other `document.body` child
 *    `aria-hidden` while open ("background content marked
 *    inert/aria-hidden while open"), restoring both on close.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function useFocusTrap({
  containerRef,
  isOpen,
  onClose,
  preventClose,
}) {
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const container = containerRef.current;

    const getFocusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    const [firstFocusable] = getFocusable();
    (firstFocusable || container).focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        // Nested-dismiss contract: a popup nested inside the trap
        // (Select's listbox, DatePicker's calendar, Popover's panel)
        // closes itself on Escape and calls `preventDefault()`. React
        // dispatches those handlers from its root/portal container,
        // which sits below `document`, so they always run before this
        // listener — an already-handled Escape must only close the
        // nested popup, never the whole Modal/Drawer behind it.
        if (event.defaultPrevented || preventClose) return;
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen, onClose, preventClose, containerRef]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const container = containerRef.current;
    const hiddenSiblings = Array.from(body.children).filter(
      (child) =>
        child !== container &&
        !child.contains(container) &&
        !child.hasAttribute('aria-hidden'),
    );
    hiddenSiblings.forEach((child) =>
      child.setAttribute('aria-hidden', 'true'),
    );

    return () => {
      body.style.overflow = previousOverflow;
      hiddenSiblings.forEach((child) => child.removeAttribute('aria-hidden'));
    };
  }, [isOpen, containerRef]);
}
