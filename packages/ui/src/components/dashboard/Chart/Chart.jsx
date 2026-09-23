/**
 * Chart — COMPONENT_LIBRARY.md Part II §5 "Chart". A thin wrapper around
 * `recharts` (this package's first charting dependency) supporting
 * exactly one bar/line/donut time-series shape — extend when a second
 * real chart shape is needed, not preemptively. An accompanying
 * visually-hidden data table gives screen-reader users the same
 * information, per the spec's accessibility clause.
 *
 * `ResponsiveContainer` clones its single child directly to inject
 * measured `width`/`height` (recharts' own sizing mechanism), so the
 * three chart shapes are built as plain elements assigned to a local
 * variable rather than through a wrapper component — a wrapper would
 * receive those injected props instead of forwarding them to the real
 * `<BarChart>`/`<PieChart>`/`<LineChart>`, breaking auto-sizing.
 */

import PropTypes from 'prop-types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import Skeleton from '../../feedback-overlays/Skeleton/Skeleton.jsx';
import EmptyState from '../../feedback-overlays/EmptyState/EmptyState.jsx';
import usePrefersReducedMotion from '../../../hooks/usePrefersReducedMotion.js';
import styles from './Chart.module.scss';

const TYPES = ['line', 'bar', 'donut'];
// recharts takes raw color strings as SVG fill/stroke props, not CSS
// classes — no SCSS token is reachable from JS, so these mirror
// `_colors.scss`'s `$color-royal-blue`/`$color-gold` exactly (primary
// series, then gold only for a secondary comparison series, per
// COMPONENT_LIBRARY.md's "never a rainbow palette" rule). Keep in sync
// with `_colors.scss` if those tokens ever change.
const SERIES_COLORS = ['#1d5fd6', '#c9a24b'];
const GRID_COLOR = '#e4e8ec'; // $color-gray-200

function buildChartElement({
  type,
  data,
  xKey,
  yKey,
  xAxisLabel,
  yAxisLabel,
  isAnimationActive,
}) {
  if (type === 'bar') {
    return (
      <BarChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={GRID_COLOR}
          vertical={false}
        />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} label={xAxisLabel} />
        <YAxis tick={{ fontSize: 12 }} label={yAxisLabel} />
        <RechartsTooltip />
        <Bar
          dataKey={yKey}
          fill={SERIES_COLORS[0]}
          radius={[4, 4, 0, 0]}
          isAnimationActive={isAnimationActive}
        />
      </BarChart>
    );
  }

  if (type === 'donut') {
    return (
      <PieChart>
        <Pie
          data={data}
          dataKey={yKey}
          nameKey={xKey}
          innerRadius="60%"
          outerRadius="90%"
          isAnimationActive={isAnimationActive}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry[xKey]}
              fill={SERIES_COLORS[index % SERIES_COLORS.length]}
            />
          ))}
        </Pie>
        <RechartsTooltip />
      </PieChart>
    );
  }

  return (
    <LineChart data={data}>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke={GRID_COLOR}
        vertical={false}
      />
      <XAxis dataKey={xKey} tick={{ fontSize: 12 }} label={xAxisLabel} />
      <YAxis tick={{ fontSize: 12 }} label={yAxisLabel} />
      <RechartsTooltip />
      <Line
        type="monotone"
        dataKey={yKey}
        stroke={SERIES_COLORS[0]}
        strokeWidth={2}
        dot={false}
        isAnimationActive={isAnimationActive}
      />
    </LineChart>
  );
}

export default function Chart({
  type,
  data = [],
  xKey,
  yKey,
  height = 240,
  loading = false,
  emptyMessage = 'Not enough data yet',
  xAxisLabel = undefined,
  yAxisLabel = undefined,
  ariaLabel = undefined,
}) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (loading) {
    return <Skeleton variant="rect" height={height} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  const chartElement = buildChartElement({
    type,
    data,
    xKey,
    yKey,
    xAxisLabel,
    yAxisLabel,
    isAnimationActive: !prefersReducedMotion,
  });

  return (
    <div className={styles.chart}>
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {chartElement}
        </ResponsiveContainer>
      </div>

      <table className={styles.visuallyHiddenTable} aria-label={ariaLabel}>
        <thead>
          <tr>
            <th scope="col">{xAxisLabel ?? xKey}</th>
            <th scope="col">{yAxisLabel ?? yKey}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row[xKey]}>
              <td>{row[xKey]}</td>
              <td>{row[yKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Chart.propTypes = {
  type: PropTypes.oneOf(TYPES).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- data point shape is caller-defined, keyed only by xKey/yKey
  data: PropTypes.arrayOf(PropTypes.object),
  xKey: PropTypes.string.isRequired,
  yKey: PropTypes.string.isRequired,
  height: PropTypes.number,
  loading: PropTypes.bool,
  emptyMessage: PropTypes.string,
  xAxisLabel: PropTypes.string,
  yAxisLabel: PropTypes.string,
  ariaLabel: PropTypes.string,
};
