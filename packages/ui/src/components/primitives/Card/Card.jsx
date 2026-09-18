/**
 * Card — the platform's one surface/container primitive (elevation-0
 * flat card per `UI_UX_GUIDELINES.md` §6.2). `as` lets a card render as
 * a real link (`ListingCardBase.jsx`'s `as={RouterLink} href={...}`)
 * rather than a `<div>` wrapping an inner link, so the whole card stays
 * one focusable, keyboard-activatable element.
 *
 * `elevated` (redesign phase, 2026) opts a card into the premium
 * "floating surface" treatment (tokens.elevation-4, no border, a
 * stronger lift-on-hover) — deliberately a separate opt-in prop rather
 * than folding it into `interactive`, since not every interactive card
 * on the platform should read as a floating premium surface (an admin
 * table row card, for instance, should not) — this is reserved for the
 * public-journey surfaces the redesign brief calls out (listing/search
 * cards, the sticky booking card, hero-adjacent panels).
 *
 * `forwardRef` (Step A3, engagement analytics) — `SearchResultCard`
 * needs a real DOM node ref on the rendered element to observe with
 * `IntersectionObserver` (impression tracking); a plain function
 * component silently drops a `ref` prop instead of forwarding it. Same
 * precedent/rationale as `RouterLink.jsx`'s own `forwardRef` addition —
 * purely additive, every existing caller that never passes `ref` is
 * unaffected.
 */

import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import styles from './Card.module.scss';

const PADDING_VALUES = ['none', 'sm', 'md', 'lg'];

const Card = forwardRef(function Card(
  {
    as: Component = 'div',
    padding = 'md',
    interactive = false,
    elevated = false,
    className = undefined,
    children = undefined,
    ...rest
  },
  ref,
) {
  const combinedClassName = [
    styles.card,
    styles[`card--padding-${padding}`],
    interactive && styles['card--interactive'],
    elevated && styles['card--elevated'],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading -- forwards `href`/`to`/`aria-*`/`onClick`, whose exact set depends on the polymorphic `as` element
    <Component ref={ref} className={combinedClassName} {...rest}>
      {children}
    </Component>
  );
});

/* eslint-disable react/require-default-props -- every optional prop below
   already has an ES6 default in the destructured params on the
   forwardRef-wrapped function above; eslint-plugin-react's default-props
   check doesn't associate propTypes on a forwardRef object with defaults
   declared on its inner render function (same precedent as this
   package's own `Input.jsx`). */
Card.propTypes = {
  as: PropTypes.elementType,
  padding: PropTypes.oneOf(PADDING_VALUES),
  interactive: PropTypes.bool,
  elevated: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};
/* eslint-enable react/require-default-props */

export default Card;
export { PADDING_VALUES as CARD_PADDING_VALUES };
