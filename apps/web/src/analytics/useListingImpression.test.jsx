import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import PropTypes from 'prop-types';
import { render, cleanup } from '@testing-library/react';
import { useListingImpression } from './useListingImpression.js';

/**
 * A controllable IntersectionObserver mock — `tests/setup.js` installs a
 * global no-op stub (real jsdom has none at all), which is fine for
 * components that only need `observe()` to not throw, but this hook's
 * whole job is reacting to the callback, so every test here overrides
 * the global with one that captures it and lets the test fire synthetic
 * entries on demand. A plain constructor function returning an object —
 * not a `class` — matches `tests/setup.js`'s own no-op-observer
 * precedent, avoiding `class-methods-use-this` for methods that don't
 * need `this`.
 */
function installControllableObserver() {
  let capturedCallback;
  const observeSpy = vi.fn();
  const disconnectSpy = vi.fn();

  function MockIntersectionObserver(callback) {
    capturedCallback = callback;
    return {
      observe: (...args) => observeSpy(...args),
      unobserve: () => {},
      disconnect: () => disconnectSpy(),
    };
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

  return {
    fireEntry: (entry) => capturedCallback([entry]),
    observeSpy,
    disconnectSpy,
  };
}

function TestTarget({ enabled, onImpression }) {
  const ref = useListingImpression({ enabled, onImpression });
  return <div ref={ref} data-testid="target" />;
}

TestTarget.propTypes = {
  enabled: PropTypes.bool.isRequired,
  onImpression: PropTypes.func.isRequired,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useListingImpression', () => {
  test('49% visible never fires', () => {
    const { fireEntry } = installControllableObserver();
    const onImpression = vi.fn();
    render(<TestTarget enabled onImpression={onImpression} />);

    fireEntry({ isIntersecting: true, intersectionRatio: 0.49 });
    vi.advanceTimersByTime(2000);

    expect(onImpression).not.toHaveBeenCalled();
  });

  test('50%+ for less than 1000ms never fires', () => {
    const { fireEntry } = installControllableObserver();
    const onImpression = vi.fn();
    render(<TestTarget enabled onImpression={onImpression} />);

    fireEntry({ isIntersecting: true, intersectionRatio: 1 });
    vi.advanceTimersByTime(999);

    expect(onImpression).not.toHaveBeenCalled();
  });

  test('50%+ continuously for >= 1000ms fires exactly once', () => {
    const { fireEntry } = installControllableObserver();
    const onImpression = vi.fn();
    render(<TestTarget enabled onImpression={onImpression} />);

    fireEntry({ isIntersecting: true, intersectionRatio: 1 });
    vi.advanceTimersByTime(1000);

    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  test('dropping below 50% before the timer completes cancels it', () => {
    const { fireEntry } = installControllableObserver();
    const onImpression = vi.fn();
    render(<TestTarget enabled onImpression={onImpression} />);

    fireEntry({ isIntersecting: true, intersectionRatio: 1 });
    vi.advanceTimersByTime(500);
    fireEntry({ isIntersecting: false, intersectionRatio: 0.1 });
    vi.advanceTimersByTime(1000);

    expect(onImpression).not.toHaveBeenCalled();
  });

  test('becoming visible again after a cancellation starts a fresh timer and fires', () => {
    const { fireEntry } = installControllableObserver();
    const onImpression = vi.fn();
    render(<TestTarget enabled onImpression={onImpression} />);

    fireEntry({ isIntersecting: true, intersectionRatio: 1 });
    vi.advanceTimersByTime(500);
    fireEntry({ isIntersecting: false, intersectionRatio: 0 });
    vi.advanceTimersByTime(100);
    fireEntry({ isIntersecting: true, intersectionRatio: 1 });
    vi.advanceTimersByTime(1000);

    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  test('when disabled, never observes at all', () => {
    const { observeSpy } = installControllableObserver();
    const onImpression = vi.fn();
    render(<TestTarget enabled={false} onImpression={onImpression} />);

    expect(observeSpy).not.toHaveBeenCalled();
  });

  test('unmounting disconnects the observer and clears any pending timer', () => {
    const { fireEntry, disconnectSpy } = installControllableObserver();
    const onImpression = vi.fn();
    const { unmount } = render(
      <TestTarget enabled onImpression={onImpression} />,
    );

    fireEntry({ isIntersecting: true, intersectionRatio: 1 });
    unmount();
    vi.advanceTimersByTime(1000);

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(onImpression).not.toHaveBeenCalled(); // timer was cleared, never fired post-unmount
  });
});
