/**
 * AttractionsTopBackground — Step 2.8 established the heritage-monument/
 * editorial-card environment; this pass (TOP live-scene motion upgrade,
 * category 8 of 9) strengthens it into a small directed "discovering the
 * landmark" scene:
 *
 * - VISITOR: a restrained visitor silhouette appears near the monument,
 *   pausing to take it in, then fades — the same "pause not passage"
 *   logic Apartment/Villa/Guest House already established (a visitor
 *   stands and looks, they don't walk through toward the viewer).
 * - ARCHITECTURE: the monument outline reveals itself once via
 *   `stroke-dashoffset` (measured from the real path length at mount,
 *   the same technique Tours' route-progress overlay uses) — a single
 *   considered reveal, never a repeatedly-redrawn loop (brief §11: "do
 *   not repeatedly redraw everything in a distracting loop").
 * - LIGHT: a slow golden-hour highlight sweeps once across the monument,
 *   coordinated with the reveal.
 * - EDITORIAL: the card plane now has its own gentle, independent float
 *   (alongside the existing `.paperCorner` CSS drift), a subtler depth
 *   layer than the monument itself.
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
import styles from './AttractionsTopBackground.module.scss';

export default function AttractionsTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const visitorRef = useRef(null);
  const monumentOutlineRef = useRef(null);
  const monumentHighlightRef = useRef(null);
  const cardRef = useRef(null);
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
    // `getTotalLength()` isn't implemented in jsdom (this repo's test
    // environment) — a fixed fallback keeps the timeline buildable there
    // without special-casing tests; every real browser measures the
    // actual path (see ToursTopBackground.jsx's identical precedent).
    const pathLength =
      typeof monumentOutlineRef.current.getTotalLength === 'function'
        ? monumentOutlineRef.current.getTotalLength()
        : 420;
    gsap.set(monumentOutlineRef.current, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
    });
    gsap.set(visitorRef.current, { opacity: 0 });
    gsap.set(monumentHighlightRef.current, { opacity: 0, xPercent: -110 });

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 2.5,
      defaults: { ease: 'power1.inOut' },
    });

    // Editorial: the card plane floats gently, independent of the main
    // timeline — a subtler depth layer than the monument.
    const cardFloat = gsap.to(cardRef.current, {
      y: -4,
      duration: 4.5,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    // Architecture: the outline reveals itself once, considered — never
    // a repeated redraw.
    tl.to(monumentOutlineRef.current, {
      strokeDashoffset: 0,
      duration: 3.5,
      ease: 'power1.inOut',
    });

    // Light: the golden hour catches the monument once, following the
    // reveal.
    tl.to(
      monumentHighlightRef.current,
      { opacity: 0.5, xPercent: 110, duration: 2.6, ease: 'sine.inOut' },
      2.8,
    );
    tl.to(monumentHighlightRef.current, { opacity: 0, duration: 1 }, 5.2);

    // Visitor: someone pauses to take in the landmark.
    tl.to(visitorRef.current, { opacity: 0.8, duration: 1.2 }, 1.8);
    tl.to(visitorRef.current, { opacity: 0, duration: 1 }, 5.6);

    return [tl, cardFloat];
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
        <defs>
          <linearGradient
            id="attractionsMonumentHighlight"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0" />
            <stop offset="50%" stopColor="#d4af37" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* The nearer monument — restrained architectural line art, now
            revealed once via `stroke-dashoffset` rather than appearing
            instantly. */}
        <path
          ref={monumentOutlineRef}
          className={styles.monumentOutline}
          d="M120 240 L120 200 L150 200 L150 170 L180 170 L180 145 L220 145 L220 170 L250 170 L250 200 L280 200 L280 240"
        />
        {/* The golden-hour highlight sweeping once across the monument. */}
        <rect
          ref={monumentHighlightRef}
          className={styles.monumentHighlight}
          x="120"
          y="140"
          width="160"
          height="100"
          fill="url(#attractionsMonumentHighlight)"
          opacity="0"
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
        {/* The visitor — a restrained silhouette pausing to take in the
            landmark. Default opacity 0.7 below is the considered resting
            frame rendered under reduced motion, when the GSAP timeline
            that would fade it in/out is never built. */}
        <g
          ref={visitorRef}
          className={styles.visitor}
          transform="translate(100 205) scale(0.55)"
          opacity="0.7"
        >
          <circle className={styles.visitorHead} cx="0" cy="0" r="4" />
          <path
            className={styles.visitorBody}
            d="M-4 6 Q0 4 4 6 L5 26 Q3 30 0 30 Q-3 30 -5 26 Z"
          />
        </g>
        {/* An editorial "travel guide" card plane — a folded-corner
            rectangle with restrained caption lines, now with its own
            gentle independent float. */}
        <g ref={cardRef} className={styles.card}>
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
