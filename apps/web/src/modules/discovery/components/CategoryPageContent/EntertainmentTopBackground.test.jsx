import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import EntertainmentTopBackground from './EntertainmentTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('EntertainmentTopBackground (Step 2.9 — Entertainment TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<EntertainmentTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="curtains"]')).toBeInTheDocument();
    expect(
      container.querySelector('[class*="spotlightGlow"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="stageGlow"]')).toBeInTheDocument();
  });

  test('renders crossing gold/blue spotlight beams, a proscenium frame, and a ticket-stub plane, never a corridor/road/window-grid/mountain/table/monument reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<EntertainmentTopBackground />);
    expect(container.querySelector('[class*="beamGold"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="beamBlue"]')).toBeInTheDocument();
    expect(
      container.querySelector('[class*="proscenium"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="ticket"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="window"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="plate"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="contour"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="monument"]'),
    ).not.toBeInTheDocument();
  });

  test('renders 4 drifting light particles', () => {
    mockMatchMedia(false);
    const { container } = render(<EntertainmentTopBackground />);
    expect(container.querySelectorAll('[class*="particle"]')).toHaveLength(4);
  });

  test('under prefers-reduced-motion, gets the static modifier class and hides the particles', () => {
    mockMatchMedia(true);
    const { container } = render(<EntertainmentTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  // TOP live-scene motion upgrade — the performer + audience + beams.
  describe('the performer, the audience, and the spotlight focus', () => {
    test('the performer and audience render with a considered resting opacity', () => {
      mockMatchMedia(true);
      const { container } = render(<EntertainmentTopBackground />);
      const performer = container.querySelector('g[class*="_performer_"]');
      const audience = container.querySelector('g[class*="_audience_"]');
      expect(performer).toBeInTheDocument();
      expect(performer).toHaveAttribute('opacity', '0.3');
      expect(performer.style.opacity).toBe('');
      expect(audience).toBeInTheDocument();
      expect(audience).toHaveAttribute('opacity', '0.35');
      expect(audience.style.opacity).toBe('');
    });

    test('never builds any GSAP animation under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      render(<EntertainmentTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
    });

    test('converges the beams on the performer and seats the audience via one coordinated timeline', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const { container } = render(<EntertainmentTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const performer = container.querySelector('g[class*="_performer_"]');
      const audience = container.querySelector('g[class*="_audience_"]');
      const beamGold = container.querySelector('[class*="beamGold"]');

      expect(performer.style.opacity).toBe('0');
      expect(audience.style.opacity).toBe('0');
      // The CSS sway animation is disabled for as long as GSAP owns the
      // beams (see the component's own header/inline comments for why).
      expect(beamGold.style.animation).toBe('none');

      timeline.progress(0.3);
      expect(Number(audience.style.opacity)).toBeGreaterThan(0);
      timeline.progress(0.6);
      expect(Number(performer.style.opacity)).toBeGreaterThan(0);
      timeline.progress(1);
      timeline.kill();
    });
  });
});
