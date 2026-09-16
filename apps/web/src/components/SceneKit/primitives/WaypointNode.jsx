/**
 * WaypointNode — generalizes the pulsing-circle-on-a-path pattern several
 * existing environments hand-author independently (Tours' `WAYPOINTS`,
 * Attractions' `.pin`+`.pinStem`): one reusable circle-plus-optional-stem
 * marker, positioned via `cx`/`cy` and staggered via `delay`, so a future
 * scene doesn't redefine this shape from scratch.
 */

import PropTypes from 'prop-types';

export default function WaypointNode({
  cx,
  cy,
  r = 4,
  delay = '0s',
  className,
  stemLength = 0,
  stemClassName = undefined,
}) {
  return (
    <g style={{ '--delay': delay }}>
      {stemLength > 0 && (
        <line
          className={stemClassName}
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy + stemLength}
        />
      )}
      <circle className={className} cx={cx} cy={cy} r={r} />
    </g>
  );
}

WaypointNode.propTypes = {
  cx: PropTypes.number.isRequired,
  cy: PropTypes.number.isRequired,
  r: PropTypes.number,
  delay: PropTypes.string,
  className: PropTypes.string.isRequired,
  stemLength: PropTypes.number,
  stemClassName: PropTypes.string,
};
