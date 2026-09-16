/**
 * ToursTopBackground — Step 2.7 (Tours TOP background only). Mirrors the
 * six existing dedicated category environments' own established
 * technique (FAR/MID/NEAR depth, pointer-parallax via CSS custom
 * properties on a DOM ref, reduced-motion/coarse-pointer guard) with a
 * seventh entirely distinct visual identity, per the brief's explicit
 * "must feel clearly different from Villa":
 * - Villa: a dusk mountain horizon, a minimal roofline, terrace lines —
 *   calm retreat, landscape, luxury, at rest.
 * - Car Rental: a straight perspective road/highway, driver's-eye
 *   view — mobility, paved travel.
 * - Tours (this file): a bird's-eye topographic map — layered mountain
 *   silhouettes under a cool daylight-blue horizon (never Villa's warm
 *   dusk), nested contour lines tracing a hillside, and a winding
 *   dashed trail with waypoint nodes climbing across it — movement,
 *   discovery, itinerary, never a paved road or a calm retreat.
 *
 * - FAR: a deep-blue daylight atmosphere with two layered, sharper
 *   mountain-ridge silhouettes and a cool blue horizon glow — distinct
 *   from Villa's warm amber dusk and Car Rental's own atmosphere.
 * - MID: three nested organic contour lines (a topographic map's own
 *   elevation-line language) plus a winding dashed route climbing
 *   across them, with waypoint nodes along its length that pulse
 *   gently.
 * - NEAR: a restrained gold glow along the route, a few soft drifting
 *   haze particles, and a faint cool foreground light wash.
 *
 * All continuous motion (the route's dash movement, the waypoint pulse,
 * the haze particle drift) is slow and low-amplitude — the brief's own
 * explicit "no racing feel, no gaming map, no neon route lines, no fast
 * motion, no bouncing, no giant zoom" — and switched off entirely under
 * `prefers-reduced-motion`, settling into one deliberate static frame,
 * exactly like the sibling environments' own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './ToursTopBackground.module.scss';

// Waypoint nodes along the winding route — deterministic positions and
// stagger, tracing the same path the route line itself follows.
const WAYPOINTS = [
  { cx: 20, cy: 235, r: 3.4, delay: '0s' },
  { cx: 100, cy: 180, r: 3, delay: '0.7s' },
  { cx: 170, cy: 130, r: 2.6, delay: '1.4s' },
  { cx: 340, cy: 50, r: 2.2, delay: '2.1s' },
];

export default function ToursTopBackground() {
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
        {/* Two layered mountain-ridge silhouettes — sharper/cooler than
            Villa's own, the "distant terrain depth" the brief asks for. */}
        <svg
          className={styles.ridgeFar}
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 90 L0 55 L35 25 L55 50 L85 15 L110 45 L145 10 L175 42 L205 20 L235 48 L265 18 L300 44 L330 22 L365 40 L400 30 L400 90 Z" />
        </svg>
        <svg
          className={styles.ridgeNear}
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 90 L0 65 L25 35 L50 60 L75 28 L105 58 L135 22 L165 55 L195 30 L225 60 L255 26 L290 56 L320 32 L355 52 L400 40 L400 90 Z" />
        </svg>
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* Nested organic contour lines — a topographic map's own
            elevation-line language, the "map/contour lines" the brief
            asks for, never a literal illustrated hill. */}
        <path
          className={styles.contour}
          d="M80 200 Q120 170 180 180 Q240 190 260 220 Q230 250 160 245 Q100 240 80 200 Z"
        />
        <path
          className={styles.contour}
          d="M110 205 Q140 185 180 190 Q220 195 230 215 Q210 235 165 232 Q125 230 110 205 Z"
        />
        <path
          className={styles.contourInner}
          d="M140 210 Q160 198 185 200 Q205 203 210 215 Q198 225 170 224 Q148 222 140 210 Z"
        />
        {/* A winding dashed trail climbing across the terrain — never a
            straight perspective road. */}
        <path
          className={styles.route}
          d="M20 235 Q80 210 100 180 Q130 140 170 130 Q220 118 250 90 Q290 65 340 50"
        />
        {WAYPOINTS.map((point) => (
          <circle
            key={point.cx}
            className={styles.waypoint}
            cx={point.cx}
            cy={point.cy}
            r={point.r}
            style={{ '--delay': point.delay }}
          />
        ))}
      </svg>

      <div className={styles.near}>
        <span className={styles.routeGlow} />
        <span className={[styles.particle, styles.particleA].join(' ')} />
        <span className={[styles.particle, styles.particleB].join(' ')} />
        <span className={[styles.particle, styles.particleC].join(' ')} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
