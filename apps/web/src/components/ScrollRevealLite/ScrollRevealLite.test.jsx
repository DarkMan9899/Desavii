import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import ScrollRevealLite from './ScrollRevealLite.jsx';

describe('ScrollRevealLite', () => {
  test('renders children inside a plain div, no framer-motion dependency', () => {
    const { getByText, container } = render(
      <ScrollRevealLite>
        <p>Hello</p>
      </ScrollRevealLite>,
    );
    expect(getByText('Hello')).toBeInTheDocument();
    expect(container.firstChild.tagName).toBe('DIV');
  });

  test('applies the depth variant class when requested', () => {
    const { container } = render(
      <ScrollRevealLite variant="depth">
        <p>Hello</p>
      </ScrollRevealLite>,
    );
    // jsdom has no real IntersectionObserver (tests/setup.js stubs a
    // no-op) so `inView` never flips true here — this only asserts the
    // variant class is applied, not the eventual revealed state.
    expect(container.firstChild.className).toContain('depth');
  });
});
