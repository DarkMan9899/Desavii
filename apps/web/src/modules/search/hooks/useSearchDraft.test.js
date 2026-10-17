import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSearchDraft } from './useSearchDraft.js';
import { SEARCH_INPUT_DEBOUNCE_MS } from './useDebouncedCommit.js';
import { DATE_MODES } from '../utils/categoryFilterCapabilities.js';

const APPLIED = { destination: '', sort: 'newest', dynamicFilters: {} };

function renderDraft(filters = APPLIED, dateMode = DATE_MODES.STAY) {
  const onApply = vi.fn();
  const hook = renderHook(
    ({ current }) => useSearchDraft(current, onApply, { dateMode }),
    { initialProps: { current: filters } },
  );
  return { ...hook, onApply };
}

describe('useSearchDraft (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('keyword applies trimmed, once typing pauses', () => {
    const { result, onApply } = renderDraft();
    act(() => result.current.setKeyword('Yerevan '));
    expect(onApply).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS));
    expect(onApply).toHaveBeenCalledWith({ destination: 'Yerevan' });
  });

  test('applying the trimmed keyword keeps the typed trailing space', () => {
    const { result, rerender } = renderDraft();
    act(() => result.current.setKeyword('Yerevan '));
    rerender({ current: { ...APPLIED, destination: 'Yerevan' } });
    expect(result.current.keyword).toBe('Yerevan ');
  });

  test('an invalid price range is never scheduled', () => {
    const { result, onApply } = renderDraft();
    act(() => result.current.setPrice({ priceMin: '9000' }));
    act(() => result.current.setPrice({ priceMax: '1000' }));
    expect(result.current.priceError).toBe('invalidRange');
    act(() => vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2));
    expect(onApply).not.toHaveBeenCalledWith(
      expect.objectContaining({ priceMax: 1000 }),
    );
  });

  test('flush applies everything pending as one change, and nothing when nothing is pending', () => {
    const { result, onApply } = renderDraft();
    act(() => result.current.flush());
    expect(onApply).not.toHaveBeenCalled();
    act(() => {
      result.current.setKeyword('spa');
      result.current.setPrice({ priceMin: '5000' });
    });
    act(() => {
      result.current.flush();
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      destination: 'spa',
      priceMin: 5000,
      priceMax: undefined,
    });
    act(() => vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  test('a stay range applies only when complete; flush reports a missing end', () => {
    const { result, onApply } = renderDraft();
    act(() => result.current.setDates({ start: '2026-11-01', end: null }));
    expect(onApply).not.toHaveBeenCalled();
    let errors;
    act(() => {
      errors = result.current.flush();
    });
    expect(errors).toEqual({ dates: 'endRequired' });
    expect(result.current.dateError).toBe('endRequired');
    act(() =>
      result.current.setDates({ start: '2026-11-01', end: '2026-11-04' }),
    );
    expect(onApply).toHaveBeenCalledWith({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-04',
    });
    expect(result.current.dateError).toBeUndefined();
  });

  test('a one-day category applies its date at once', () => {
    const { result, onApply } = renderDraft(APPLIED, DATE_MODES.DAY);
    act(() => result.current.setDates('2026-11-05'));
    expect(onApply).toHaveBeenCalledWith({
      dateFrom: '2026-11-05',
      dateTo: '2026-11-05',
    });
  });

  test('cancel discards the draft: nothing applies and the fields show the applied filters', () => {
    const { result, onApply } = renderDraft({ ...APPLIED, priceMax: 20000 });
    act(() => result.current.setPrice({ priceMax: '7000' }));
    act(() => result.current.cancel());
    expect(result.current.priceMax).toBe('20000');
    act(() => vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2));
    expect(onApply).not.toHaveBeenCalled();
  });

  test('clearPrice applies at once — and only when a price is applied', () => {
    const { result, onApply } = renderDraft({ ...APPLIED, priceMin: 5000 });
    act(() => result.current.setPrice({ priceMax: '9000' }));
    act(() => result.current.clearPrice());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      priceMin: undefined,
      priceMax: undefined,
    });
    expect(result.current.priceMin).toBe('');
    act(() => vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS * 2));
    expect(onApply).toHaveBeenCalledTimes(1);

    const unpriced = renderDraft();
    act(() => unpriced.result.current.clearPrice());
    expect(unpriced.onApply).not.toHaveBeenCalled();
  });

  test('a change applied elsewhere (Back, a removed chip) resets the draft', () => {
    const { result, rerender } = renderDraft({
      ...APPLIED,
      destination: 'spa',
    });
    rerender({ current: APPLIED });
    expect(result.current.keyword).toBe('');
  });
});
