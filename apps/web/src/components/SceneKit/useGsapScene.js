/**
 * useGsapScene — shared GSAP wiring for the TOP live-scene motion upgrade
 * (brief §13/§14): builds one coordinated `gsap.timeline()` per scene root
 * via `gsap.context()` (auto-scoped cleanup — every tween/ScrollTrigger
 * created inside `buildTimeline` is reverted together on unmount, never a
 * manually-tracked list), and pauses that timeline via `IntersectionObserver`
 * whenever the scene root leaves the viewport (brief §14: "do not run
 * unnecessary GSAP timelines forever off-screen") — resuming it when the
 * root scrolls back in.
 *
 * Never runs at all when `disabled` (a caller passes its own
 * `prefersReducedMotion` value) — brief §16's reduced-motion rule applies
 * to GSAP ambient timelines exactly like every other motion source, so the
 * timeline is never created in the first place rather than created-then-
 * paused.
 *
 * `buildTimeline` must be referentially stable (wrap it in `useCallback`
 * at the call site) — it re-runs the whole effect on every change.
 */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function useGsapScene(rootRef, buildTimeline, disabled) {
  const timelineRef = useRef(null);

  useEffect(() => {
    if (disabled) return undefined;
    const node = rootRef.current;
    if (!node) return undefined;

    const ctx = gsap.context(() => {
      timelineRef.current = buildTimeline(gsap);
    }, node);

    let observer;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => {
          const timeline = timelineRef.current;
          if (!timeline) return;
          if (entry.isIntersecting) {
            timeline.resume();
          } else {
            timeline.pause();
          }
        },
        { threshold: 0 },
      );
      observer.observe(node);
    }

    return () => {
      observer?.disconnect();
      timelineRef.current = null;
      ctx.revert();
    };
  }, [rootRef, buildTimeline, disabled]);
}
