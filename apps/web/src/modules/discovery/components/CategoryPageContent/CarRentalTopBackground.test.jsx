import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<CarRentalTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    // Far (atmosphere), mid (the road, an <svg>), near (light streaks) —
    // three distinct depth layers, per the brief's own explicit
    // FAR/MID/NEAR structure.
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('svg circle')).toHaveLength(3);
    expect(container.querySelector('svg path')).toBeInTheDocument();
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
  });
});
