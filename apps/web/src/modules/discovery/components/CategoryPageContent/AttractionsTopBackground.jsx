/**
 * AttractionsTopBackground — Step 2.8 (Attractions TOP background
 * only). Mirrors the seven existing dedicated category environments'
 * own established technique (FAR/MID/NEAR depth, pointer-parallax via
 * CSS custom properties on a DOM ref, reduced-motion/coarse-pointer
 * guard) with an eighth entirely distinct visual identity, per the
 * brief's explicit "must feel clearly different from Tours":
 * - Tours: a bird's-eye topographic map, a winding trail, waypoints —
 *   route, movement, exploration, always in motion toward somewhere.
 * - Attractions (this file): a single stepped heritage monument at
 *   rest, framed by an editorial travel-guide card (caption lines, a
 *   folded corner, a landmark pin) — place, culture, story, a
 *   destination itself rather than the path to one.
 *
 * - FAR: a cool stone/editorial atmosphere (navy fading to a muted
 *   stone-beige near the horizon — never Tours' daylight blue or
 *   Villa's warm dusk) with a low, blurred stepped-monument silhouette
 *   and a warm heritage-site horizon glow.
 * - MID: a larger, nearer stepped monument traced in restrained line
 *   art (never filled/literal), a small landmark pin marker, and one
 *   editorial "travel guide" card plane — a rectangle with a folded
 *   corner and three thin caption lines, the brief's own "restrained
 *   document/map texture," never a busy museum-cliché illustration.
 * - NEAR: a soft gold highlight near the monument, a translucent
 *   foreground paper-corner shape, and a faint haze.
 *
 * All continuous motion (the horizon glow breathing, the caption-line
 * reveal, the paper-corner drift) is slow and low-amplitude — the
 * brief's own explicit "no museum cliché graphics, no giant landmark
 * icons, no neon, no fast motion, no bouncing, no gaming-map
 * aesthetics" — and switched off entirely under `prefers-reduced-
 * motion`, settling into one deliberate static frame, exactly like the
 * sibling environments' own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './AttractionsTopBackground.module.scss';

export default function AttractionsTopBackground() {
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
        {/* A low, blurred stepped-monument silhouette — a single
            heritage landmark at rest, the category read at a glance,
            distinct from every sibling skyline. */}
        <svg
          className={styles.monumentFar}
          viewBox="0 0 400 70"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M150 70 L150 52 L170 52 L170 38 L190 38 L190 24 L210 24 L210 38 L230 38 L230 52 L250 52 L250 70 Z" />
          <line x1="200" y1="24" x2="200" y2="8" />
        </svg>
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* The nearer monument — restrained architectural line art,
            never a filled/literal illustration. */}
        <path
          className={styles.monumentOutline}
          d="M120 240 L120 200 L150 200 L150 170 L180 170 L180 145 L220 145 L220 170 L250 170 L250 200 L280 200 L280 240"
        />
        <line
          className={styles.monumentSpire}
          x1="200"
          y1="145"
          x2="200"
          y2="108"
        />
        {/* A small landmark pin — "discovery," never a giant icon. */}
        <circle className={styles.pin} cx="200" cy="190" r="4" />
        <line className={styles.pinStem} x1="200" y1="194" x2="200" y2="206" />
        {/* An editorial "travel guide" card plane — a folded-corner
            rectangle with restrained caption lines, the brief's own
            "document/map texture." */}
        <g className={styles.card}>
          <path d="M290 66 L360 66 L360 128 L290 128 Z M348 66 L360 78 L348 78 Z" />
          <line className={styles.caption} x1="300" y1="92" x2="350" y2="92" />
          <line
            className={styles.captionShort}
            x1="300"
            y1="104"
            x2="336"
            y2="104"
          />
          <line
            className={styles.captionShort}
            x1="300"
            y1="116"
            x2="342"
            y2="116"
          />
        </g>
      </svg>

      <div className={styles.near}>
        <span className={styles.glow} />
        <span className={styles.paperCorner} />
        <div className={styles.haze} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
