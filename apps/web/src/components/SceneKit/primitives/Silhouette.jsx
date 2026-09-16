/**
 * Silhouette — the registry/dispatcher shape for future scene figures
 * (car, hiker, waiter, performer, audience row, per the design-tooling
 * brief's step 6 list), mirroring `DestinationArt.jsx`'s own `Motif`
 * switch-on-`name` pattern rather than inventing a new one. Deliberately
 * ships with exactly ONE concrete kind (`person`, a plain standing-figure
 * silhouette — the shape every other kind above would specialize from)
 * as the pattern example; adding `car`/`hiker`/`waiter`/`performer`/
 * `audience-row` later is one more `case`, not a redesign. The brief's
 * own "do not build all assets yet" — this is the foundation, not the
 * asset set.
 */

import PropTypes from 'prop-types';

export default function Silhouette({ kind, className }) {
  switch (kind) {
    case 'person':
      return (
        <path
          className={className}
          d="M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10c-5 0-9 2.7-9 6v2h18v-2c0-3.3-4-6-9-6Z"
        />
      );
    default:
      return null;
  }
}

Silhouette.propTypes = {
  kind: PropTypes.oneOf(['person']).isRequired,
  className: PropTypes.string.isRequired,
};
