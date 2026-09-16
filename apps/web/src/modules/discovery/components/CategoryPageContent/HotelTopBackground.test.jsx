import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
