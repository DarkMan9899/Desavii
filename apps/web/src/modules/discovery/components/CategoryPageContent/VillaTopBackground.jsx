/**
 * VillaTopBackground — Step 2.4 established the dusk mountain/terrace
 * environment; this pass (TOP live-scene motion upgrade, category 4 of
 * 9) strengthens it into a small directed "evening on the terrace" scene:
 *
 * - HUMAN SCALE: a restrained person silhouette appears on the terrace,
 *   gazing at the mountain view, then fades — a considered pause, never
 *   a traversal (a villa terrace is a place to stand still and look, not
 *   somewhere someone walks through, the same "pause not passage" logic
 *   Apartment's own balcony resident already established).
 * - NATURE: the two foreground foliage silhouettes now carry a slow,
 *   subtle wind sway (a gentle rotation, never a shake) — Step 2.4 left
 *   them entirely static.
 * - LIGHT: a thin golden edge-highlight sweeps once along the roofline,
 *   coordinated with the terrace figure's appearance — "the sun catching
 *   the architecture," not a decorative loop on its own schedule.
 * - DEPTH: unchanged — the far ridges/mid roofline/near foliage already
 *   carry their own distinct parallax tiers from Step 2.4.
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
import styles from './VillaTopBackground.module.scss';

export default function VillaTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const visitorRef = useRef(null);
  const roofHighlightRef = useRef(null);
  const foliageARef = useRef(null);
  const foliageBRef = useRef(null);
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
      repeatDelay: 2.2,
      defaults: { ease: 'sine.inOut' },
    });

    gsap.set(visitorRef.current, { opacity: 0 });
    gsap.set(roofHighlightRef.current, { opacity: 0, xPercent: -110 });

    // Wind: a slow, subtle sway — never a shake. Independent, continuous
    // loops (not part of the main timeline — nesting an infinite-repeat
    // child inside a finite parent would make the parent's own total
    // duration infinite too), so the wind never pauses/resets with the
    // visitor/light beats below. Returned alongside `tl` so
    // `useGsapScene` still pauses them together when off-screen.
    const windA = gsap.to(foliageARef.current, {
      rotation: 2.5,
      duration: 3.6,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      transformOrigin: '50% 100%',
    });
    const windB = gsap.to(foliageBRef.current, {
      rotation: -2,
      duration: 4.2,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      transformOrigin: '50% 100%',
      delay: 0.8,
    });

    // Light: the sun catches the roofline edge once.
    tl.to(
      roofHighlightRef.current,
      { opacity: 0.55, xPercent: 110, duration: 3, ease: 'sine.inOut' },
      0,
    );
    tl.to(roofHighlightRef.current, { opacity: 0, duration: 1 }, 2.6);

    // Human scale: someone steps onto the terrace to take in the view.
    tl.to(visitorRef.current, { opacity: 0.85, duration: 1.4 }, 1.4);
    tl.to(visitorRef.current, { opacity: 0, duration: 1.2 }, 4.2);

    return [tl, windA, windB];
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
        <div className={styles.horizonGlow} />
        {/* Two layered mountain-ridge silhouettes — the farther ridge
            lighter/hazier, the nearer ridge darker/larger — a real depth
            cue, never a building or corridor silhouette. */}
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
        <defs>
          <linearGradient id="villaRoofHighlight" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0" />
            <stop offset="50%" stopColor="#d4af37" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* A minimal, low-profile villa roofline on two slender supports
            — restrained geometric architecture, spacious rather than
            dense. */}
        <path
          className={styles.roofPlane}
          d="M110 150 L290 150 L310 172 L90 172 Z"
        />
        {/* The sun catching the roofline edge — a single coordinated
            sweep, not a looping decoration. */}
        <rect
          ref={roofHighlightRef}
          className={styles.roofHighlight}
          x="90"
          y="150"
          width="220"
          height="6"
          fill="url(#villaRoofHighlight)"
          opacity="0"
        />
        <line className={styles.pillar} x1="140" y1="172" x2="140" y2="225" />
        <line className={styles.pillar} x1="260" y1="172" x2="260" y2="225" />
        {/* Two terrace/infinity-edge lines — the nearer one carries the
            restrained gold accent. */}
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
        {/* The human-scale cue — a restrained visitor silhouette pausing
            on the terrace. Default opacity 0.65 below is the considered
            resting frame rendered under reduced motion, when the GSAP
            timeline that would fade it in/out is never built. */}
        <g
          ref={visitorRef}
          className={styles.visitor}
          transform="translate(230 200) scale(0.65)"
          opacity="0.65"
        >
          <circle className={styles.visitorHead} cx="0" cy="0" r="4" />
          <path
            className={styles.visitorBody}
            d="M-4 6 Q0 4 4 6 L5 26 Q3 30 0 30 Q-3 30 -5 26 Z"
          />
        </g>
      </svg>

      <div className={styles.near}>
        <span
          ref={foliageARef}
          className={[styles.foliage, styles.foliageA].join(' ')}
        />
        <span
          ref={foliageBRef}
          className={[styles.foliage, styles.foliageB].join(' ')}
        />
        <span className={styles.glow} />
        <div className={styles.haze} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
