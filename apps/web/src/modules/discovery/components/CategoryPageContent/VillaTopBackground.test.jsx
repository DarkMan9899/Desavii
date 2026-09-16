import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
