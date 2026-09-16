/**
 * useGsapScene — shared GSAP wiring for the TOP live-scene motion upgrade
 * (brief §13/§14): builds every tween/timeline for a scene inside one
 * `gsap.context()` scoped to the scene root (auto-scoped cleanup — every
 * animation created inside `buildTimeline` is reverted together on
 * unmount, never a manually-tracked list), and pauses/resumes ALL of
 * them via `IntersectionObserver` whenever the scene root leaves/re-
 * enters the viewport (brief §14: "do not run unnecessary GSAP timelines
 * forever off-screen").
 *
 * `buildTimeline(gsap)` returns either one animation (a `gsap.timeline()`
 * — the common case) or an array of animations when a scene also needs
 * independent continuous loops alongside its main directed timeline
 * (e.g. a wind-sway `gsap.to()` with its own `repeat: -1`, deliberately
 * outside the main timeline's own repeat/repeatDelay cycle — nesting an
 * infinite-repeat child inside a finite parent would make the parent's
 * own total duration infinite too, breaking its repeat). GSAP's own
 * `Context` has no built-in `pause()`/`resume()` (only `revert()`/
 * `kill()`) — this hook pauses/resumes each returned animation directly,
 * which is why `buildTimeline`'s return value matters here, unlike a
 * context that auto-tracks everything created inside it.
 *
 * Never runs at all when `disabled` (a caller passes its own
 * `prefersReducedMotion` value) — brief §16's reduced-motion rule applies
 * to GSAP ambient timelines exactly like every other motion source, so
 * nothing is ever created in the first place rather than created-then-
 * paused.
 *
 * `buildTimeline` must be referentially stable (wrap it in `useCallback`
 * at the call site) — it re-runs the whole effect on every change.
 */

import { useEffect } from 'react';
import gsap from 'gsap';

export default function useGsapScene(rootRef, buildTimeline, disabled) {
  useEffect(() => {
    if (disabled) return undefined;
    const node = rootRef.current;
    if (!node) return undefined;

    let animations = [];
    const ctx = gsap.context(() => {
      const result = buildTimeline(gsap);
      animations = Array.isArray(result) ? result : [result];
    }, node);

    let observer;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => {
          animations.forEach((animation) => {
            if (!animation) return;
            if (entry.isIntersecting) {
              animation.resume();
            } else {
              animation.pause();
            }
          });
        },
        { threshold: 0 },
      );
      observer.observe(node);
    }

    return () => {
      observer?.disconnect();
      animations = [];
      ctx.revert();
    };
  }, [rootRef, buildTimeline, disabled]);
}
