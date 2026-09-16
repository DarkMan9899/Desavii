/**
 * RestaurantTopBackground — Step 2.6 established the table-setting
 * environment; this pass (TOP live-scene motion upgrade, category 6 of
 * 9) strengthens it into a small directed "dinner service" scene:
 *
 * - WAITER: a restrained, small waiter silhouette crosses slowly in the
 *   far background, behind the table — service happening, never a
 *   traversal toward the viewer like Car Rental's car or Hotel's guest
 *   (a waiter passes through the room, they don't approach the camera).
 * - LIGHT STORY: the four pendant lights no longer pulse independently —
 *   a GSAP timeline lights them in sequence, timed with the waiter's
 *   pass, so the room feels like it's being attended to rather than
 *   just decoratively glowing.
 * - DINING: a small candle-flame shape now sits by the plate with a
 *   restrained flicker (the existing candle glow was ambient light only,
 *   never an actual flame), and a soft light sweep crosses the table
 *   edge once, coordinated with the scene.
 * - DEPTH: unchanged — the pendant/table-far/table-near/near layers
 *   already carry their own distinct parallax tiers from Step 2.6.
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
import styles from './RestaurantTopBackground.module.scss';

// [x, lampY, delay] — deterministic pendant-light positions/heights and
// stagger, a believable irregular hang rather than perfectly even
// spacing.
const PENDANTS = [
  [60, 26, '0s'],
  [150, 18, '1.2s'],
  [250, 30, '0.6s'],
  [340, 20, '1.8s'],
];

export default function RestaurantTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const waiterRef = useRef(null);
  const flameRef = useRef(null);
  const tableSweepRef = useRef(null);
  const pendantRefs = useRef([]);
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
      repeatDelay: 2.4,
      defaults: { ease: 'power1.inOut' },
    });

    gsap.set(waiterRef.current, {
      attr: { transform: 'translate(20 92) scale(0.4)' },
      opacity: 0,
    });
    gsap.set(tableSweepRef.current, { opacity: 0, xPercent: -110 });

    // Candle: a restrained continuous flicker — independent of the main
    // timeline (never part of its repeat cycle), mirroring the wind-sway/
    // curtain-sway precedent from Villa/Guest House.
    const flicker = gsap.to(flameRef.current, {
      scaleY: 1.15,
      opacity: 0.85,
      duration: 0.9,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      transformOrigin: '50% 100%',
    });

    // Waiter: crosses slowly in the background, behind the table.
    tl.to(waiterRef.current, { opacity: 0.6, duration: 0.8 }, 0).to(
      waiterRef.current,
      {
        attr: { transform: 'translate(380 92) scale(0.4)' },
        duration: 7,
        ease: 'sine.inOut',
      },
      0,
    );
    tl.to(waiterRef.current, { opacity: 0, duration: 0.8 }, 6.6);

    // Light story: the pendants attend to the room in sequence, timed
    // with the waiter's pass.
    const lightTimes = [0.5, 2.4, 4.2, 6];
    pendantRefs.current.forEach((el, index) => {
      if (!el) return;
      tl.fromTo(
        el,
        { opacity: 0.4, scale: 1 },
        {
          opacity: 1,
          scale: 1.3,
          duration: 0.6,
          yoyo: true,
          repeat: 1,
          transformOrigin: 'center',
        },
        lightTimes[index],
      );
    });

    // Dining: a soft light sweep crosses the table edge once.
    tl.to(
      tableSweepRef.current,
      { opacity: 0.45, xPercent: 110, duration: 3, ease: 'sine.inOut' },
      2,
    );
    tl.to(tableSweepRef.current, { opacity: 0, duration: 1 }, 5.2);

    return [tl, flicker];
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
        {/* A row of small hanging pendant lights — a restaurant
            interior's own ambient ceiling lighting, the category read
            at a glance, distinct from every sibling skyline. */}
        <svg
          className={styles.pendants}
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          focusable="false"
        >
          {PENDANTS.map(([x, lampY, delay], index) => (
            <g key={x} style={{ '--delay': delay }}>
              <line
                className={styles.pendantCord}
                x1={x}
                y1="0"
                x2={x}
                y2={lampY}
              />
              <circle
                ref={(el) => {
                  pendantRefs.current[index] = el;
                }}
                className={styles.pendantLamp}
                cx={x}
                cy={lampY + 5}
                r="5"
              />
            </g>
          ))}
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
          <linearGradient id="restaurantTableSweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0" />
            <stop offset="50%" stopColor="#d4af37" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* The waiter — a small, restrained silhouette passing behind the
            table. Default transform/no inline opacity below is the
            considered resting frame (standing still, mid-room, faint)
            rendered under reduced motion, when the GSAP timeline that
            would move/fade it is never built. */}
        <g
          ref={waiterRef}
          className={styles.waiter}
          transform="translate(200 92) scale(0.4)"
          opacity="0.35"
        >
          <circle className={styles.waiterHead} cx="0" cy="0" r="4" />
          <path
            className={styles.waiterBody}
            d="M-4 6 Q0 4 4 6 L5 24 Q3 28 0 28 Q-3 28 -5 24 Z"
          />
        </g>
        {/* A second, farther/smaller table plane — the "layered dining
            surfaces" depth cue. */}
        <ellipse
          className={styles.tableFar}
          cx="200"
          cy="178"
          rx="80"
          ry="16"
        />
        {/* The nearer table edge — an elegant, restrained ellipse, never
            a filled/literal tabletop illustration. */}
        <ellipse
          className={styles.tableNear}
          cx="200"
          cy="215"
          rx="150"
          ry="34"
        />
        {/* A soft light sweep crossing the table edge once. */}
        <ellipse
          ref={tableSweepRef}
          className={styles.tableSweep}
          cx="200"
          cy="215"
          rx="150"
          ry="34"
          fill="url(#restaurantTableSweep)"
          opacity="0"
        />
        {/* The plate — two concentric circles. */}
        <circle className={styles.plateOuter} cx="200" cy="205" r="34" />
        <circle className={styles.plateInner} cx="200" cy="205" r="24" />
        {/* A small candle-flame shape by the plate, with a restrained
            flicker (motion upgrade §9: "candle movement") — the existing
            `.candleGlow` (NEAR layer) stays as its ambient light pool. */}
        <g transform="translate(158 195)">
          <ellipse className={styles.candleBody} cx="0" cy="6" rx="3" ry="8" />
          <path
            ref={flameRef}
            className={styles.candleFlame}
            d="M0 -8 Q3 -3 0 0 Q-3 -3 0 -8 Z"
          />
        </g>
        {/* Restrained line-art cutlery — small, thin, never a giant
            icon. */}
        <g className={styles.fork}>
          <line x1="132" y1="185" x2="132" y2="228" />
          <line x1="126" y1="185" x2="126" y2="198" />
          <line x1="132" y1="185" x2="132" y2="198" />
          <line x1="138" y1="185" x2="138" y2="198" />
        </g>
        <g className={styles.knife}>
          <line x1="268" y1="185" x2="268" y2="228" />
          <path d="M263 185 L273 185 L268 200 Z" />
        </g>
      </svg>

      <div className={styles.near}>
        <span className={styles.candleGlow} />
        <span className={styles.glassGlint} />
        <div className={styles.haze} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
