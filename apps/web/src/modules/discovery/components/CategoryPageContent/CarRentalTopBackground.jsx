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
        {/* A soft, blurred skyline silhouette — real FAR/MID separation:
            it reads as "far away" purely through softness, sitting well
            behind the road's own crisp lines rather than competing with
            them (brief: "stronger near/mid/far separation"). */}
        <svg
          className={styles.skyline}
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 60 L0 38 L18 38 L18 24 L34 24 L34 40 L52 40 L52 18 L58 18 L58 40 L78 40 L78 30 L94 30 L94 42 L118 42 L118 20 L126 20 L126 42 L150 42 L150 32 L172 32 L172 44 L196 44 L196 26 L206 26 L206 44 L230 44 L230 16 L240 16 L240 44 L262 44 L262 34 L284 34 L284 46 L308 46 L308 22 L318 22 L318 46 L340 46 L340 36 L360 36 L360 48 L382 48 L382 30 L400 30 L400 60 Z" />
        </svg>
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
          {/* A soft glow sitting under the center line itself — the
              "premium light streaks / route glow" the brief asks for,
              tying the road visually back to the horizon glow above it. */}
          <radialGradient id="carRentalRoadGlow" cx="50%" cy="46%" r="55%">
            <stop className={styles.roadGlowStopInner} offset="0%" />
            <stop className={styles.roadGlowStopOuter} offset="100%" />
          </radialGradient>
        </defs>
        {/* Restrained perspective grid — a handful of converging
            horizontals, technical/mobility character. One extra line
            (closest to the vanishing point) sharpens the sense of depth
            without adding visual noise. */}
        <g
          className={styles.grid}
          stroke="url(#carRentalGridFade)"
          strokeWidth="1"
        >
          <path d="M40 240 L200 150 L360 240" />
          <path d="M10 240 L200 128 L390 240" />
          <path d="M-30 240 L200 104 L430 240" />
          <path d="M-70 240 L200 88 L470 240" />
        </g>
        {/* Vanishing-point glow, rendered before the road so it sits
            behind the edges/center line — the "subtle ambient glow" and
            "more visible route effects" the brief calls for. */}
        <ellipse
          className={styles.roadGlow}
          cx="200"
          cy="112"
          rx="120"
          ry="48"
          fill="url(#carRentalRoadGlow)"
        />
        {/* The road itself — converging edges + dashed center line. */}
        <g className={styles.road}>
          <path
            className={styles.roadEdge}
            d="M60 240 L195 118 L205 118 L340 240 Z"
          />
          <path className={styles.roadCenterLine} d="M200 240 L200 120" />
        </g>
        {/* Waypoint nodes along the route, gentle staggered pulse — a
            fourth, faintest node furthest down the road strengthens the
            "route" read without crowding the existing three. */}
        <circle
          className={styles.waypoint}
          cx="200"
          cy="228"
          r="4"
          style={{ '--delay': '0.9s' }}
        />
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
        <span className={[styles.streak, styles.streakC].join(' ')} />
      </div>

      {/* A restrained vignette — cinematic framing that reinforces the
          near/mid/far read (the road stage stays brightest, the corners
          recede) without adding any new motion or color. */}
      <div className={styles.vignette} />
    </div>
  );
}
