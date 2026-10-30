/**
 * useCarouselControls — what a Home card row's controls show and do, read
 * from Embla's own API (v8.6):
 *
 * - `canPrev` / `canNext` (`canScrollPrev` / `canScrollNext`) disable an
 *   arrow at either end; nothing loops;
 * - `page` / `pages` (`selectedScrollSnap` / `scrollSnapList`) — the
 *   "02 / 03" counter. With `slidesToScroll: 'auto'` a snap is a page of
 *   whole cards, so the count is pages, not cards;
 * - the progress track follows `scrollProgress()` on every `scroll` frame,
 *   written straight to `progressRef` as a CSS variable — no React render
 *   per frame;
 * - ArrowLeft / ArrowRight move the row while focus is on one of its
 *   cards (Tab already scrolls a focused card into view: `watchFocus`).
 *
 * Autoplay (the `embla-carousel-autoplay` plugin, when the row has one):
 * the plugin itself pauses while the pointer is over the row and during a
 * drag, restarting its full countdown afterwards. This hook adds what the
 * plugin does not cover — keyboard focus anywhere in the row (cards and
 * controls) pauses it until focus leaves — and the visitor's own pause
 * button, which stops the row until they press play again. A Previous /
 * Next press restarts the countdown, so autoplay never moves the row right
 * after the visitor did. Any start the plugin attempts while one of these
 * pauses holds is stopped at once.
 *
 * All of it re-reads on `reInit`, which Embla fires on resize, so the
 * controls stay right when the number of cards per page changes. Embla
 * destroys the plugin (and its timer) on unmount; this hook removes its
 * own listeners.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const KEYS = { ArrowLeft: 'scrollPrev', ArrowRight: 'scrollNext' };
// The pause button itself does not count as focus "in the row": pressing
// play from it must play.
const TOGGLE_SELECTOR = '[data-autoplay-toggle]';

export default function useCarouselControls(embla, progressRef) {
  const [state, setState] = useState({
    canPrev: false,
    canNext: false,
    page: 0,
    pages: 0,
  });
  const [isUserPaused, setIsUserPaused] = useState(false);
  const pauses = useRef({ user: false, focus: false, hover: false });

  const autoplay = embla?.plugins?.().autoplay;

  const read = useCallback((api) => {
    setState({
      canPrev: api.canScrollPrev(),
      canNext: api.canScrollNext(),
      page: api.selectedScrollSnap(),
      pages: api.scrollSnapList().length,
    });
  }, []);

  const paint = useCallback(
    (api) => {
      const progress = Math.max(0, Math.min(1, api.scrollProgress()));
      progressRef.current?.style.setProperty('--progress', String(progress));
    },
    [progressRef],
  );

  useEffect(() => {
    if (!embla) return undefined;
    read(embla);
    paint(embla);
    embla.on('select', read).on('reInit', read);
    embla.on('scroll', paint).on('reInit', paint);

    const root = embla.rootNode();
    const region = root.closest('[role="region"]') ?? root;
    const onKeyDown = (event) => {
      const method = KEYS[event.key];
      if (!method || event.target.closest('input, textarea, select')) return;
      event.preventDefault();
      embla[method]();
    };
    root.addEventListener('keydown', onKeyDown);

    // The plugin is looked up when each event fires, never captured: the
    // row starts without it (loading placeholders) and Embla adds it to
    // the same instance on `reInit` once real cards arrive.
    const plugin = () => embla.plugins?.().autoplay;
    const isHeld = () =>
      pauses.current.user || pauses.current.focus || pauses.current.hover;
    const holdIfPaused = () => {
      if (isHeld()) plugin()?.stop();
    };
    const onFocusIn = (event) => {
      if (event.target.closest(TOGGLE_SELECTOR)) return;
      pauses.current.focus = true;
      plugin()?.stop();
    };
    const onFocusOut = (event) => {
      if (region.contains(event.relatedTarget)) return;
      pauses.current.focus = false;
      if (!isHeld()) plugin()?.play();
    };
    const onMouseEnter = () => {
      pauses.current.hover = true;
    };
    const onMouseLeave = () => {
      pauses.current.hover = false;
    };
    embla.on('autoplay:play', holdIfPaused);
    region.addEventListener('focusin', onFocusIn);
    region.addEventListener('focusout', onFocusOut);
    // Capture phase: these run before the plugin's own (bubble-phase)
    // hover listeners on the same element, so the hover flag is already
    // current when the plugin restarts on leave.
    region.addEventListener('mouseenter', onMouseEnter, true);
    region.addEventListener('mouseleave', onMouseLeave, true);

    return () => {
      embla.off('select', read).off('reInit', read);
      embla.off('scroll', paint).off('reInit', paint);
      embla.off('autoplay:play', holdIfPaused);
      root.removeEventListener('keydown', onKeyDown);
      region.removeEventListener('focusin', onFocusIn);
      region.removeEventListener('focusout', onFocusOut);
      region.removeEventListener('mouseenter', onMouseEnter, true);
      region.removeEventListener('mouseleave', onMouseLeave, true);
    };
  }, [embla, read, paint]);

  const move = (method) => {
    embla?.[method]();
    autoplay?.reset();
  };

  const toggleAutoplay = () => {
    const next = !pauses.current.user;
    pauses.current.user = next;
    setIsUserPaused(next);
    if (next) autoplay?.stop();
    else autoplay?.play();
  };

  const hasControls = state.canPrev || state.canNext;

  return {
    ...state,
    hasControls,
    prev: () => move('scrollPrev'),
    next: () => move('scrollNext'),
    // Only a row that can actually move gets the pause/play control.
    hasAutoplay: Boolean(autoplay) && hasControls,
    isUserPaused,
    toggleAutoplay,
  };
}
