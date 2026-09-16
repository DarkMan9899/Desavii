import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
