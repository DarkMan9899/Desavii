import { useState, useEffect } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * SSR/test-safe: no `window` reference before checking it exists.
 * Read once, synchronously, as `useState`'s lazy initializer — never in
 * a render body — so the very first render (client or test) already
 * reflects the real preference instead of always starting `false` and
 * correcting a tick later in an effect (A6.2's own audit finding: a
 * user who already prefers reduced motion must never see so much as a
 * first-frame `isAnimationActive: true` on a chart).
 */
function getInitialPreference() {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

/**
 * Detects `prefers-reduced-motion: reduce` via `matchMedia` — mirrors
 * `useIsTouchOnlyDevice`'s shape (this package's own established
 * pattern for a small env-detection hook) for the subscribe/cleanup
 * half, rather than depending on `apps/web`'s own `useReducedMotion` (a
 * components package never depends on the app that consumes it); the
 * lazy-initial-state half instead mirrors that same `useReducedMotion`
 * hook's own `getInitialPreference()` pattern, which already avoids
 * this exact first-render gap. Every animated component in this
 * package must check this — `_motion.scss`'s own `reduced-motion-safe`
 * mixin documents the same rule for CSS-driven animation; this is the
 * equivalent for JS-driven animation (e.g. Recharts' `isAnimationActive`).
 */
export default function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState(getInitialPreference);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return undefined;
    }

    const query = window.matchMedia(QUERY);
    // Reconciles state set by a preference change between this hook's
    // lazy-initial read and this effect's subscription — the window is
    // narrow (one commit) but not provably zero, so this keeps the same
    // "always match the live value" guarantee the old effect-only body
    // had, without reintroducing the gap the lazy initializer just fixed.
    setPrefersReducedMotion(query.matches);

    const handleChange = (event) => setPrefersReducedMotion(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}
