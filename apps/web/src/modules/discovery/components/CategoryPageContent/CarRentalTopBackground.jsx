/**
 * CarRentalTopBackground — Step 2.1 established the FAR/MID/NEAR road
 * environment; this pass (TOP live-scene motion upgrade, category 1 of 9)
 * strengthens it into a small directed scene rather than ambient opacity
 * pulses:
 *
 * - CAR: a restrained SVG sedan silhouette travels the perspective road
 *   from the vanishing point toward the viewer — "a car arriving to you,"
 *   the semantic read a car-rental hero should have — fading in as it
 *   emerges, growing via scale as it nears, headlight glow intensifying
 *   with proximity, then fading out before the loop resets. Slow (~6s
 *   traverse), never a racing blur.
 * - ROAD: the existing dashed center line keeps its forward-travel read;
 *   the road edges now carry their own slower dash travel too, doubling
 *   the "moving toward the vanishing point" depth cue.
 * - ROUTE: the 4 waypoint nodes no longer pulse independently and
 *   simultaneously — a GSAP timeline lights them in sequence, far to
 *   near, timed to roughly precede the car reaching each one, so the
 *   route reads as the car's own progress rather than decoration.
 * - PARALLAX: unchanged tiering (far slowest, near strongest) — already
 *   correctly ordered, so this pass only strengthens the NEAR foreground
 *   streaks/headlight glow rather than re-deriving the tiers.
 *
 * The whole GSAP timeline (`useGsapScene`, `../../../../components/
 * SceneKit`) is: never created under `prefers-reduced-motion` (the
 * existing CSS `.static` block still governs that state exactly as
 * before), and paused via IntersectionObserver whenever this stage
 * scrolls out of view (brief §14) — never built at all, never left
 * running off-screen.
 */

import { useCallback, useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import useGsapScene from '../../../../components/SceneKit/useGsapScene.js';
import styles from './CarRentalTopBackground.module.scss';

export default function CarRentalTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const carRef = useRef(null);
  const headlightGlowRef = useRef(null);
  const waypointRefs = useRef([]);
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
    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 1.4,
      defaults: { ease: 'power1.inOut' },
    });

    // Settle: car waits at the vanishing point, invisible.
    gsap.set(carRef.current, {
      attr: { transform: 'translate(200 140) scale(0.22)' },
      opacity: 0,
    });
    gsap.set(headlightGlowRef.current, { opacity: 0 });

    // Semantic action: the car emerges and travels the road toward the
    // viewer — "arriving," not racing.
    tl.to(
      carRef.current,
      {
        opacity: 1,
        attr: { transform: 'translate(200 226) scale(1)' },
        duration: 6,
        ease: 'power1.in',
      },
      0,
    );
    tl.to(headlightGlowRef.current, { opacity: 0.8, duration: 2 }, 0.4);

    // Route: waypoints activate in sequence, far to near, each firing
    // just before the car reaches it (car passes y=145/172/205/228 at
    // roughly t=0.3/2.1/4.2/5.8 given the 6s ease-in traverse above).
    const waypointTimes = [0.1, 1.8, 3.9, 5.5];
    waypointRefs.current.forEach((el, index) => {
      if (!el) return;
      tl.fromTo(
        el,
        { opacity: 0.3, scale: 1 },
        {
          opacity: 1,
          scale: 1.5,
          duration: 0.5,
          yoyo: true,
          repeat: 1,
          transformOrigin: 'center',
        },
        waypointTimes[index],
      );
    });

    // Ambient hold, then fade the car out before the loop resets.
    tl.to(headlightGlowRef.current, { opacity: 0, duration: 0.8 }, 5.6);
    tl.to(carRef.current, { opacity: 0, duration: 0.8 }, 5.8);

    return tl;
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
          {/* The car's own headlight glow — a small warm pool cast ahead
              of it on the road. */}
          <radialGradient id="carRentalHeadlightGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff4d6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff4d6" stopOpacity="0" />
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
        {/* The road itself — converging edges + dashed center line, now
            with the edges also carrying a slow dash-travel read. */}
        <g className={styles.road}>
          <path
            className={styles.roadEdge}
            d="M60 240 L195 118 L205 118 L340 240 Z"
          />
          <path className={styles.roadEdgeLeftLine} d="M60 240 L195 118" />
          <path className={styles.roadEdgeRightLine} d="M340 240 L205 118" />
          <path className={styles.roadCenterLine} d="M200 240 L200 120" />
        </g>
        {/* Waypoint nodes along the route — a fourth, faintest node
            furthest down the road strengthens the "route" read. Their
            idle CSS pulse stays as a resting state; the GSAP timeline
            above drives the sequential "route progress" activation. */}
        <circle
          ref={(el) => {
            waypointRefs.current[0] = el;
          }}
          className={styles.waypoint}
          cx="200"
          cy="228"
          r="4"
          style={{ '--delay': '0.9s' }}
        />
        <circle
          ref={(el) => {
            waypointRefs.current[1] = el;
          }}
          className={styles.waypoint}
          cx="200"
          cy="205"
          r="3.2"
          style={{ '--delay': '0s' }}
        />
        <circle
          ref={(el) => {
            waypointRefs.current[2] = el;
          }}
          className={styles.waypoint}
          cx="200"
          cy="172"
          r="2.4"
          style={{ '--delay': '0.6s' }}
        />
        <circle
          ref={(el) => {
            waypointRefs.current[3] = el;
          }}
          className={styles.waypoint}
          cx="200"
          cy="145"
          r="1.7"
          style={{ '--delay': '1.2s' }}
        />
        {/* The car itself — a restrained sedan silhouette. The default
            `transform`/`opacity` attributes below are its considered
            resting frame (parked mid-road, fully visible) — under
            reduced motion the GSAP timeline is never built (see the
            component's own header comment), so these defaults are what
            actually renders; when motion IS enabled, `gsap.set()`
            overrides them before the timeline starts. */}
        <g
          ref={carRef}
          className={styles.car}
          transform="translate(200 205) scale(0.7)"
        >
          <circle
            ref={headlightGlowRef}
            className={styles.carHeadlightGlow}
            cx="20"
            cy="7"
            r="14"
            fill="url(#carRentalHeadlightGlow)"
            opacity="0.35"
          />
          <ellipse
            className={styles.carShadow}
            cx="20"
            cy="15.5"
            rx="17"
            ry="2"
          />
          <path
            className={styles.carBody}
            d="M2 12 L2 9 Q2 7 4 7 L10 7 L14 3 Q15 2 17 2 L27 2 Q29 2 30 3 L34 7 L38 7 Q40 7 40 9 L40 12 Z"
          />
          <circle className={styles.carWheel} cx="10" cy="12" r="2.6" />
          <circle className={styles.carWheel} cx="30" cy="12" r="2.6" />
          <circle className={styles.carHeadlight} cx="39.5" cy="9" r="1.1" />
        </g>
      </svg>

      <div className={styles.near}>
        <span className={[styles.streak, styles.streakA].join(' ')} />
        <span className={[styles.streak, styles.streakB].join(' ')} />
        <span className={[styles.streak, styles.streakC].join(' ')} />
      </div>

      {/* A restrained cinematic vignette — corners recede so the road stage
          itself stays the brightest, most legible part of the frame. */}
      <div className={styles.vignette} />
    </div>
  );
}
