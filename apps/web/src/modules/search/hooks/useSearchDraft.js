/**
 * `useSearchDraft` — local, not-yet-applied edits of the Search form
 * (`utils/searchDraft.js` holds the rules). Whenever the applied filters
 * change from elsewhere — Back/Forward, a removed chip, "Clear filters",
 * the AI search — the draft starts over from them, so the form never
 * shows stale values next to results that no longer match them.
 *
 * Re-deriving from the applied filters uses React's "adjust state while
 * rendering" pattern (compare a stored key, reset in the same render)
 * rather than an effect, so the form never paints one frame of the old
 * draft.
 */

import { useCallback, useState } from 'react';
import {
  toSearchDraft,
  applySearchDraftPatch,
  getSearchDraftErrors,
  EMPTY_SEARCH_DRAFT,
} from '../utils/searchDraft.js';

export function useSearchDraft(filters, categories) {
  const appliedKey = JSON.stringify(toSearchDraft(filters));
  const [state, setState] = useState(() => ({
    appliedKey,
    draft: toSearchDraft(filters),
  }));
  if (state.appliedKey !== appliedKey) {
    setState({ appliedKey, draft: toSearchDraft(filters) });
  }

  const updateDraft = useCallback(
    (patch) =>
      setState((current) => ({
        ...current,
        draft: applySearchDraftPatch(current.draft, patch, categories),
      })),
    [categories],
  );

  const resetDraft = useCallback(
    () =>
      setState((current) => ({
        ...current,
        draft: toSearchDraft(filters),
      })),
    [filters],
  );

  const clearDraft = useCallback(
    () => setState((current) => ({ ...current, draft: EMPTY_SEARCH_DRAFT })),
    [],
  );

  return {
    draft: state.draft,
    errors: getSearchDraftErrors(state.draft, categories),
    updateDraft,
    resetDraft,
    clearDraft,
  };
}

export default useSearchDraft;
