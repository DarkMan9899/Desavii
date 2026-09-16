/**
 * EntertainmentTopBackground — Step 2.9 established the theater-curtain/
 * spotlight/ticket-stub environment; this pass (TOP live-scene motion
 * upgrade, category 9 of 9, final category) strengthens it into a small
 * directed "performance about to begin" scene:
 *
 * - PERFORMER: a single, generic silhouette appears center-stage under
 *   the spotlight, holds a beat, then fades — never a recognizable real
 *   person, the same "pause not passage" logic every sibling
 *   resident/visitor/host already established.
 * - AUDIENCE: a restrained row of silhouettes along the lower edge — the
 *   house is seated, waiting. Static (no motion needed to read as
 *   "audience"), never the scene's main subject.
 * - SPOTLIGHTS: the two beams no longer just sway independently on their
 *   own unrelated schedules (their old CSS keyframe sway is disabled for
 *   as long as this timeline runs — see `buildTimeline`'s own comment
 *   for why) — one GSAP timeline now owns them fully: settled → converge
 *   toward the performer as they appear (a "focus" beat) → hold → relax
 *   back to settled before the loop resets. Slow and cinematic, never a
 *   strobe.
 * - STAGE: unchanged — far/mid/near already carry distinct parallax
 *   tiers from Step 2.9.
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
  const performerRef = useRef(null);
  const beamGoldRef = useRef(null);
  const beamBlueRef = useRef(null);
  const audienceRef = useRef(null);
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
    gsap.set(performerRef.current, { opacity: 0, scaleY: 0.85 });
    gsap.set(audienceRef.current, { opacity: 0 });
    // The beams' own CSS `entertainment-beam-sway` keyframe animation
    // (their reduced-motion-compatible resting behavior) would otherwise
    // fight GSAP's `rotation` tween below every frame — both would be
    // writing the same `transform` property. Disabling it here (via
    // `gsap.set`, so `ctx.revert()` restores it on unmount/cleanup) hands
    // the beams fully to GSAP for as long as this timeline exists.
    gsap.set([beamGoldRef.current, beamBlueRef.current], {
      animation: 'none',
    });

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 2.5,
      defaults: { ease: 'power1.inOut' },
    });

    // The house settles in, once.
    tl.to(audienceRef.current, { opacity: 0.6, duration: 1.5 }, 0);

    // Spotlights: converge/focus on the performer as they appear, hold,
    // then relax — the "choreographed crossing/focus sequence," slow and
    // cinematic, never a strobe.
    tl.to(
      beamGoldRef.current,
      { rotation: 4, duration: 2.2, transformOrigin: 'top center' },
      1,
    );
    tl.to(
      beamBlueRef.current,
      { rotation: -4, duration: 2.2, transformOrigin: 'top center' },
      1,
    );
    tl.to(
      performerRef.current,
      { opacity: 0.85, scaleY: 1, duration: 1.6 },
      1.6,
    );
    tl.to(
      [beamGoldRef.current, beamBlueRef.current],
      { rotation: 0, duration: 2, delay: 2 },
      1.6,
    );

    // Ambient hold, then the performer steps back before the loop resets.
    tl.to(performerRef.current, { opacity: 0, duration: 1 }, 5.8);
    tl.to(audienceRef.current, { opacity: 0, duration: 1 }, 5.8);

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
        {/* Two crossing spotlight beams — restrained gold/blue, now
            choreographed to converge on the performer rather than
            swaying only on their own independent schedules. */}
        <path
          ref={beamGoldRef}
          className={styles.beamGold}
          d="M110 0 L30 210 L190 210 Z"
          fill="url(#entertainmentBeamGold)"
        />
        <path
          ref={beamBlueRef}
          className={styles.beamBlue}
          d="M300 0 L220 210 L380 210 Z"
        />
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
        {/* The audience — a restrained row of silhouettes along the
            lower edge, the house waiting. Default opacity 0.35 below is
            the considered resting frame rendered under reduced motion,
            when the GSAP timeline that would fade it in is never built. */}
        <g ref={audienceRef} className={styles.audience} opacity="0.35">
          <path d="M60 225 Q68 215 76 225 Q84 215 92 225 Q100 215 108 225 Q116 215 124 225 Q132 215 140 225 L140 240 L60 240 Z" />
          <path d="M260 225 Q268 215 276 225 Q284 215 292 225 Q300 215 308 225 Q316 215 324 225 Q332 215 340 225 L340 240 L260 240 Z" />
        </g>
        {/* The performer — a single, generic silhouette center-stage.
            Default opacity 0.3 below is the considered resting frame
            rendered under reduced motion, when the GSAP timeline that
            would fade it in/out is never built. */}
        <g
          ref={performerRef}
          className={styles.performer}
          transform="translate(200 175) scale(0.75)"
          opacity="0.3"
        >
          <circle className={styles.performerHead} cx="0" cy="0" r="4.5" />
          <path
            className={styles.performerBody}
            d="M-5 7 Q0 4 5 7 L6 30 Q3 35 0 35 Q-3 35 -6 30 Z"
          />
        </g>
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
