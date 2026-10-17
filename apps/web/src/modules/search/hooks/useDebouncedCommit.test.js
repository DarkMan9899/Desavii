import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  SEARCH_INPUT_DEBOUNCE_MS,
  useDebouncedCommit,
} from './useDebouncedCommit.js';

describe('useDebouncedCommit (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('a burst of input commits once, with the last value, after the pause', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedCommit(commit));
    result.current.schedule('s');
    result.current.schedule('sp');
    result.current.schedule('spa');
    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('spa');
  });

  test('flush commits the pending value at once — and only once', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedCommit(commit));
    result.current.schedule('spa');
    expect(result.current.flush()).toBe(true);
    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(result.current.flush()).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  test('cancel drops the pending value', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedCommit(commit));
    result.current.schedule('spa');
    result.current.cancel();
    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  test('nothing commits after unmount', () => {
    const commit = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCommit(commit));
    result.current.schedule('spa');
    unmount();
    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  test('the latest commit callback is used without restarting the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ commit }) => useDebouncedCommit(commit),
      { initialProps: { commit: first } },
    );
    result.current.schedule('spa');
    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS / 2);
    rerender({ commit: second });
    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS / 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('spa');
  });
});
