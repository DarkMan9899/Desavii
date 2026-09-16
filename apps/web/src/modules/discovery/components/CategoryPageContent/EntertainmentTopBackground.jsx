/**
 * EntertainmentTopBackground — Step 2.9 (Entertainment TOP background
 * only, the last of the 9 categories). Mirrors the eight existing
 * dedicated category environments' own established technique (FAR/MID/
 * NEAR depth, pointer-parallax via CSS custom properties on a DOM ref,
 * reduced-motion/coarse-pointer guard) with a ninth entirely distinct
 * visual identity, per the brief's explicit "must feel clearly
 * different from Restaurant and Attractions":
 * - Restaurant: pendant lights, a table setting — warm dining, at rest.
 * - Attractions: a monument, an editorial card — heritage, at rest.
 * - Entertainment (this file): theater-curtain silhouettes, crossing
 *   gold/blue spotlight beams, a proscenium frame, and a floating
 *   ticket-stub plane — live event, stage, performance energy, never a
 *   dining table or a monument.
 *
 * - FAR: a dark stage atmosphere (navy toward near-black) with two
 *   wavy velvet-curtain silhouettes framing the sides and a warm
 *   spotlight glow pooling center-high (never at the horizon, the way
 *   every other environment's own glow sits).
 * - MID: two crossing spotlight-beam cones (one gold, one blue — the
 *   brief's own "restrained gold/blue highlights"), a restrained
 *   proscenium frame outline, and one floating ticket-stub plane (a
 *   card with a dashed tear line, never a giant poster).
 * - NEAR: 4 soft drifting light particles (stage dust, never confetti),
 *   a warm glow pooling at "stage floor" level, and a cool blue
 *   counterpoint glow.
 *
 * All continuous motion (the spotlight-beam sway, the ticket-plane
 * float, the particle drift) is slow and low-amplitude — the brief's
 * own explicit "no nightclub neon chaos, no strobe/flashing, no fast
 * movement, no giant scale, no gaming effects, no bouncing/spinning" —
 * and switched off entirely under `prefers-reduced-motion`, settling
 * into one deliberate static frame, exactly like the sibling
 * environments' own `.static` treatment.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './EntertainmentTopBackground.module.scss';

// Deterministic drifting light particles — position, size, and stagger.
const PARTICLES = [
  { left: '22%', bottom: '18%', size: 4, delay: '0s' },
  { left: '68%', bottom: '30%', size: 3, delay: '2s' },
  { left: '82%', bottom: '14%', size: 5, delay: '1s' },
  { left: '45%', bottom: '38%', size: 3, delay: '3s' },
];

export default function EntertainmentTopBackground() {
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
        <div className={styles.spotlightGlow} />
        {/* Two wavy velvet-curtain silhouettes framing the sides — the
            category read at a glance, distinct from every sibling
            environment. */}
        <svg
          className={styles.curtains}
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 0 L0 90 L68 90 Q48 68 62 48 Q44 28 58 10 Q38 0 0 0 Z" />
          <path d="M400 0 L400 90 L332 90 Q352 68 338 48 Q356 28 342 10 Q362 0 400 0 Z" />
        </svg>
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient
            id="entertainmentBeamGold"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Two crossing spotlight beams — restrained gold/blue, never a
            harsh neon wash. */}
        <path
          className={styles.beamGold}
          d="M110 0 L30 210 L190 210 Z"
          fill="url(#entertainmentBeamGold)"
        />
        <path className={styles.beamBlue} d="M300 0 L220 210 L380 210 Z" />
        {/* A restrained proscenium frame outline — the "distant stage
            geometry," never a filled/literal set illustration. */}
        <rect
          className={styles.proscenium}
          x="55"
          y="40"
          width="290"
          height="185"
          rx="4"
        />
        {/* A floating ticket-stub plane — a card with a dashed tear
            line, never a giant poster. */}
        <g className={styles.ticket}>
          <rect x="284" y="62" width="76" height="46" rx="4" />
          <line x1="309" y1="62" x2="309" y2="108" strokeDasharray="3 4" />
          <circle cx="309" cy="62" r="3" />
          <circle cx="309" cy="108" r="3" />
        </g>
      </svg>

      <div className={styles.near}>
        {PARTICLES.map((particle) => (
          <span
            key={particle.left}
            className={styles.particle}
            style={{
              left: particle.left,
              bottom: particle.bottom,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              '--delay': particle.delay,
            }}
          />
        ))}
        <span className={styles.stageGlow} />
        <span className={styles.coolGlow} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
