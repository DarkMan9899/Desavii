import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
