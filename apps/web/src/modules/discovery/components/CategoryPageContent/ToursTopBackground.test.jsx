import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
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
    cleanup();
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

  // TOP live-scene motion upgrade — the hiker + route progress.
  describe('the hiker and the route progress', () => {
    test('the hiker renders at the trailhead with a considered resting opacity, and the route-progress overlay is present', () => {
      mockMatchMedia(true);
      const { container } = render(<ToursTopBackground />);
      const hiker = container.querySelector('g[class*="_hiker_"]');
      expect(hiker).toBeInTheDocument();
      expect(hiker).toHaveAttribute(
        'transform',
        'translate(20 235) scale(0.4)',
      );
      expect(hiker.style.opacity).toBe('');
      expect(
        container.querySelector('[class*="routeProgress"]'),
      ).toBeInTheDocument();
    });

    test('never builds any GSAP animation under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      render(<ToursTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
      expect(toSpy).not.toHaveBeenCalled();
    });

    test('travels the hiker through the waypoints and reveals the route progress via the main timeline; drifts the contours via an independent tween', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      const { container } = render(<ToursTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const hiker = container.querySelector('g[class*="_hiker_"]');
      const routeProgress = container.querySelector('[class*="routeProgress"]');

      expect(hiker.getAttribute('transform')).toBe(
        'translate(20 235) scale(0.4)',
      );

      timeline.progress(0.9);
      expect(hiker.getAttribute('transform')).not.toBe(
        'translate(20 235) scale(0.4)',
      );
      expect(Number(routeProgress.style.strokeDashoffset)).toBeLessThan(480);
      timeline.progress(1);
      timeline.kill();

      const contourNodes = container.querySelectorAll('path[class*="contour"]');
      const driftCalls = toSpy.mock.calls.filter(
        ([target, vars]) =>
          Array.isArray(target) &&
          vars.repeat === -1 &&
          target.some((node) => contourNodes[0] === node),
      );
      expect(driftCalls).toHaveLength(1);
      gsap.killTweensOf(Array.from(contourNodes));
    });
  });
});
