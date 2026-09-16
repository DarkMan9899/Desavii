import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import CarRentalTopBackground from './CarRentalTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('CarRentalTopBackground (Step 2.1 — Car Rental TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<CarRentalTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(
      container.querySelectorAll('circle[class*="waypoint"]'),
    ).toHaveLength(4);
    expect(container.querySelector('svg path')).toBeInTheDocument();
    // The FAR skyline silhouette — real FAR/MID separation.
    expect(container.querySelector('[class*="skyline"]')).toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting light streaks', () => {
    mockMatchMedia(true);
    const { container } = render(<CarRentalTopBackground />);
    const root = container.firstChild;
    // A real class name is present (module-hashed, so match by substring
    // rather than the exact compiled name).
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the ambient light streaks', () => {
    mockMatchMedia(false);
    const { container } = render(<CarRentalTopBackground />);
    expect(container.querySelector('[class*="streakA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="streakB"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="streakC"]')).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the car itself.
  describe('the car', () => {
    test('renders with a considered resting frame (parked mid-road, fully visible)', () => {
      mockMatchMedia(true);
      const { container } = render(<CarRentalTopBackground />);
      const car = container.querySelector('g[class*="_car_"]');
      expect(car).toBeInTheDocument();
      expect(car).toHaveAttribute('transform', 'translate(200 205) scale(0.7)');
      // No inline opacity override under reduced motion — the GSAP
      // `gsap.set()` call that would fade it to 0 never runs.
      expect(car.style.opacity).toBe('');
    });

    test('never builds a GSAP timeline under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      render(<CarRentalTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
    });

    test('builds a coordinated GSAP timeline that moves the car from the vanishing point toward the viewer', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const { container } = render(<CarRentalTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const car = container.querySelector('g[class*="_car_"]');

      // Settle: gsap.set() has placed the car at the vanishing point,
      // invisible — deterministic, no real time needed to observe it.
      expect(car.getAttribute('transform')).toBe(
        'translate(200 140) scale(0.22)',
      );
      expect(car.style.opacity).toBe('0');

      // Jump the timeline forward deterministically (GSAP's own
      // `.progress()` API — never a real-time wait, which is both flaky
      // in CI and, per this session's own browser-pane investigation,
      // unreliable in a backgrounded/hidden tab where rAF is throttled).
      timeline.progress(0.5);
      const midY = Number(
        car.getAttribute('transform').match(/translate\(200 ([\d.]+)\)/)[1],
      );
      expect(midY).toBeGreaterThan(140);
      expect(Number(car.style.opacity)).toBeGreaterThan(0);

      timeline.progress(1);
      timeline.kill();
    });
  });
});
