/**
 * RouteLine — generalizes the winding dashed path Tours' own environment
 * hand-authors (`ToursTopBackground.jsx`'s `.route`) into a reusable
 * primitive: any future scene that needs a route/path/trail line supplies
 * its own `d` and gets the animated dash-offset sweep for free, gated the
 * same way every existing environment gates its own motion (the `animated`
 * prop — a caller passes `false` under `prefersReducedMotion`, matching
 * the `.static` pattern every `*TopBackground.module.scss` already uses).
 */

import PropTypes from 'prop-types';

export default function RouteLine({ d, className, animated = true }) {
  return (
    <path
      className={className}
      d={d}
      fill="none"
      style={animated ? undefined : { animation: 'none' }}
    />
  );
}

RouteLine.propTypes = {
  d: PropTypes.string.isRequired,
  className: PropTypes.string.isRequired,
  animated: PropTypes.bool,
};
