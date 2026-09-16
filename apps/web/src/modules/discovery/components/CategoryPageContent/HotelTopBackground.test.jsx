import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import HotelTopBackground from './HotelTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('HotelTopBackground (Step 2.2 — Hotel TOP background only)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<HotelTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    // Far (atmosphere + facade silhouette), mid (the archway corridor, an
    // <svg>), near (light bokeh) — three distinct depth layers.
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('[class*="facade"]')).toBeInTheDocument();
    expect(container.querySelectorAll('svg path[class*="arch"]')).toHaveLength(
      3,
    );
    expect(
      container.querySelectorAll('svg rect[class*="window"]'),
    ).toHaveLength(4);
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting bokeh', () => {
    mockMatchMedia(true);
    const { container } = render(<HotelTopBackground />);
    const root = container.firstChild;
    // A real class name is present (module-hashed, so match by substring
    // rather than the exact compiled name).
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the ambient light bokeh', () => {
    mockMatchMedia(false);
    const { container } = render(<HotelTopBackground />);
    expect(container.querySelector('[class*="bokehA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="bokehB"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="bokehC"]')).toBeInTheDocument();
  });

  // TOP live-scene motion upgrade — the arriving guest.
  describe('the guest', () => {
    test('renders with a considered resting frame (mid-corridor, fully visible)', () => {
      mockMatchMedia(true);
      const { container } = render(<HotelTopBackground />);
      const guest = container.querySelector('g[class*="_guest_"]');
      expect(guest).toBeInTheDocument();
      expect(guest).toHaveAttribute(
        'transform',
        'translate(200 200) scale(0.7)',
      );
      expect(guest.style.opacity).toBe('');
      expect(
        container.querySelector('[class*="guestLuggage"]'),
      ).toBeInTheDocument();
    });

    test('never builds a GSAP timeline under prefers-reduced-motion', () => {
      mockMatchMedia(true);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      render(<HotelTopBackground />);
      expect(timelineSpy).not.toHaveBeenCalled();
    });

    test('builds a coordinated GSAP timeline that walks the guest from the vanishing point toward the viewer', () => {
      mockMatchMedia(false);
      const timelineSpy = vi.spyOn(gsap, 'timeline');
      const { container } = render(<HotelTopBackground />);
      expect(timelineSpy).toHaveBeenCalledTimes(1);

      const timeline = timelineSpy.mock.results[0].value;
      const guest = container.querySelector('g[class*="_guest_"]');

      expect(guest.getAttribute('transform')).toBe(
        'translate(200 150) scale(0.2)',
      );
      expect(guest.style.opacity).toBe('0');

      timeline.progress(0.5);
      const midY = Number(
        guest.getAttribute('transform').match(/translate\(200 ([\d.]+)\)/)[1],
      );
      expect(midY).toBeGreaterThan(150);
      expect(Number(guest.style.opacity)).toBeGreaterThan(0);

      timeline.progress(1);
      timeline.kill();
    });
  });
});
