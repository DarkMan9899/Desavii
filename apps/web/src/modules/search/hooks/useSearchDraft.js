/**
 * `useSearchDraft` — the not-yet-applied part of a live Search form
 * (`utils/searchDraft.js` holds the rules). Each search surface (the
 * desktop bar, the quick price filter, the filter panel) owns one:
 *
 * - keyword: applies once typing pauses (`useDebouncedCommit`);
 * - price: applies once typing pauses, and only as a valid range;
 *   `clearPrice()` (a Clear button) applies at once;
 * - dates: a stay/rental range applies the moment its second day is
 *   picked — never the first day alone (the old bug that wrote half a
 *   range to the URL and reset the calendar); a one-day category applies
 *   its single date at once.
 *
 * `flush()` applies everything still pending as ONE change (the Search /
 * Show results buttons) and reports `{ dates: 'endRequired' }` when a range
 * is still missing its end. `cancel()` discards the draft (closing the
 * panel): nothing pending applies, and the fields show the applied
 * filters again — a reopened panel never shows a price that never applied. When the applied filters change from elsewhere — Back/Forward,
 * a removed chip, Clear filters — the draft starts over from them.
 */

import { useState } from 'react';
import { useDebouncedCommit } from './useDebouncedCommit.js';
import {
  getPriceError,
  parsePriceInput,
  priceToText,
  toDatePatch,
} from '../utils/searchDraft.js';
import { DATE_MODES } from '../utils/categoryFilterCapabilities.js';

function appliedDraft(filters) {
  return {
    keyword: filters.destination ?? '',
    priceMin: priceToText(filters.priceMin),
    priceMax: priceToText(filters.priceMax),
    dateRange: { start: filters.dateFrom ?? null, end: filters.dateTo ?? null },
  };
}

/**
 * The draft after the applied filters changed: text that already means
 * the applied value is kept as typed — a debounced "Yerevan " applies as
 * "Yerevan", and resetting the field would eat the space the visitor is
 * about to type after.
 */
function rebaseDraft(draft, applied, filters) {
  return {
    keyword:
      draft.keyword.trim() === applied.keyword
        ? draft.keyword
        : applied.keyword,
    priceMin:
      parsePriceInput(draft.priceMin) === filters.priceMin
        ? draft.priceMin
        : applied.priceMin,
    priceMax:
      parsePriceInput(draft.priceMax) === filters.priceMax
        ? draft.priceMax
        : applied.priceMax,
    dateRange: applied.dateRange,
  };
}

export function useSearchDraft(filters, onApply, { dateMode } = {}) {
  const applied = appliedDraft(filters);
  const appliedKey = JSON.stringify(applied);
  const [state, setState] = useState({ appliedKey, draft: applied });
  const [dateError, setDateError] = useState(undefined);
  // "Adjust state while rendering": rebase on the applied filters in the
  // same render they change, never painting a stale draft.
  if (state.appliedKey !== appliedKey) {
    setState({
      appliedKey,
      draft: rebaseDraft(state.draft, applied, filters),
    });
  }
  const { draft } = state;
  const setDraft = (patch) =>
    setState((current) => ({
      ...current,
      draft: { ...current.draft, ...patch },
    }));

  const keywordCommit = useDebouncedCommit((keyword) =>
    onApply({ destination: keyword.trim() }),
  );
  const priceCommit = useDebouncedCommit(({ priceMin, priceMax }) =>
    onApply({
      priceMin: parsePriceInput(priceMin),
      priceMax: parsePriceInput(priceMax),
    }),
  );

  const setKeyword = (keyword) => {
    setDraft({ keyword });
    keywordCommit.schedule(keyword);
  };

  const priceError = getPriceError(draft.priceMin, draft.priceMax);
  const setPrice = (patch) => {
    const next = {
      priceMin: draft.priceMin,
      priceMax: draft.priceMax,
      ...patch,
    };
    setDraft(patch);
    if (getPriceError(next.priceMin, next.priceMax)) {
      priceCommit.cancel();
    } else {
      priceCommit.schedule(next);
    }
  };

  const clearPrice = () => {
    priceCommit.cancel();
    setDraft({ priceMin: '', priceMax: '' });
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      onApply({ priceMin: undefined, priceMax: undefined });
    }
  };

  const setDates = (value) => {
    const patch = toDatePatch(value, dateMode);
    setDateError(undefined);
    if (dateMode === DATE_MODES.DAY) {
      onApply(patch);
      return;
    }
    setDraft({ dateRange: value ?? { start: null, end: null } });
    if (patch) onApply(patch);
  };

  const cancelPending = () => {
    keywordCommit.cancel();
    priceCommit.cancel();
  };

  const cancel = () => {
    cancelPending();
    setDateError(undefined);
    setState({ appliedKey, draft: applied });
  };

  const flush = () => {
    cancelPending();
    const patch = {};
    if (draft.keyword.trim() !== (filters.destination ?? '')) {
      patch.destination = draft.keyword.trim();
    }
    if (!priceError) {
      const priceMin = parsePriceInput(draft.priceMin);
      const priceMax = parsePriceInput(draft.priceMax);
      if (priceMin !== filters.priceMin || priceMax !== filters.priceMax) {
        Object.assign(patch, { priceMin, priceMax });
      }
    }
    const isRangeIncomplete =
      dateMode !== DATE_MODES.DAY &&
      Boolean(draft.dateRange.start) &&
      !draft.dateRange.end;
    setDateError(isRangeIncomplete ? 'endRequired' : undefined);
    if (Object.keys(patch).length > 0) onApply(patch);
    return { dates: isRangeIncomplete ? 'endRequired' : undefined };
  };

  return {
    keyword: draft.keyword,
    setKeyword,
    priceMin: draft.priceMin,
    priceMax: draft.priceMax,
    setPrice,
    clearPrice,
    priceError,
    dateRange: draft.dateRange,
    setDates,
    dateError,
    flush,
    cancel,
  };
}

export default useSearchDraft;
