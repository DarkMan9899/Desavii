import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Chart from './Chart.jsx';

/**
 * `recharts`' own animation (via `react-smooth`) doesn't run under
 * jsdom in a way plain DOM assertions can observe, and `Response
 * Container` reports 0×0 without real layout — so this mocks `recharts`
 * down to prop-capturing stand-ins, the same "assert the prop reaches
 * the real primitive" approach used wherever this codebase can't
 * observe a third-party library's own rendering directly.
 */
const barSpy = vi.fn();
const lineSpy = vi.fn();
const pieSpy = vi.fn();

/* eslint-disable react/prop-types -- lightweight recharts stand-ins local to this mock factory, not a real exported component */
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => children,
  BarChart: ({ children }) => <svg>{children}</svg>,
  Bar: (props) => {
    barSpy(props);
    return null;
  },
  LineChart: ({ children }) => <svg>{children}</svg>,
  Line: (props) => {
    lineSpy(props);
    return null;
  },
  PieChart: ({ children }) => <svg>{children}</svg>,
  Pie: (props) => {
    pieSpy(props);
    return props.children ?? null;
  },
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));
/* eslint-enable react/prop-types */

const DATA = [
  { day: 'Aug 24', value: 10 },
  { day: 'Aug 25', value: 20 },
];

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('Chart (packages/ui) — reduced motion (Step A6.2, brief §8/§9/§10)', () => {
  beforeEach(() => {
    barSpy.mockClear();
    lineSpy.mockClear();
    pieSpy.mockClear();
  });

  test('normal motion preference: Line/Bar/Pie keep animation active from their very first render', () => {
    mockMatchMedia(false);
    render(
      <Chart
        type="line"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(lineSpy.mock.calls[0][0]).toMatchObject({ isAnimationActive: true });

    render(
      <Chart
        type="bar"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(barSpy.mock.calls[0][0]).toMatchObject({ isAnimationActive: true });

    render(
      <Chart
        type="donut"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(pieSpy.mock.calls[0][0]).toMatchObject({ isAnimationActive: true });
  });

  test('prefers-reduced-motion: reduce disables animation on every chart type from their very first render (Step A6.2: no intermediate true state)', () => {
    mockMatchMedia(true);
    render(
      <Chart
        type="line"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(lineSpy.mock.calls[0][0]).toMatchObject({
      isAnimationActive: false,
    });

    render(
      <Chart
        type="bar"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(barSpy.mock.calls[0][0]).toMatchObject({
      isAnimationActive: false,
    });

    render(
      <Chart
        type="donut"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(pieSpy.mock.calls[0][0]).toMatchObject({
      isAnimationActive: false,
    });
  });

  test('never touches chart geometry/colors/data — only isAnimationActive changes between preferences', () => {
    mockMatchMedia(false);
    render(
      <Chart
        type="line"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    const normalProps = lineSpy.mock.calls.at(-1)[0];

    lineSpy.mockClear();
    mockMatchMedia(true);
    render(
      <Chart
        type="line"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    const reducedProps = lineSpy.mock.calls.at(-1)[0];

    expect(normalProps.dataKey).toBe(reducedProps.dataKey);
    expect(normalProps.stroke).toBe(reducedProps.stroke);
    expect(normalProps.strokeWidth).toBe(reducedProps.strokeWidth);
    expect(normalProps.isAnimationActive).not.toBe(
      reducedProps.isAnimationActive,
    );
  });

  test('the accessible hidden data table still renders regardless of motion preference', () => {
    mockMatchMedia(true);
    const { getByText } = render(
      <Chart
        type="line"
        data={DATA}
        xKey="day"
        yKey="value"
        ariaLabel="Views"
      />,
    );
    expect(getByText('Aug 24')).toBeInTheDocument();
    expect(getByText('20')).toBeInTheDocument();
  });
});
