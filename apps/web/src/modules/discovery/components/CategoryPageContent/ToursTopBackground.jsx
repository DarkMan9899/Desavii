/**
 * ToursTopBackground — Step 2.7 established the topographic-map/winding-
 * trail environment; this pass (TOP live-scene motion upgrade, category
 * 7 of 9) strengthens it into a small directed "journey unfolding" scene:
 *
 * - TRAVELER: a restrained hiker silhouette travels the winding trail,
 *   stopping briefly at each of the 4 waypoint nodes in turn — an actual
 *   journey along the existing route, not a generic traversal like Car
 *   Rental's straight road.
 * - ROUTE STORY: a second gold overlay stroke (`.routeProgress`, same
 *   path as the ambient `.route`) reveals itself progressively via
 *   `stroke-dashoffset` (measured from the real path length at mount),
 *   timed with the hiker — the trail visibly gets "traveled," not just
 *   texturally animated. Waypoints activate in sequence as the hiker
 *   reaches each one, replacing their independent simultaneous pulse.
 * - TERRAIN: unchanged — ridgeFar/ridgeNear already carry distinct
 *   parallax tiers from Step 2.7.
 * - MAP: the three contour lines now carry a very slow, subtle opacity
 *   drift (a "the map is alive" read), independent of the main timeline.
 *
 * The GSAP timeline (`useGsapScene`) is never created under
 * `prefers-reduced-motion` and is paused via IntersectionObserver
 * whenever this stage scrolls out of view — see CarRentalTopBackground.jsx's
 * own header comment for the identical reasoning, not repeated per
 * category.
 */

import { useCallback, useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import useGsapScene from '../../../../components/SceneKit/useGsapScene.js';
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
  const hikerRef = useRef(null);
  const routeProgressRef = useRef(null);
  const waypointRefs = useRef([]);
  const contourRefs = useRef([]);
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

  const buildTimeline = useCallback((gsap) => {
    // `getTotalLength()` isn't implemented in jsdom (this repo's test
    // environment) — a fixed fallback keeps the timeline buildable there
    // without special-casing tests; every real browser measures the
    // actual path.
    const pathLength =
      typeof routeProgressRef.current.getTotalLength === 'function'
        ? routeProgressRef.current.getTotalLength()
        : 480;
    gsap.set(routeProgressRef.current, {
      opacity: 1,
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
    });
    gsap.set(hikerRef.current, {
      attr: {
        transform: `translate(${WAYPOINTS[0].cx} ${WAYPOINTS[0].cy}) scale(0.4)`,
      },
      opacity: 0,
    });

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 2,
      defaults: { ease: 'power1.inOut' },
    });

    // The map feels alive — a very slow, subtle contour drift,
    // independent of the main journey timeline.
    const contourDrift = gsap.to(contourRefs.current.filter(Boolean), {
      opacity: 0.7,
      duration: 5,
      yoyo: true,
      repeat: -1,
      stagger: 0.8,
      ease: 'sine.inOut',
    });

    tl.to(hikerRef.current, { opacity: 0.7, duration: 0.6 }, 0);
    tl.to(
      routeProgressRef.current,
      { strokeDashoffset: 0, duration: 6.5, ease: 'power1.inOut' },
      0,
    );

    // The hiker travels waypoint to waypoint, pausing briefly at each —
    // the "journey unfolding" read, timed with the route reveal above.
    const legTimes = [0, 1.8, 3.6, 5.2];
    WAYPOINTS.forEach((point, index) => {
      if (index === 0) return;
      tl.to(
        hikerRef.current,
        {
          attr: { transform: `translate(${point.cx} ${point.cy}) scale(0.4)` },
          duration: 1.4,
        },
        legTimes[index - 1],
      );
    });

    // Waypoints activate in sequence as the hiker reaches each one.
    waypointRefs.current.forEach((el, index) => {
      if (!el) return;
      tl.fromTo(
        el,
        { opacity: 0.35, scale: 1 },
        {
          opacity: 1,
          scale: 1.5,
          duration: 0.5,
          yoyo: true,
          repeat: 1,
          transformOrigin: 'center',
        },
        legTimes[index],
      );
    });

    tl.to(hikerRef.current, { opacity: 0, duration: 0.8 }, 6.4);

    return [tl, contourDrift];
  }, []);

  useGsapScene(rootRef, buildTimeline, prefersReducedMotion);

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
            elevation-line language, now with a very slow, subtle drift
            (motion upgrade §10: "the map is alive"). */}
        <path
          ref={(el) => {
            contourRefs.current[0] = el;
          }}
          className={styles.contour}
          d="M80 200 Q120 170 180 180 Q240 190 260 220 Q230 250 160 245 Q100 240 80 200 Z"
        />
        <path
          ref={(el) => {
            contourRefs.current[1] = el;
          }}
          className={styles.contour}
          d="M110 205 Q140 185 180 190 Q220 195 230 215 Q210 235 165 232 Q125 230 110 205 Z"
        />
        <path
          ref={(el) => {
            contourRefs.current[2] = el;
          }}
          className={styles.contourInner}
          d="M140 210 Q160 198 185 200 Q205 203 210 215 Q198 225 170 224 Q148 222 140 210 Z"
        />
        {/* A winding dashed trail climbing across the terrain — the
            ambient texture stays exactly as Step 2.7 built it. */}
        <path
          className={styles.route}
          d="M20 235 Q80 210 100 180 Q130 140 170 130 Q220 118 250 90 Q290 65 340 50"
        />
        {/* The traveled portion of the trail — reveals progressively via
            `strokeDashoffset`, timed with the hiker (motion upgrade §10:
            "route progresses visibly through waypoints"). */}
        <path
          ref={routeProgressRef}
          className={styles.routeProgress}
          d="M20 235 Q80 210 100 180 Q130 140 170 130 Q220 118 250 90 Q290 65 340 50"
          opacity="0"
        />
        {WAYPOINTS.map((point, index) => (
          <circle
            key={point.cx}
            ref={(el) => {
              waypointRefs.current[index] = el;
            }}
            className={styles.waypoint}
            cx={point.cx}
            cy={point.cy}
            r={point.r}
            style={{ '--delay': point.delay }}
          />
        ))}
        {/* The hiker — a restrained silhouette traveling the trail.
            Default transform/no inline opacity below is the considered
            resting frame (waiting at the trailhead, faint) rendered
            under reduced motion, when the GSAP timeline that would move/
            fade it is never built. */}
        <g
          ref={hikerRef}
          className={styles.hiker}
          transform={`translate(${WAYPOINTS[0].cx} ${WAYPOINTS[0].cy}) scale(0.4)`}
          opacity="0.4"
        >
          <circle className={styles.hikerHead} cx="0" cy="0" r="4" />
          <path
            className={styles.hikerBody}
            d="M-4 6 Q0 4 4 6 L5 24 Q3 28 0 28 Q-3 28 -5 24 Z"
          />
        </g>
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
