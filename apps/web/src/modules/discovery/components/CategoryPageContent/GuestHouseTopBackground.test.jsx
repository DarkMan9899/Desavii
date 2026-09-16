import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
