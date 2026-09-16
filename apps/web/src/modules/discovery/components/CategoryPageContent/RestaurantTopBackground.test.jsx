import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import RestaurantTopBackground from './RestaurantTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('RestaurantTopBackground (Step 2.6 — Restaurant TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<RestaurantTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[class*="pendantLamp"]')).toHaveLength(
      4,
    );
    expect(container.querySelector('[class*="tableNear"]')).toBeInTheDocument();
    expect(
      container.querySelector('[class*="candleGlow"]'),
    ).toBeInTheDocument();
  });

  test('renders a plate and restrained line-art cutlery, never a corridor/road/window-grid/mountain/village-house reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<RestaurantTopBackground />);
    expect(
      container.querySelector('[class*="plateOuter"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[class*="plateInner"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="fork"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="knife"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="building"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="ridge"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="door"]')).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting haze', () => {
    mockMatchMedia(true);
    const { container } = render(<RestaurantTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the glass glint and haze', () => {
    mockMatchMedia(false);
    const { container } = render(<RestaurantTopBackground />);
    expect(
      container.querySelector('[class*="glassGlint"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="haze"]')).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the waiter + candle flame.
  describe('the waiter and the candle', () => {
    test('the waiter renders with a considered resting frame, and the candle flame is present', () => {
      mockMatchMedia(true);
      const { container } = render(<RestaurantTopBackground />);
      const waiter = container.querySelector('g[class*="_waiter_"]');
      expect(waiter).toBeInTheDocument();
      expect(waiter).toHaveAttribute(
        'transform',
        'translate(200 92) scale(0.4)',
      );
      expect(waiter.style.opacity).toBe('');
      expect(
        container.querySelector('[class*="candleFlame"]'),
      ).toBeInTheDocument();
    });

    test('never builds any GSAP animation under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      render(<RestaurantTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
      expect(toSpy).not.toHaveBeenCalled();
    });

    test('crosses the waiter behind the table via the main timeline and flickers the candle via an independent continuous tween', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      const { container } = render(<RestaurantTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const waiter = container.querySelector('g[class*="_waiter_"]');
      const flame = container.querySelector('[class*="candleFlame"]');

      expect(waiter.getAttribute('transform')).toBe(
        'translate(20 92) scale(0.4)',
      );
      expect(waiter.style.opacity).toBe('0');

      timeline.progress(0.5);
      const midX = Number(
        waiter.getAttribute('transform').match(/translate\(([\d.]+) 92\)/)[1],
      );
      expect(midX).toBeGreaterThan(20);
      timeline.progress(1);
      timeline.kill();

      const flickerCalls = toSpy.mock.calls.filter(
        ([target, vars]) => target === flame && vars.repeat === -1,
      );
      expect(flickerCalls).toHaveLength(1);
      gsap.killTweensOf(flame);
    });
  });
});
