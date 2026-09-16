import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import ApartmentTopBackground from './ApartmentTopBackground.jsx';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('ApartmentTopBackground (Step 2.3 — Apartment TOP background only)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('is purely decorative and includes all three depth layers (far/mid/near)', () => {
    mockMatchMedia(false);
    const { container } = render(<ApartmentTopBackground />);
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="skyline"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="buildingA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="buildingB"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="glow"]')).toBeInTheDocument();
  });

  test('renders two distinct window grids (building A larger than building B) — never a corridor/road reuse', () => {
    mockMatchMedia(false);
    const { container } = render(<ApartmentTopBackground />);
    const buildingA = container.querySelector('[class*="buildingA"]');
    const buildingB = container.querySelector('[class*="buildingB"]');
    const windowsA = buildingA.querySelectorAll('rect[class*="window"]').length;
    const windowsB = buildingB.querySelectorAll('rect[class*="window"]').length;
    expect(windowsA).toBe(16); // 4 columns x 4 rows
    expect(windowsB).toBe(9); // 3 columns x 3 rows
    expect(container.querySelector('[class*="arch"]')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="road"]')).not.toBeInTheDocument();
  });

  test('under prefers-reduced-motion, gets the static modifier class and no drifting glow', () => {
    mockMatchMedia(true);
    const { container } = render(<ApartmentTopBackground />);
    const root = container.firstChild;
    expect(root.className).toMatch(/static/);
  });

  test('without prefers-reduced-motion, renders the ambient window glow and glass highlight', () => {
    mockMatchMedia(false);
    const { container } = render(<ApartmentTopBackground />);
    expect(container.querySelector('[class*="glowA"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="glowB"]')).toBeInTheDocument();
    expect(
      container.querySelector('[class*="glassPanel"]'),
    ).toBeInTheDocument();
  });
});
