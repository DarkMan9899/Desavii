/**
 * Step A3 — `useListingImpression` (brief §14/§16/§41): fires
 * `onImpression` when the observed element has been >= 50% visible
 * CONTINUOUSLY for >= 1000ms. Dropping below 50% before the timer
 * completes cancels it; crossing back over 50% afterward starts a fresh
 * 1000ms timer (this hook may call `onImpression` more than once across
 * a component's lifetime — deduplication to "once per session" is
 * `analyticsClient.js#trackEvent`'s job via its `dedupKey`, never this
 * hook's).
 *
 * One `IntersectionObserver` per call site — the same established
 * per-component pattern `components/ScrollRevealLite` already uses;
 * `IntersectionObserver` itself is natively browser-optimized (not a
 * JS-side scroll/polling loop), so this is already the "efficient"
 * option brief §48 asks for, not a shared-observer micro-optimization
 * this codebase has any existing precedent for.
 */

import { useEffect, useRef } from 'react';

const VISIBILITY_THRESHOLD = 0.5;
const CONTINUOUS_VISIBLE_MS = 1000;

/**
 * @param {object} params
 * @param {boolean} params.enabled - false disables observation entirely
 *   (e.g. collection-disabled, or the caller has no placement to report).
 * @param {() => void} params.onImpression
 * @returns {import('react').RefObject} attach to the DOM node to observe.
 */
export function useListingImpression({ enabled, onImpression }) {
  const nodeRef = useRef(null);
  const timerIdRef = useRef(null);
  const onImpressionRef = useRef(onImpression);
  onImpressionRef.current = onImpression;

  useEffect(() => {
    if (!enabled) return undefined;
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible =
          entry.isIntersecting &&
          entry.intersectionRatio >= VISIBILITY_THRESHOLD;

        if (visible) {
          if (timerIdRef.current) return; // already counting down
          timerIdRef.current = setTimeout(() => {
            timerIdRef.current = null;
            onImpressionRef.current();
          }, CONTINUOUS_VISIBLE_MS);
        } else if (timerIdRef.current) {
          clearTimeout(timerIdRef.current);
          timerIdRef.current = null;
        }
      },
      { threshold: [0, VISIBILITY_THRESHOLD, 1] },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [enabled]);

  return nodeRef;
}

export default useListingImpression;
