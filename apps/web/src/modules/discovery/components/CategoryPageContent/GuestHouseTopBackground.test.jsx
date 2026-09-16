import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import GuestHouseTopBackground from './GuestHouseTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('GuestHouseTopBackground (Step 2.5 — Guest House TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<GuestHouseTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="village"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="roof"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="door"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="porchGlow"]')).toBeInTheDocument();
  });

  test('renders a single restrained decorative eave band and two window lights, never a corridor/road/window-grid/mountain reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<GuestHouseTopBackground />);
    expect(container.querySelector('[class*="eaveBand"]')).toBeInTheDocument();
    expect(
      container.querySelectorAll('rect[class*="windowGlow"]'),
    ).toHaveLength(2);
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="building"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="ridge"]')).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting haze', () => {
    mockMatchMedia(true);
    const { container } = render(<GuestHouseTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the threshold light and haze', () => {
    mockMatchMedia(false);
    const { container } = render(<GuestHouseTopBackground />);
    expect(container.querySelector('[class*="threshold"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="haze"]')).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the host + curtain.
  describe('the host and the curtain', () => {
    test('the host renders in the doorway with a considered resting opacity, and the curtain is present', () => {
      mockMatchMedia(true);
      const { container } = render(<GuestHouseTopBackground />);
      const host = container.querySelector('g[class*="_host_"]');
      expect(host).toBeInTheDocument();
      expect(host).toHaveAttribute('opacity', '0.75');
      expect(host.style.opacity).toBe('');
      expect(container.querySelector('[class*="curtain"]')).toBeInTheDocument();
    });

    test('never builds any GSAP animation under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      render(<GuestHouseTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
      expect(toSpy).not.toHaveBeenCalled();
    });

    test('fades the host in via the main timeline and sways the curtain via an independent continuous tween', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const toSpy = vi.spyOn(gsap, 'to');
      const { container } = render(<GuestHouseTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const host = container.querySelector('g[class*="_host_"]');
      const curtain = container.querySelector('[class*="curtain"]');

      expect(host.style.opacity).toBe('0');

      timeline.progress(0.6);
      expect(Number(host.style.opacity)).toBeGreaterThan(0);
      timeline.progress(1);
      timeline.kill();

      const curtainSwayCalls = toSpy.mock.calls.filter(
        ([target, vars]) => target === curtain && vars.repeat === -1,
      );
      expect(curtainSwayCalls).toHaveLength(1);
      gsap.killTweensOf(curtain);
    });
  });
});
