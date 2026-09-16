/**
 * VillaTopBackground — Step 2.4 (Villa TOP background only). Mirrors the
 * three existing dedicated category environments' own established
 * technique (FAR/MID/NEAR depth, pointer-parallax via CSS custom
 * properties on a DOM ref, reduced-motion/coarse-pointer guard) with a
 * fourth entirely distinct visual identity, per the brief's explicit
 * "must NOT look like Hotel or Apartment" requirement:
 * - Hotel: a corridor of arches — hospitality, warmth.
 * - Car Rental: a road/route — mobility.
 * - Apartment: layered building window grids — residential city.
 * - Villa (this file): a dusk mountain horizon with a minimal, spacious
 *   villa roofline and terrace — private retreat, calm, landscape, never
 *   a building facade, corridor, or road.
 *
 * - FAR: a dusk sky (navy fading to a warm amber near the horizon, the
 *   "cinematic escape" read) with two layered mountain-ridge silhouettes
 *   (nearer ridge darker/larger, farther ridge lighter/hazier — the real
 *   depth cue) and a warm sunset glow pooling at the horizon.
 * - MID: a minimal, low-profile villa roofline (a flat roof plane on two
 *   slender supports) and two terrace/infinity-edge lines with a thin
 *   gold accent — restrained geometric architecture, never a detailed
 *   facade, never windows.
 * - NEAR: two soft, blurred foreground foliage silhouettes (dark,
 *   shadowed — never a literal green palm, staying inside the brand's
 *   own navy/gold palette), a warm gold glow drifting slowly, and a
 *   faint atmospheric haze band.
 *
 * All continuous motion (the sunset glow breathing, the haze drift, the
 * foreground glow) is slow and low-amplitude — the brief's own explicit
 * "no neon, no fast motion, no giant zoom, no bouncing, no fake luxury
 * gimmicks" — and switched off entirely under `prefers-reduced-motion`,
 * settling into one deliberate static frame, exactly like the sibling
 * environments' own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './VillaTopBackground.module.scss';

export default function VillaTopBackground() {
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
        {/* Two layered mountain-ridge silhouettes — the farther ridge
            lighter/hazier, the nearer ridge darker/larger — a real
            depth cue, never a building or corridor silhouette. */}
        <svg
          className={styles.ridgeFar}
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 90 L0 50 L40 30 L70 45 L100 20 L140 40 L180 15 L220 38 L260 22 L300 42 L340 18 L370 36 L400 28 L400 90 Z" />
        </svg>
        <svg
          className={styles.ridgeNear}
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 90 L0 60 L30 40 L60 55 L90 35 L130 58 L170 30 L210 52 L250 33 L290 56 L330 38 L360 50 L400 42 L400 90 Z" />
        </svg>
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* A minimal, low-profile villa roofline on two slender supports
            — restrained geometric architecture, spacious rather than
            dense. */}
        <path
          className={styles.roofPlane}
          d="M110 150 L290 150 L310 172 L90 172 Z"
        />
        <line className={styles.pillar} x1="140" y1="172" x2="140" y2="225" />
        <line className={styles.pillar} x1="260" y1="172" x2="260" y2="225" />
        {/* Two terrace/infinity-edge lines — the nearer one carries the
            "restrained gold accent" the brief asks for. */}
        <line
          className={styles.terraceLineFar}
          x1="90"
          y1="200"
          x2="310"
          y2="200"
        />
        <line
          className={styles.terraceLineNear}
          x1="40"
          y1="225"
          x2="360"
          y2="225"
        />
      </svg>

      <div className={styles.near}>
        <span className={[styles.foliage, styles.foliageA].join(' ')} />
        <span className={[styles.foliage, styles.foliageB].join(' ')} />
        <span className={styles.glow} />
        <div className={styles.haze} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
