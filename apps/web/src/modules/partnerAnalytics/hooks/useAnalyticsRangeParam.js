/**
 * `useAnalyticsRangeParam` — the URL's `?range=` is the single source of
 * truth for the selected date range (brief §10: `?range=30`, stable
 * across refresh/back navigation), same URL-sync rule
 * `useAdminListFilters` establishes for Admin list pages. Deliberately a
 * small local hook rather than importing that one: module boundaries
 * (FRONTEND_ARCHITECTURE.md §6.3) mean `modules/admin`'s hook is not
 * this module's to import, and the logic needed here is a single
 * validated integer, not a generic multi-filter object.
 *
 * An invalid/missing URL value resolves to `DEFAULT_RANGE_DAYS` without
 * ever rewriting the URL on read — only `setRange` writes to it, so a
 * bad link a user is shown once is corrected in the rendered data, not
 * silently mutated out from under them.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseRangeDays } from '../constants/ranges.js';

export function useAnalyticsRangeParam() {
  const [searchParams, setSearchParams] = useSearchParams();

  const range = useMemo(
    () => parseRangeDays(searchParams.get('range')),
    [searchParams],
  );

  const setRange = useCallback(
    (nextRange) => {
      const params = new URLSearchParams(searchParams);
      params.set('range', String(nextRange));
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return [range, setRange];
}

export default useAnalyticsRangeParam;
