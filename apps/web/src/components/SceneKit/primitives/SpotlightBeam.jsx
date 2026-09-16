/**
 * SpotlightBeam — generalizes Entertainment's crossing gold/blue beam
 * cones (`EntertainmentTopBackground.jsx`'s `.beamGold`/`.beamBlue`) into
 * a reusable gradient-filled triangular beam: a future scene supplies its
 * own apex/base points and gradient id instead of hand-authoring the
 * `<path>` + `<linearGradient>` pair again.
 */

import PropTypes from 'prop-types';

export default function SpotlightBeam({
  apexX,
  apexY,
  baseLeftX,
  baseRightX,
  baseY,
  gradientId,
  color = 'currentColor',
  className,
}) {
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className={className}
        d={`M${apexX} ${apexY} L${baseLeftX} ${baseY} L${baseRightX} ${baseY} Z`}
        fill={`url(#${gradientId})`}
      />
    </>
  );
}

SpotlightBeam.propTypes = {
  apexX: PropTypes.number.isRequired,
  apexY: PropTypes.number.isRequired,
  baseLeftX: PropTypes.number.isRequired,
  baseRightX: PropTypes.number.isRequired,
  baseY: PropTypes.number.isRequired,
  gradientId: PropTypes.string.isRequired,
  color: PropTypes.string,
  className: PropTypes.string.isRequired,
};
