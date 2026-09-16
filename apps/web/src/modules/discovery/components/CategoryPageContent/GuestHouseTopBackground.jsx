/**
 * GuestHouseTopBackground — Step 2.5 (Guest House TOP background only).
 * Mirrors the four existing dedicated category environments' own
 * established technique (FAR/MID/NEAR depth, pointer-parallax via CSS
 * custom properties on a DOM ref, reduced-motion/coarse-pointer guard)
 * with a fifth entirely distinct visual identity, per the brief's
 * explicit "must feel clearly different from Hotel/Apartment/Villa":
 * - Hotel: a corridor of arches — refined hospitality.
 * - Car Rental: a road/route — mobility.
 * - Apartment: layered building window grids — urban residential.
 * - Villa: a dusk mountain horizon — cinematic retreat.
 * - Guest House (this file): a small warm-lit village house facade with
 *   a hillside skyline of smaller homes behind it — local, intimate,
 *   welcoming, never a corridor, road, tower block, or mountain range.
 *
 * - FAR: a warm dusk atmosphere (navy fading to a muted warm rose near
 *   the horizon) with a low, blurred silhouette of several small
 *   pitched-roof houses at varying heights — a hillside village read at
 *   a glance, distinct from every sibling environment's own skyline.
 * - MID: one larger house facade (roof, walls, a door, two glowing
 *   windows) plus a single thin decorative zigzag band along the roof
 *   eave — a restrained nod to Armenian ornamental line-work, never a
 *   busy or "folk-art" pattern filling the scene.
 * - NEAR: two soft warm window-glow blooms, one porch-light glow above
 *   the door, a thin gold threshold-light line at the doorway, and a
 *   faint warm haze.
 *
 * All continuous motion (the window/porch-light breathing, the haze
 * drift) is slow and low-amplitude — the brief's own explicit "no folk-
 * art overload, no busy ornament, no neon, no flashing, no bouncing, no
 * giant zoom, no fake rustic gimmicks" — and switched off entirely under
 * `prefers-reduced-motion`, settling into one deliberate static frame,
 * exactly like the sibling environments' own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './GuestHouseTopBackground.module.scss';

export default function GuestHouseTopBackground() {
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
        {/* A low, blurred hillside-village silhouette — several small
            pitched-roof houses at varying heights, the "local/home"
            read at a glance, distinct from every sibling skyline. */}
        <svg
          className={styles.village}
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path
            d="M0 60 L0 40 L20 22 L40 40 L40 60 Z
               M55 60 L55 38 L75 20 L95 38 L95 60 Z
               M115 60 L115 32 L140 10 L165 32 L165 60 Z
               M180 60 L180 40 L200 24 L220 40 L220 60 Z
               M240 60 L240 34 L265 14 L290 34 L290 60 Z
               M305 60 L305 42 L327 26 L349 42 L349 60 Z
               M360 60 L360 38 L380 22 L400 38 L400 60 Z"
          />
        </svg>
        <div className={styles.horizonGlow} />
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* The guest house itself — roof, walls, door, two windows. */}
        <path className={styles.roof} d="M140 130 L200 90 L260 130 Z" />
        {/* A single restrained decorative band along the roof eave — a
            nod to Armenian ornamental line-work, never a busy pattern. */}
        <path
          className={styles.eaveBand}
          d="M150 132 L160 124 L170 132 L180 124 L190 132 L200 124 L210 132 L220 124 L230 132 L240 124 L250 132"
        />
        <rect
          className={styles.wall}
          x="150"
          y="132"
          width="100"
          height="108"
        />
        <rect
          className={styles.door}
          x="185"
          y="190"
          width="30"
          height="50"
          rx="2"
        />
        <rect
          className={styles.windowGlow}
          x="163"
          y="153"
          width="20"
          height="20"
          rx="1.5"
          style={{ '--delay': '0s' }}
        />
        <rect
          className={styles.windowGlow}
          x="217"
          y="153"
          width="20"
          height="20"
          rx="1.5"
          style={{ '--delay': '1.3s' }}
        />
      </svg>

      <div className={styles.near}>
        <span className={styles.porchGlow} />
        <span className={styles.threshold} />
        <div className={styles.haze} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
