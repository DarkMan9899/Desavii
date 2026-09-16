/**
 * useParallaxPointer — the pointer-parallax boilerplate every one of the
 * 9 category `*TopBackground.jsx` components currently hand-rolls
 * identically (ref, rAF throttle, `--parallax-x`/`--parallax-y` CSS custom
 * properties, reduced-motion/coarse-pointer disable). Extracted here as
 * the SVG scene foundation's shared primitive (design-tooling setup, brief
 * step 6) for FUTURE TOP environments to opt into — none of the 9 existing
 * components are migrated to it in this step (brief: no visual-design
 * change in this step, and GSAP migration is explicitly deferred too).
 *
 * Returns `{ rootRef, pointerHandlers }`: spread `pointerHandlers` onto the
 * scene root, attach `rootRef` to the same node. Writes directly to CSS
 * custom properties (never React state) so a mousemove never triggers a
 * re-render — the same reasoning every existing TopBackground component's
 * own header comment already documents.
 */

import { useMemo, useRef } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion.js';

export default function useParallaxPointer() {
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

  return { rootRef, pointerHandlers, prefersReducedMotion };
}
