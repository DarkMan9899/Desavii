/**
 * GuestHouseTopBackground — Step 2.5 established the village-house
 * environment; this pass (TOP live-scene motion upgrade, category 5 of
 * 9) strengthens it into a small directed "welcome home" scene:
 *
 * - HOST: a restrained host silhouette appears in the doorway — greeting,
 *   lingering, stepping back — the same "pause not passage" logic
 *   Apartment/Villa's own resident/visitor already established (a
 *   doorway is a place someone appears, not somewhere they walk through
 *   toward the viewer).
 * - HOME LIFE: one window now carries a curtain that sways gently, and
 *   the two window glows + porch light no longer just pulse
 *   independently — a GSAP timeline lights them in sequence as the host
 *   appears, so the house feels like it's welcoming a guest rather than
 *   just decoratively glowing.
 * - DEPTH: unchanged — the hillside village/house/porch already carry
 *   their own distinct parallax tiers from Step 2.5.
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
import styles from './GuestHouseTopBackground.module.scss';

export default function GuestHouseTopBackground() {
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const hostRef = useRef(null);
  const curtainRef = useRef(null);
  const windowGlowRefs = useRef([]);
  const porchGlowRef = useRef(null);
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
      repeatDelay: 2,
      defaults: { ease: 'power1.inOut' },
    });

    gsap.set(hostRef.current, { opacity: 0 });

    // Curtain: a slow, continuous, independent sway — never part of the
    // main timeline's own repeat cycle (see VillaTopBackground.jsx's own
    // wind-sway precedent/reasoning for why).
    const curtainSway = gsap.to(curtainRef.current, {
      skewX: 4,
      duration: 3.2,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      transformOrigin: '50% 0%',
    });

    // Home life: the windows and porch light welcome the host in
    // sequence, rather than pulsing independently.
    const lightTimes = [0, 1.6];
    windowGlowRefs.current.forEach((el, index) => {
      if (!el) return;
      tl.fromTo(
        el,
        { opacity: 0.4, scale: 1 },
        {
          opacity: 1,
          scale: 1.15,
          duration: 0.7,
          yoyo: true,
          repeat: 1,
          transformOrigin: 'center',
        },
        lightTimes[index],
      );
    });
    tl.fromTo(
      porchGlowRef.current,
      { opacity: 0.4 },
      { opacity: 0.85, duration: 1 },
      2.4,
    );

    // Host: someone appears at the door to welcome the guest, then steps
    // back inside.
    tl.to(hostRef.current, { opacity: 0.85, duration: 1.2 }, 2.6);
    tl.to(hostRef.current, { opacity: 0, duration: 1 }, 4.8);

    return [tl, curtainSway];
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
        {/* A low, blurred hillside-village silhouette — several small
            pitched-roof houses at varying heights, the "local/home" read
            at a glance, distinct from every sibling skyline. */}
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
        {/* The host — a restrained silhouette appearing in the doorway.
            Default opacity 0.75 below is the considered resting frame
            rendered under reduced motion, when the GSAP timeline that
            would fade it in/out is never built. */}
        <g
          ref={hostRef}
          className={styles.host}
          transform="translate(200 205) scale(0.55)"
          opacity="0.75"
        >
          <circle className={styles.hostHead} cx="0" cy="0" r="4" />
          <path
            className={styles.hostBody}
            d="M-4 6 Q0 4 4 6 L5 24 Q3 28 0 28 Q-3 28 -5 24 Z"
          />
        </g>
        <rect
          ref={(el) => {
            windowGlowRefs.current[0] = el;
          }}
          className={styles.windowGlow}
          x="163"
          y="153"
          width="20"
          height="20"
          rx="1.5"
          style={{ '--delay': '0s' }}
        />
        {/* A second window with a gently swaying curtain — the "home
            life" read the brief asks for. */}
        <g>
          <rect
            ref={(el) => {
              windowGlowRefs.current[1] = el;
            }}
            className={styles.windowGlow}
            x="217"
            y="153"
            width="20"
            height="20"
            rx="1.5"
            style={{ '--delay': '1.3s' }}
          />
          <path
            ref={curtainRef}
            className={styles.curtain}
            d="M219 153 L219 173 L227 173 L223 163 Z"
          />
        </g>
      </svg>

      <div className={styles.near}>
        <span ref={porchGlowRef} className={styles.porchGlow} />
        <span className={styles.threshold} />
        <div className={styles.haze} />
      </div>

      <div className={styles.vignette} />
    </div>
  );
}
