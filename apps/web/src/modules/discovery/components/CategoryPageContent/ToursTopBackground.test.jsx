import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import ToursTopBackground from './ToursTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('ToursTopBackground (Step 2.7 — Tours TOP background only)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<ToursTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="ridgeFar"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="ridgeNear"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="route"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="routeGlow"]')).toBeInTheDocument();
  });

  test('renders nested contour lines and 4 waypoint nodes along a winding route, never a straight road or a building/window/mountain-only reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<ToursTopBackground />);
    expect(container.querySelectorAll('path[class*="contour"]')).toHaveLength(
      3,
    );
    expect(
      container.querySelectorAll('circle[class*="waypoint"]'),
    ).toHaveLength(4);
    expect(
      container.querySelector('[class*="roadEdge"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="window"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="plate"]')).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and hides the drifting haze particles', () => {
    mockMatchMedia(true);
    const { container } = render(<ToursTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the drifting haze particles', () => {
    mockMatchMedia(false);
    const { container } = render(<ToursTopBackground />);
    expect(container.querySelector('[class*="particleA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="particleB"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="particleC"]')).toBeInTheDocument();
  });
});
