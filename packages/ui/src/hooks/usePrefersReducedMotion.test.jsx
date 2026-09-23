import { describe, test, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import usePrefersReducedMotion from './usePrefersReducedMotion.js';

/**
 * Captures the registered `change` listener and tracks add/remove calls
 * — lets a test simulate a live OS-level preference flip and assert
 * cleanup, the same shape `Tooltip.test.jsx`'s own `mockMatchMedia`
 * helper already established for this codebase's `matchMedia` mocking.
 */
function mockMatchMedia(initialMatches) {
  let listener;
  const removeEventListener = vi.fn();
  const addEventListener = vi.fn((event, handler) => {
    listener = handler;
  });
  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener,
    removeEventListener,
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    addEventListener,
    removeEventListener,
    triggerChange(matches) {
      mql.matches = matches;
      act(() => listener({ matches }));
    },
  };
}

function Harness() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return <p data-testid="value">{String(prefersReducedMotion)}</p>;
}

describe('usePrefersReducedMotion (packages/ui) — Step A6.2', () => {
  test('A: reduce already active before mount — the very first render is already true, no effect-driven correction needed', () => {
    mockMatchMedia(true);
    render(<Harness />);
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  test('B: normal preference before mount — the very first render is already false', () => {
    mockMatchMedia(false);
    render(<Harness />);
    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });

  test('C: runtime toggle normal -> reduce updates the hook value', () => {
    const media = mockMatchMedia(false);
    render(<Harness />);
    expect(screen.getByTestId('value')).toHaveTextContent('false');

    media.triggerChange(true);
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  test('D: runtime toggle reduce -> normal updates the hook value', () => {
    const media = mockMatchMedia(true);
    render(<Harness />);
    expect(screen.getByTestId('value')).toHaveTextContent('true');

    media.triggerChange(false);
    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });

  test('E: unmount removes the change listener, and never registers more than one', () => {
    const media = mockMatchMedia(false);
    const { unmount } = render(<Harness />);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).not.toHaveBeenCalled();

    unmount();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener.mock.calls[0][0]).toBe('change');
    expect(media.removeEventListener.mock.calls[0][1]).toBe(
      media.addEventListener.mock.calls[0][1],
    );
  });

  test('SSR/test safety: never throws when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    delete window.matchMedia;
    expect(() => render(<Harness />)).not.toThrow();
    expect(screen.getByTestId('value')).toHaveTextContent('false');
    window.matchMedia = original;
  });
});
