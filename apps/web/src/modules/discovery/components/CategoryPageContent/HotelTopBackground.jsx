/**
 * HotelTopBackground — Step 2.2 (Hotel TOP background only). Mirrors
 * `CarRentalTopBackground.jsx`'s own established technique exactly (same
 * FAR/MID/NEAR depth structure, same pointer-parallax pattern via CSS
 * custom properties written straight to a DOM ref, same reduced-motion/
 * coarse-pointer guard) — a proven pattern reused for a second dedicated
 * category environment rather than a new one invented from scratch.
 *
 * Visual direction is entirely different from Car Rental's road/route
 * motif, per the brief's "elegant stay, comfort, architecture/interior
 * depth, premium hospitality":
 * - FAR: a deep navy atmosphere with a faint, blurred hotel-facade
 *   silhouette near the horizon (arched windows, a stepped roofline) —
 *   the category read at a glance, before any text.
 * - MID: a receding corridor of nested archways (a hotel lobby/entrance
 *   perspective) traced in restrained line work, with a warm amber glow
 *   pooling at the vanishing point and a few small sconce-style window
 *   lights along the walls that pulse gently (never flash).
 * - NEAR: soft, blurred gold light bokeh — restrained foreground glow,
 *   never a hard shape — drifting slowly.
 *
 * All continuous motion (the glow breathing, the window-light pulse, the
 * bokeh drift) is slow and low-amplitude by design — the brief's own
 * explicit "no neon, no flashing, no bouncing, no spinning, no giant
 * zoom, no casino aesthetic" — and is switched off entirely (not merely
 * slowed) under `prefers-reduced-motion`, settling into one deliberate
 * static frame, exactly like Car Rental's own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './HotelTopBackground.module.scss';

export default function HotelTopBackground() {
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
        {/* A soft, blurred hotel-facade silhouette — arched windows and a
            stepped roofline read as "hospitality architecture" even
            before any text, the same FAR/MID separation technique
            CarRentalTopBackground's own skyline uses. */}
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
        </defs>
        {/* Warm light pooling at the corridor's vanishing point, behind
            the archways — the "warm light glow" the brief asks for. */}
        <ellipse
          className={styles.corridorGlow}
          cx="200"
          cy="150"
          rx="85"
          ry="65"
          fill="url(#hotelCorridorGlow)"
        />
        {/* A receding corridor of nested archways — restrained
            architectural line work, largest (nearest) to smallest
            (farthest, closest to the vanishing point). */}
        <g className={styles.arches}>
          <path
            className={styles.archOutline}
            d="M40 240 L40 110 A160 100 0 0 1 360 110 L360 240"
          />
          <path
            className={styles.archOutline}
            d="M90 240 L90 125 A110 85 0 0 1 310 125 L310 240"
          />
          <path
            className={styles.archOutlineInner}
            d="M140 240 L140 140 A60 70 0 0 1 260 140 L260 240"
          />
        </g>
        {/* Sconce-style window lights along the walls, gentle staggered
            pulse — never a flash. */}
        <rect
          className={styles.windowLight}
          x="62"
          y="170"
          width="9"
          height="13"
          rx="2"
          style={{ '--delay': '0s' }}
        />
        <rect
          className={styles.windowLight}
          x="329"
          y="170"
          width="9"
          height="13"
          rx="2"
          style={{ '--delay': '1.1s' }}
        />
        <rect
          className={styles.windowLightSmall}
          x="112"
          y="188"
          width="6"
          height="9"
          rx="1.5"
          style={{ '--delay': '0.6s' }}
        />
        <rect
          className={styles.windowLightSmall}
          x="282"
          y="188"
          width="6"
          height="9"
          rx="1.5"
          style={{ '--delay': '1.6s' }}
        />
      </svg>

      <div className={styles.near}>
        <span className={[styles.bokeh, styles.bokehA].join(' ')} />
        <span className={[styles.bokeh, styles.bokehB].join(' ')} />
        <span className={[styles.bokeh, styles.bokehC].join(' ')} />
      </div>

      {/* A restrained cinematic vignette — corners recede so the
          corridor stays the brightest, most legible part of the frame.
          Purely static (no animation, no parallax). */}
      <div className={styles.vignette} />
    </div>
  );
}
