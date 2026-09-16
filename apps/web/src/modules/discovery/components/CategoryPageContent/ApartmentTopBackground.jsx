/**
 * ApartmentTopBackground — Step 2.3 established the two-building window-
 * grid environment; this pass (TOP live-scene motion upgrade, category 3
 * of 9) strengthens it into a small directed "evening at home" scene:
 *
 * - LIVING CUE: a restrained person silhouette appears on Building A's
 *   upper balcony — stepping out, lingering, stepping back in — never a
 *   traversal like Car Rental's car or Hotel's guest (an apartment
 *   balcony is a place someone pauses, not passes through).
 * - WINDOW STORY: Building A's lit windows no longer just pulse
 *   independently — a GSAP timeline turns them on in a deterministic
 *   reading-order sequence (top row to bottom), timed with the balcony
 *   figure's appearance, so it reads as "evening settling in," never
 *   random blinking.
 * - REFLECTION: the existing glass-panel highlight now sweeps slowly
 *   across the facade instead of sitting static.
 * - DEPTH: unchanged — Building A/B already carry distinct (and
 *   opposite-direction) parallax multipliers from Step 2.3, already the
 *   "nearer reacts more" cue this category needs.
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
import styles from './ApartmentTopBackground.module.scss';

// [column, row] pairs that are "lit" — deterministic, hand-picked for a
// believable scattered-occupancy read rather than every-other-window
// regularity.
const BUILDING_A_LIT = new Set(['0,1', '2,0', '3,2', '1,3']);
const BUILDING_B_LIT = new Set(['1,0', '2,2']);
// Reading-order sequence (top row to bottom) the GSAP timeline lights
// Building A's own lit windows in — a separate, deliberate order from
// the Set above (insertion order there is arbitrary).
const BUILDING_A_LIGHT_SEQUENCE = ['2,0', '0,1', '1,3', '3,2'];

function buildWindowGrid({
  columns,
  rows,
  originX,
  originY,
  cellWidth,
  cellHeight,
  gap,
  litSet,
  delayOffset,
}) {
  const windows = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const isLit = litSet.has(`${col},${row}`);
      windows.push({
        key: `${col}-${row}`,
        gridKey: `${col},${row}`,
        x: originX + col * (cellWidth + gap),
        y: originY + row * (cellHeight + gap),
        isLit,
        delay: `${(delayOffset + (row * columns + col) * 0.35) % 4}s`,
      });
    }
  }
  return windows;
}

export default function ApartmentTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const residentRef = useRef(null);
  const glassPanelRef = useRef(null);
  const buildingAWindowRefs = useRef({});
  const prefersReducedMotion = useReducedMotion();
  const isCoarsePointer =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches;
  const parallaxDisabled = prefersReducedMotion || isCoarsePointer;

  const buildingAWindows = useMemo(
    () =>
      buildWindowGrid({
        columns: 4,
        rows: 4,
        originX: 46,
        originY: 90,
        cellWidth: 22,
        cellHeight: 18,
        gap: 8,
        litSet: BUILDING_A_LIT,
        delayOffset: 0,
      }),
    [],
  );
  const buildingBWindows = useMemo(
    () =>
      buildWindowGrid({
        columns: 3,
        rows: 3,
        originX: 246,
        originY: 118,
        cellWidth: 18,
        cellHeight: 15,
        gap: 7,
        litSet: BUILDING_B_LIT,
        delayOffset: 1.4,
      }),
    [],
  );

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
      repeatDelay: 2,
      defaults: { ease: 'power1.inOut' },
    });

    gsap.set(residentRef.current, { opacity: 0 });
    // `skewX` is repeated in every tween below (not just this initial
    // `set`) — GSAP composes its own transform properties into one
    // `transform` value, so once GSAP owns this element's transform, the
    // static SCSS `skewX(-8deg)` rule is no longer read; the skew has to
    // travel with every GSAP call that touches this element's transform.
    gsap.set(glassPanelRef.current, { xPercent: -30, skewX: -8, opacity: 0 });

    // Window story: the evening settles in, top row to bottom.
    BUILDING_A_LIGHT_SEQUENCE.forEach((gridKey, index) => {
      const el = buildingAWindowRefs.current[gridKey];
      if (!el) return;
      tl.fromTo(
        el,
        { opacity: 0.35, scale: 1 },
        {
          opacity: 1,
          scale: 1.15,
          duration: 0.7,
          yoyo: true,
          repeat: 1,
          transformOrigin: 'center',
        },
        index * 0.5,
      );
    });

    // Living cue: someone steps onto the balcony, lingers, steps back in.
    tl.to(residentRef.current, { opacity: 0.9, duration: 1.2 }, 1.2);
    tl.to(residentRef.current, { opacity: 0, duration: 1 }, 3.6);

    // Reflection: a slow light sweep across the facade.
    tl.to(
      glassPanelRef.current,
      {
        xPercent: 130,
        skewX: -8,
        opacity: 0.6,
        duration: 4,
        ease: 'sine.inOut',
      },
      0.8,
    );
    tl.to(glassPanelRef.current, { opacity: 0, duration: 1 }, 4.4);

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
        {/* A low, blurred multi-tower skyline — several rectangular
            buildings at varying heights, the "residential city" read at
            a glance, distinct from Hotel's single facade silhouette. */}
        <svg
          className={styles.skyline}
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M0 60 L0 34 L20 34 L20 22 L38 22 L38 34 L58 34 L58 12 L80 12 L80 34 L100 34 L100 26 L118 26 L118 34 L140 34 L140 16 L164 16 L164 34 L186 34 L186 28 L204 28 L204 34 L228 34 L228 10 L252 10 L252 34 L272 34 L272 24 L292 24 L292 34 L316 34 L316 18 L340 18 L340 34 L362 34 L362 30 L400 30 L400 60 Z" />
        </svg>
        <div className={styles.horizonGlow} />
      </div>

      <svg
        className={styles.mid}
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* Building B — farther, smaller, sits slightly higher in the
            frame (the depth cue), rendered first so Building A visually
            overlaps in front of it. */}
        <g className={styles.buildingB}>
          <rect x="230" y="100" width="120" height="140" />
          {buildingBWindows.map((win) => (
            <rect
              key={win.key}
              className={win.isLit ? styles.windowLitFar : styles.windowDimFar}
              x={win.x}
              y={win.y}
              width="18"
              height="15"
              rx="1"
              style={win.isLit ? { '--delay': win.delay } : undefined}
            />
          ))}
        </g>

        {/* Building A — nearer, larger, the dominant architectural plane
            with its own window grid and two balcony lines. */}
        <g className={styles.buildingA}>
          <rect x="30" y="70" width="150" height="170" />
          <line
            className={styles.balconyLine}
            x1="30"
            y1="150"
            x2="180"
            y2="150"
          />
          <line
            className={styles.balconyLine}
            x1="30"
            y1="196"
            x2="180"
            y2="196"
          />
          {buildingAWindows.map((win) => (
            <rect
              key={win.key}
              ref={
                win.isLit
                  ? (el) => {
                      buildingAWindowRefs.current[win.gridKey] = el;
                    }
                  : undefined
              }
              className={win.isLit ? styles.windowLit : styles.windowDim}
              x={win.x}
              y={win.y}
              width="22"
              height="18"
              rx="1.5"
              style={win.isLit ? { '--delay': win.delay } : undefined}
            />
          ))}
          {/* The living cue — a restrained resident silhouette on the
              upper balcony. Default opacity 0.7 below is the considered
              resting frame rendered under reduced motion, when the GSAP
              timeline that would fade it in/out is never built. */}
          <g
            ref={residentRef}
            className={styles.resident}
            transform="translate(150 138) scale(0.6)"
            opacity="0.7"
          >
            <circle className={styles.residentHead} cx="0" cy="0" r="4" />
            <path
              className={styles.residentBody}
              d="M-4 6 Q0 4 4 6 L5 24 Q3 28 0 28 Q-3 28 -5 24 Z"
            />
          </g>
        </g>
      </svg>

      <div className={styles.near}>
        <span className={[styles.glow, styles.glowA].join(' ')} />
        <span className={[styles.glow, styles.glowB].join(' ')} />
        {/* A soft translucent glass-panel highlight — now sweeps slowly
            across the facade (motion upgrade §6: "reflection"). */}
        <span ref={glassPanelRef} className={styles.glassPanel} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
