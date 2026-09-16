/**
 * HotelTopBackground — Step 2.2 established the FAR/MID/NEAR archway-
 * corridor environment; this pass (TOP live-scene motion upgrade,
 * category 2 of 9) strengthens it into a small directed arrival scene:
 *
 * - ARRIVAL: a restrained guest silhouette (with a small trailing
 *   luggage silhouette) walks the corridor from the vanishing point
 *   toward the viewer — "someone arriving at the hotel," the semantic
 *   read this category should have, mirroring Car Rental's own
 *   "something approaching you" structure but at a person's unhurried
 *   walking pace (~7s), never a car's speed.
 * - LIGHT STORY: the corridor's window lights no longer pulse
 *   independently — a GSAP timeline lights them in sequence as the
 *   guest passes, so the corridor feels like it's welcoming them rather
 *   than just decoratively glowing.
 * - DEPTH: the three arches now carry their own, distinct parallax
 *   multipliers (nearest/largest arch reacts most, farthest/smallest
 *   reacts least) instead of moving together as one flat `.mid` layer —
 *   a real depth-separation cue, not just a bigger single move.
 * - AMBIENCE: a slow warm light sweep crosses the corridor glow,
 *   coordinated with the guest's arrival rather than looping on its own
 *   unrelated schedule.
 *
 * The GSAP timeline (`useGsapScene`) is never created under
 * `prefers-reduced-motion` (the existing CSS `.static` block still
 * governs that state) and is paused via IntersectionObserver whenever
 * this stage scrolls out of view — see CarRentalTopBackground.jsx's own
 * header comment for the identical reasoning, not repeated per category.
 */

