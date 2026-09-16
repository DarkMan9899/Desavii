import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
