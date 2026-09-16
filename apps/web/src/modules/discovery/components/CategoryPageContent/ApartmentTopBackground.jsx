/**
 * ApartmentTopBackground — Step 2.3 (Apartment TOP background only).
 * Mirrors `CarRentalTopBackground.jsx`/`HotelTopBackground.jsx`'s own
 * established technique (FAR/MID/NEAR depth, pointer-parallax via CSS
 * custom properties on a DOM ref, reduced-motion/coarse-pointer guard) —
 * the same proven pattern reused for a third dedicated category
 * environment, with its own distinct visual identity per the brief's
 * explicit "must feel clearly different from Hotel" requirement:
 * - Hotel: a single corridor of arches — refined hospitality, warmth.
 * - Car Rental: a road/route receding into depth — mobility.
 * - Apartment (this file): two layered building facades, each its own
 *   grid of windows — modern residential city living, never a corridor
 *   or a road.
 *
 * - FAR: a deep navy city atmosphere with a low, blurred multi-building
 *   skyline silhouette (several rectangular towers at varying heights —
 *   reads as "city," never a single hospitality facade).
 * - MID: two layered apartment-building planes (nearer/larger and
 *   farther/smaller, the depth cue), each a real grid of windows — most
 *   dim, a handful lit gold and gently pulsing (never flashing), plus a
 *   couple of thin balcony lines on the nearer building.
 * - NEAR: soft gold window-glow bokeh and one translucent glass-panel
 *   highlight — restrained foreground light, never a hard shape.
 *
 * The window grid is generated (not hand-authored rect-by-rect like the
 * road/arch paths in the sibling files) because a repeating grid is the
 * one shape in this set genuinely suited to a small loop rather than
 * dozens of near-identical hardcoded elements — window positions and
 * which ones are "lit" are fully deterministic (no `Math.random`), so
 * server-rendered and client-rendered markup always match.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import styles from './ApartmentTopBackground.module.scss';

// [column, row] pairs that are "lit" — deterministic, hand-picked for a
// believable scattered-occupancy read rather than every-other-window
// regularity.
const BUILDING_A_LIT = new Set(['0,1', '2,0', '3,2', '1,3']);
const BUILDING_B_LIT = new Set(['1,0', '2,2']);

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
              className={win.isLit ? styles.windowLit : styles.windowDim}
              x={win.x}
              y={win.y}
              width="22"
              height="18"
              rx="1.5"
              style={win.isLit ? { '--delay': win.delay } : undefined}
            />
          ))}
        </g>
      </svg>

      <div className={styles.near}>
        <span className={[styles.glow, styles.glowA].join(' ')} />
        <span className={[styles.glow, styles.glowB].join(' ')} />
        {/* A soft translucent glass-panel highlight — the "subtle
            foreground glass/light shape" the brief asks for. */}
        <span className={styles.glassPanel} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
