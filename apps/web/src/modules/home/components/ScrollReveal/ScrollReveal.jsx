/**
 * ScrollReveal — the `home` module's one scroll-reveal wrapper (Framer
 * Motion `whileInView`): content fades up a short distance the first time
 * it enters the viewport. Transform and opacity only, once per element.
 *
 * Under `prefers-reduced-motion` (`useReducedMotion`,
 * FRONTEND_ARCHITECTURE.md §31) nothing animates: the same elements render
 * as plain `<div>`s, already visible.
 *
 * `stagger`: for a grid of items — each child gets its own wrapper and a
 * slightly later start, so a row arrives in sequence rather than as one
 * block. The wrappers exist with and without motion, so grid rules aimed
 * at the grid's direct children (a featured tile's span) hold either way.
 *
 * Home rebuild (docs/HOME_REBUILD.md): the former `depth` variant (blur +
 * scale) and `skipInitialHide` are gone — blur is not a transform/opacity
 * change, and the hero heading no longer passes through here at all.
 */

import { Children } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';

const HIDDEN = { opacity: 0, y: 16 };
const VISIBLE = { opacity: 1, y: 0 };
// Mirrors tokens.$ease-out (packages/ui/src/tokens/_motion.scss) — SCSS
// variables aren't importable into JS, so the cubic-bezier is restated
// here rather than introducing a build-time token bridge for one value.
const EASE_OUT = [0, 0, 0.2, 1];
const DURATION_SECONDS = 0.6;
const STAGGER_STEP_SECONDS = 0.06;
const VIEWPORT = { once: true, amount: 0.15 };

export default function ScrollReveal({
  delay = 0,
  stagger = false,
  className = undefined,
  children,
}) {
  const prefersReducedMotion = useReducedMotion();
  const Item = prefersReducedMotion ? 'div' : motion.div;
  const motionProps = (itemDelay) =>
    prefersReducedMotion
      ? {}
      : {
          initial: HIDDEN,
          whileInView: VISIBLE,
          viewport: VIEWPORT,
          transition: {
            duration: DURATION_SECONDS,
            delay: itemDelay,
            ease: EASE_OUT,
          },
        };

  if (stagger) {
    return (
      <div className={className}>
        {Children.map(children, (child, index) => (
          <Item
            key={child?.key ?? index}
            // eslint-disable-next-line react/jsx-props-no-spreading -- motion props only when motion is allowed
            {...motionProps(delay + index * STAGGER_STEP_SECONDS)}
          >
            {child}
          </Item>
        ))}
      </div>
    );
  }

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading -- motion props only when motion is allowed
    <Item className={className} {...motionProps(delay)}>
      {children}
    </Item>
  );
}

ScrollReveal.propTypes = {
  delay: PropTypes.number,
  stagger: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
};
