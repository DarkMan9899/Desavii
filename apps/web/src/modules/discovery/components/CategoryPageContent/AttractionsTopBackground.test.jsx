import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import AttractionsTopBackground from './AttractionsTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('AttractionsTopBackground (Step 2.8 — Attractions TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<AttractionsTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelector('[class*="monumentFar"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[class*="monumentOutline"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="glow"]')).toBeInTheDocument();
  });

  test('renders a landmark pin and an editorial travel-guide card with caption lines, never a corridor/road/window-grid/mountain/table reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<AttractionsTopBackground />);
    expect(container.querySelector('circle[class*="pin"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="card"]')).toBeInTheDocument();
    expect(container.querySelectorAll('line[class*="caption"]')).toHaveLength(
      3,
    );
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="window"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="plate"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="contour"]'),
    ).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class', () => {
    mockMatchMedia(true);
    const { container } = render(<AttractionsTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the foreground paper corner and haze', () => {
    mockMatchMedia(false);
    const { container } = render(<AttractionsTopBackground />);
    expect(
      container.querySelector('[class*="paperCorner"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="haze"]')).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the visitor + architectural reveal.
  describe('the visitor and the architectural reveal', () => {
    test('the visitor renders with a considered resting opacity', () => {
      mockMatchMedia(true);
      const { container } = render(<AttractionsTopBackground />);
      const visitor = container.querySelector('g[class*="_visitor_"]');
      expect(visitor).toBeInTheDocument();
      expect(visitor).toHaveAttribute('opacity', '0.7');
      expect(visitor.style.opacity).toBe('');
    });

    test('never builds any GSAP animation under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      render(<AttractionsTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
      expect(toSpy).not.toHaveBeenCalled();
    });

    test('reveals the monument outline and fades the visitor in via the main timeline; floats the card via an independent continuous tween', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      const { container } = render(<AttractionsTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const outline = container.querySelector('[class*="monumentOutline"]');
      const visitor = container.querySelector('g[class*="_visitor_"]');
      const card = container.querySelector('g[class*="_card_"]');

      expect(Number(outline.style.strokeDashoffset)).toBe(420);
      expect(visitor.style.opacity).toBe('0');

      timeline.progress(0.4);
      expect(Number(outline.style.strokeDashoffset)).toBeLessThan(420);
      timeline.progress(0.8);
      expect(Number(visitor.style.opacity)).toBeGreaterThan(0);
      timeline.progress(1);
      timeline.kill();

      const floatCalls = toSpy.mock.calls.filter(
        ([target, vars]) => target === card && vars.repeat === -1,
      );
      expect(floatCalls).toHaveLength(1);
      gsap.killTweensOf(card);
    });
  });
});
