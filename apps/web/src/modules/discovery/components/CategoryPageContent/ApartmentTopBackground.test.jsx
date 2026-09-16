import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import ApartmentTopBackground from './ApartmentTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('ApartmentTopBackground (Step 2.3 — Apartment TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<ApartmentTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="skyline"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="buildingA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="buildingB"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="glow"]')).toBeInTheDocument();
  });

  test('renders two distinct window grids (building A larger than building B) — never a corridor/road reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<ApartmentTopBackground />);
    const buildingA = container.querySelector('[class*="buildingA"]');
    const buildingB = container.querySelector('[class*="buildingB"]');
    const windowsA = buildingA.querySelectorAll('rect[class*="window"]').length;
    const windowsB = buildingB.querySelectorAll('rect[class*="window"]').length;
    expect(windowsA).toBe(16); // 4 columns x 4 rows
    expect(windowsB).toBe(9); // 3 columns x 3 rows
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting glow', () => {
    mockMatchMedia(true);
    const { container } = render(<ApartmentTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the ambient window glow and glass highlight', () => {
    mockMatchMedia(false);
    const { container } = render(<ApartmentTopBackground />);
    expect(container.querySelector('[class*="glowA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="glowB"]')).toBeInTheDocument();
    expect(
      container.querySelector('[class*="glassPanel"]'),
    ).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the resident living cue.
  describe('the resident', () => {
    test('renders on the balcony with a considered resting opacity', () => {
      mockMatchMedia(true);
      const { container } = render(<ApartmentTopBackground />);
      const resident = container.querySelector('g[class*="_resident_"]');
      expect(resident).toBeInTheDocument();
      expect(resident).toHaveAttribute('opacity', '0.7');
      expect(resident.style.opacity).toBe('');
    });

    test('never builds a GSAP timeline under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      render(<ApartmentTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
    });

    test('builds a coordinated GSAP timeline that fades the resident in on the balcony', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const { container } = render(<ApartmentTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const resident = container.querySelector('g[class*="_resident_"]');

      expect(resident.style.opacity).toBe('0');

      timeline.progress(0.3);
      expect(Number(resident.style.opacity)).toBeGreaterThan(0);

      timeline.progress(1);
      timeline.kill();
    });
  });
});
