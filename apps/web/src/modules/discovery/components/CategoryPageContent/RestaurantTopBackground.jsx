/**
 * RestaurantTopBackground — Step 2.6 (Restaurant TOP background only).
 * Mirrors the five existing dedicated category environments' own
 * established technique (FAR/MID/NEAR depth, pointer-parallax via CSS
 * custom properties on a DOM ref, reduced-motion/coarse-pointer guard)
 * with a sixth entirely distinct visual identity, per the brief's
 * explicit "must NOT look like Hotel or Guest House":
 * - Hotel: a corridor of arches — refined hospitality.
 * - Car Rental: a road/route — mobility.
 * - Apartment: layered building window grids — urban residential.
 * - Villa: a dusk mountain horizon — cinematic retreat.
 * - Guest House: a warm-lit village house facade — local/intimate.
 * - Restaurant (this file): an elegant table setting under hanging
 *   pendant lights — refined dining, never a building, road, or
 *   mountain silhouette.
 *
 * - FAR: a warm, dim dining-room atmosphere (navy fading to a deep
 *   burgundy-brown near the horizon) with a row of small hanging
 *   pendant-light silhouettes at varying heights — a restaurant
 *   interior's own ambient ceiling lighting, read at a glance.
 * - MID: a wide elegant table edge (a stroked ellipse) with a second,
 *   farther/smaller table plane behind it for depth, a plate (two
 *   concentric circles) at its center, and restrained line-art cutlery
 *   (a thin fork and knife, never a literal food photo or a giant
 *   icon) flanking it.
 * - NEAR: a warm amber glow pooling behind the plate (candlelight), one
 *   soft vertical glass-reflection glint, and a faint warm haze.
 *
 * All continuous motion (the pendant-light glow breathing, the glass
 * glint shimmer, the haze drift) is slow and low-amplitude — the
 * brief's own explicit "no giant fork/spoon icons, no literal food
 * photos, no neon, no flashing, no bouncing, no fast motion, no
 * nightclub aesthetic" — and switched off entirely under
 * `prefers-reduced-motion`, settling into one deliberate static frame,
 * exactly like the sibling environments' own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
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
        {/* A row of small hanging pendant lights — a restaurant
            interior's own ambient ceiling lighting, the category read
            at a glance, distinct from every sibling skyline. */}
        <svg
          className={styles.pendants}
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          focusable="false"
        >
          {PENDANTS.map(([x, lampY, delay]) => (
            <g key={x} style={{ '--delay': delay }}>
              <line
                className={styles.pendantCord}
                x1={x}
                y1="0"
                x2={x}
                y2={lampY}
              />
              <circle
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
        {/* The plate — two concentric circles. */}
        <circle className={styles.plateOuter} cx="200" cy="205" r="34" />
        <circle className={styles.plateInner} cx="200" cy="205" r="24" />
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
