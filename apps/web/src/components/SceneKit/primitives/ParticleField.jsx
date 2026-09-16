/**
 * ParticleField — generalizes the repeated drifting-dot pattern
 * (Entertainment's `PARTICLES`, Tours' `.particleA/B/C`) into one data-
 * driven renderer: a future scene passes an array of `{ left, bottom,
 * size, delay }` and gets the same `<span>`-per-particle markup every
 * existing environment already hand-authors, instead of re-deriving it.
 */

import PropTypes from 'prop-types';

export default function ParticleField({ particles, className }) {
  return particles.map((particle) => (
    <span
      key={`${particle.left}-${particle.bottom}`}
      className={className}
      style={{
        left: particle.left,
        bottom: particle.bottom,
        width: `${particle.size}px`,
        height: `${particle.size}px`,
        '--delay': particle.delay,
      }}
    />
  ));
}

ParticleField.propTypes = {
  particles: PropTypes.arrayOf(
    PropTypes.shape({
      left: PropTypes.string.isRequired,
      bottom: PropTypes.string.isRequired,
      size: PropTypes.number.isRequired,
      delay: PropTypes.string.isRequired,
    }),
  ).isRequired,
  className: PropTypes.string.isRequired,
};
