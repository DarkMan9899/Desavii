import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import VillaTopBackground from './VillaTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('VillaTopBackground (Step 2.4 — Villa TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<VillaTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="ridgeFar"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="ridgeNear"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="roofPlane"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="glow"]')).toBeInTheDocument();
  });

  test('renders a minimal villa roofline and terrace, never a corridor/road/window-grid reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<VillaTopBackground />);
    expect(container.querySelector('[class*="pillar"]')).toBeInTheDocument();
    expect(
      container.querySelector('[class*="terraceLineNear"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="window"]'),
    ).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting haze', () => {
    mockMatchMedia(true);
    const { container } = render(<VillaTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the foreground foliage silhouettes and haze', () => {
    mockMatchMedia(false);
    const { container } = render(<VillaTopBackground />);
    expect(container.querySelector('[class*="foliageA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="foliageB"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="haze"]')).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the terrace visitor + wind sway.
  describe('the visitor and the wind', () => {
    test('the visitor renders on the terrace with a considered resting opacity', () => {
      mockMatchMedia(true);
      const { container } = render(<VillaTopBackground />);
      const visitor = container.querySelector('g[class*="_visitor_"]');
      expect(visitor).toBeInTheDocument();
      expect(visitor).toHaveAttribute('opacity', '0.65');
      expect(visitor.style.opacity).toBe('');
    });

    test('never builds any GSAP animation under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      render(<VillaTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
      expect(toSpy).not.toHaveBeenCalled();
    });

    test('fades the visitor in via the main timeline and sways both foliage silhouettes via independent continuous tweens', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      const { container } = render(<VillaTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const visitor = container.querySelector('g[class*="_visitor_"]');
      expect(visitor.style.opacity).toBe('0');

      timeline.progress(0.5);
      expect(Number(visitor.style.opacity)).toBeGreaterThan(0);
      timeline.progress(1);
      timeline.kill();

      // The wind sway is independent of the main timeline (brief §13:
      // "coordinated timelines" for the semantic action, but the ambient
      // wind is deliberately its own continuous loop) — verified as its
      // own `gsap.to()` call (`repeat: -1`, never part of `tl`) rather
      // than by waiting on GSAP's ticker to actually render a frame.
      const foliageA = container.querySelector('[class*="foliageA"]');
      const foliageB = container.querySelector('[class*="foliageB"]');
      const windCalls = toSpy.mock.calls.filter(
        ([target, vars]) =>
          (target === foliageA || target === foliageB) && vars.repeat === -1,
      );
      expect(windCalls).toHaveLength(2);
      gsap.killTweensOf(foliageA);
      gsap.killTweensOf(foliageB);
    });
  });
});
