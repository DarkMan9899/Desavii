/**
 * usePriorityNav — "priority+" navigation: how many of a row's links fit
 * in the space the row actually has, so the rest can move, in order, into
 * one "More" menu instead of overlapping their neighbours.
 *
 * The space depends on things no breakpoint can know — the locale (an
 * Armenian nav is ~25% wider than English), the currency, and whether the
 * visitor is signed in (more header actions) — so it is measured: a hidden
 * copy of the row (`measureRef`: one child per item, then the "More"
 * trigger last) gives each item's natural width, and the nav element
 * (`containerRef`) gives the width available. Both are watched with a
 * ResizeObserver and re-measured once web fonts finish loading.
 *
 * Without layout (jsdom, or the nav hidden below the laptop breakpoint)
 * every item stays visible, so nothing is lost when measuring is
 * impossible.
 */

import { useLayoutEffect, useRef, useState } from 'react';

const sum = (values) => values.reduce((total, value) => total + value, 0);

/**
 * How many leading items fit in `available` px. All of them when the whole
 * row fits; otherwise as many as fit beside the "More" trigger (possibly
 * none).
 */
export function fitCount(widths, moreWidth, gap, available) {
  const rowWidth = sum(widths) + gap * Math.max(widths.length - 1, 0);
  if (rowWidth <= available) return widths.length;
  const prefixWidths = widths.map(
    (_, index) => sum(widths.slice(0, index + 1)) + gap * index,
  );
  return prefixWidths.filter((width) => width + gap + moreWidth <= available)
    .length;
}

export default function usePriorityNav(itemCount) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || typeof ResizeObserver === 'undefined') {
      setVisibleCount(itemCount);
      return undefined;
    }

    let isActive = true;
    const update = () => {
      const available = container.clientWidth;
      if (!isActive || available === 0) return;
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      const widths = [...measure.children].map(
        (child) => child.getBoundingClientRect().width,
      );
      const moreWidth = widths.pop();
      setVisibleCount(fitCount(widths, moreWidth, gap, available));
    };

    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    document.fonts?.ready.then(update);
    update();
    return () => {
      isActive = false;
      observer.disconnect();
    };
  }, [itemCount]);

  return { containerRef, measureRef, visibleCount };
}