import { useCallback, useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import useGsapScene from '../../../../components/SceneKit/useGsapScene.js';
import styles from './HotelTopBackground.module.scss';

export default function HotelTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const guestRef = useRef(null);
  const lightSweepRef = useRef(null);
  const windowLightRefs = useRef([]);
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
      repeatDelay: 1.8,
      defaults: { ease: 'power1.inOut' },
    });

    // Settle: the guest waits at the corridor's vanishing point, faint.
    gsap.set(guestRef.current, {
      attr: { transform: 'translate(200 150) scale(0.2)' },
      opacity: 0,
    });
    gsap.set(lightSweepRef.current, { opacity: 0 });

    // Semantic action: the guest walks the corridor toward the viewer.
    tl.to(
      guestRef.current,
      {
        opacity: 1,
        attr: { transform: 'translate(200 222) scale(0.85)' },
        duration: 7,
        ease: 'power1.in',
      },
      0,
    );

    // Light story: the sconces welcome the guest in sequence as they pass.
    const lightTimes = [0.2, 2.2, 4.4, 6];
    windowLightRefs.current.forEach((el, index) => {
      if (!el) return;
      tl.fromTo(
        el,
        { opacity: 0.4, scale: 1 },
        {
          opacity: 1,
          scale: 1.25,
          duration: 0.6,
          yoyo: true,
          repeat: 1,
          transformOrigin: 'center',
        },
        lightTimes[index],
      );
    });

    // Ambience: one slow warm sweep across the corridor glow, timed with
    // the guest's approach — a lit corridor "noticing" them arrive.
    tl.to(lightSweepRef.current, { opacity: 0.5, duration: 2.5 }, 1);
    tl.to(lightSweepRef.current, { opacity: 0, duration: 2 }, 4.5);

    // Ambient hold, then the guest fades before the loop resets.
    tl.to(guestRef.current, { opacity: 0, duration: 1 }, 6.6);

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
        {/* A soft, blurred hotel-facade silhouette — arched windows and a
            stepped roofline read as "hospitality architecture" even
            before any text. */}
        <svg
          className={styles.facade}
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 60 L0 30 L14 30 L14 14 A7 7 0 0 1 28 14 L28 30 L46 30 L46 20 L60 20 L60 30 L100 30 L100 8 A9 9 0 0 1 118 8 L118 30 L160 30 L160 18 L174 18 L174 30 L210 30 L210 8 A9 9 0 0 1 228 8 L228 30 L260 30 L260 20 L274 20 L274 30 L310 30 L310 14 A7 7 0 0 1 324 14 L324 30 L340 30 L340 22 L354 22 L354 30 L400 30 L400 60 Z" />
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
          <radialGradient id="hotelCorridorGlow" cx="50%" cy="58%" r="55%">
            <stop className={styles.corridorGlowStopInner} offset="0%" />
            <stop className={styles.corridorGlowStopOuter} offset="100%" />
          </radialGradient>
          <linearGradient id="hotelLightSweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0" />
            <stop offset="50%" stopColor="#d4af37" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Warm light pooling at the corridor's vanishing point, behind
            the archways. */}
        <ellipse
          className={styles.corridorGlow}
          cx="200"
          cy="150"
          rx="85"
          ry="65"
          fill="url(#hotelCorridorGlow)"
        />
        {/* A slow warm sweep, coordinated with the guest's arrival rather
            than looping on its own. */}
        <rect
          ref={lightSweepRef}
          className={styles.lightSweep}
          x="60"
          y="110"
          width="280"
          height="130"
          fill="url(#hotelLightSweep)"
        />
        {/* A receding corridor of nested archways — each its own
            parallax layer now, so depth separates by motion, not just
            by size (motion upgrade §5: "arches react at different
            parallax rates"). */}
        <g className={styles.archLayerNear}>
          <path
            className={styles.archOutline}
            d="M40 240 L40 110 A160 100 0 0 1 360 110 L360 240"
          />
        </g>
        <g className={styles.archLayerMid}>
          <path
            className={styles.archOutline}
            d="M90 240 L90 125 A110 85 0 0 1 310 125 L310 240"
          />
        </g>
        <g className={styles.archLayerFar}>
          <path
            className={styles.archOutlineInner}
            d="M140 240 L140 140 A60 70 0 0 1 260 140 L260 240"
          />
        </g>
        {/* Sconce-style window lights — their idle CSS pulse stays as a
            resting state; the GSAP timeline above drives the sequential
            "welcoming the guest" activation. */}
        <rect
          ref={(el) => {
            windowLightRefs.current[0] = el;
          }}
          className={styles.windowLight}
          x="62"
          y="170"
          width="9"
          height="13"
          rx="2"
          style={{ '--delay': '0s' }}
        />
        <rect
          ref={(el) => {
            windowLightRefs.current[1] = el;
          }}
          className={styles.windowLight}
          x="329"
          y="170"
          width="9"
          height="13"
          rx="2"
          style={{ '--delay': '1.1s' }}
        />
        <rect
          ref={(el) => {
            windowLightRefs.current[2] = el;
          }}
          className={styles.windowLightSmall}
          x="112"
          y="188"
          width="6"
          height="9"
          rx="1.5"
          style={{ '--delay': '0.6s' }}
        />
        <rect
          ref={(el) => {
            windowLightRefs.current[3] = el;
          }}
          className={styles.windowLightSmall}
          x="282"
          y="188"
          width="6"
          height="9"
          rx="1.5"
          style={{ '--delay': '1.6s' }}
        />
        {/* The guest — a restrained walking-figure silhouette with a
            small trailing luggage silhouette. Default `transform`/no
            inline opacity below is the considered resting frame (mid-
            corridor, fully visible) rendered under reduced motion, when
            the GSAP timeline that would move/fade it is never built. */}
        <g
          ref={guestRef}
          className={styles.guest}
          transform="translate(200 200) scale(0.7)"
        >
          <ellipse
            className={styles.guestShadow}
            cx="10"
            cy="34"
            rx="13"
            ry="2"
          />
          <circle className={styles.guestHead} cx="6" cy="4" r="4" />
          <path
            className={styles.guestBody}
            d="M2 10 Q6 8 10 10 L11 26 Q9 30 6 30 Q3 30 1 26 Z"
          />
          <path
            className={styles.guestLuggage}
            d="M16 20 L24 20 Q26 20 26 22 L26 30 Q26 32 24 32 L16 32 Q14 32 14 30 L14 22 Q14 20 16 20 Z"
          />
          <path
            className={styles.guestLuggageHandle}
            d="M18 20 L18 17 Q18 15 20 15 Q22 15 22 17 L22 20"
          />
        </g>
      </svg>

      <div className={styles.near}>
        <span className={[styles.bokeh, styles.bokehA].join(' ')} />
        <span className={[styles.bokeh, styles.bokehB].join(' ')} />
        <span className={[styles.bokeh, styles.bokehC].join(' ')} />
      </div>

      {/* A restrained cinematic vignette — corners recede so the
          corridor stays the brightest, most legible part of the frame. */}
      <div className={styles.vignette} />
    </div>
  );
}
