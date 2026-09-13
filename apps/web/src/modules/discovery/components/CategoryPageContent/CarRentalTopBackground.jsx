/**
 * CarRentalTopBackground — Step 2.1 (Car Rental TOP background only).
 * `CategoryTopBackground.jsx` renders this in place of the generic
 * gradient+motif treatment for `car-rentals` specifically; every other
 * category's background is untouched (unaffected import, same shared
 * `.background` positioning contract so it costs nothing at the call
 * site — see that file's own render logic).
 *
 * Three depth layers, same "FAR/MID/NEAR" structure the brief asks for:
 * - FAR: an atmospheric navy->royal-blue sky with a soft gold horizon
 *   glow (a sunset-over-the-road read, restrained).
 * - MID: a perspective road converging to a vanishing point, a dashed
 *   center line with a slow animated dash-offset (reads as forward
 *   travel), a few waypoint nodes with a gentle pulse, and a faint
 *   perspective grid for the "technical/mobility" character.
 * - NEAR: two blurred diagonal light streaks drifting slowly, the
 *   foreground accent.
 *
 * Pointer-driven parallax mirrors `useTiltEffect.js`'s own established
 * pattern exactly (CSS custom properties written straight to the DOM via
 * a ref, never React state, so a mousemove stream never triggers a
 * re-render) rather than inventing a second technique — disabled under
 * `prefers-reduced-motion` or a coarse/touch pointer, same as that hook.
 * All continuous animation (dash movement, waypoint pulse, streak drift)
 * is plain CSS `@keyframes`, explicitly turned off (not just sped up)
 * under reduced motion so the layout settles into one deliberate static
 * frame rather than a mid-loop instant.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './CarRentalTopBackground.module.scss';

export default function CarRentalTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const isCoarsePointer =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches;
  const parallaxDisabled = prefersReducedMotion || isCoarsePointer;

  const pointerHandlers = useMemo(() => {
    if (parallaxDisabled) return {};

    function handlePointerMove(event) {
      const node = rootRef.current;
      if (!node) return;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const rect = node.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        node.style.setProperty('--parallax-x', x.toFixed(3));
        node.style.setProperty('--parallax-y', y.toFixed(3));
      });
    }

    function handlePointerLeave() {
      const node = rootRef.current;
      if (!node) return;
      node.style.setProperty('--parallax-x', '0');
      node.style.setProperty('--parallax-y', '0');
    }

    return {
      onPointerMove: handlePointerMove,
      onPointerLeave: handlePointerLeave,
    };
  }, [parallaxDisabled]);

  return (
    <div
      ref={rootRef}
      className={[styles.environment, prefersReducedMotion && styles.static]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      // eslint-disable-next-line react/jsx-props-no-spreading -- forwards the two pointer handlers computed above, or nothing when parallax is disabled
      {...pointerHandlers}
    >
      <div className={styles.far}>
        <div className={styles.horizonGlow} />
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="carRentalGridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {/* Restrained perspective grid — a handful of converging
            horizontals, technical/mobility character. */}
        <g
          className={styles.grid}
          stroke="url(#carRentalGridFade)"
          strokeWidth="1"
        >
          <path d="M40 240 L200 150 L360 240" />
          <path d="M10 240 L200 128 L390 240" />
          <path d="M-30 240 L200 104 L430 240" />
        </g>
        {/* The road itself — converging edges + dashed center line. */}
        <g className={styles.road}>
          <path
            className={styles.roadEdge}
            d="M60 240 L195 118 L205 118 L340 240 Z"
          />
          <path className={styles.roadCenterLine} d="M200 240 L200 120" />
        </g>
        {/* Waypoint nodes along the route, gentle staggered pulse. */}
        <circle
          className={styles.waypoint}
          cx="200"
          cy="205"
          r="3.2"
          style={{ '--delay': '0s' }}
        />
        <circle
          className={styles.waypoint}
          cx="200"
          cy="172"
          r="2.4"
          style={{ '--delay': '0.6s' }}
        />
        <circle
          className={styles.waypoint}
          cx="200"
          cy="145"
          r="1.7"
          style={{ '--delay': '1.2s' }}
        />
      </svg>

      <div className={styles.near}>
        <span className={[styles.streak, styles.streakA].join(' ')} />
        <span className={[styles.streak, styles.streakB].join(' ')} />
      </div>
    </div>
  );
}
