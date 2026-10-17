/**
 * `useDebouncedCommit` — live filtering for inputs a person types or drags
 * (keyword, price, range sliders): `schedule(value)` commits `value` once
 * input pauses for `delay` ms, so a search runs for the finished value, not
 * once per keystroke or slider step. `flush()` commits the pending value
 * at once (the Search / Show results buttons); `cancel()` drops it (closing
 * the filter panel without applying). A pending value is also dropped on
 * unmount — nothing commits behind the visitor's back afterwards.
 *
 * `commit` is read through a ref, so a caller can pass a fresh closure on
 * every render without restarting the timer.
 */

import { useCallback, useEffect, useRef } from 'react';

/** Long enough to cover a typing burst, short enough to feel live. */
export const SEARCH_INPUT_DEBOUNCE_MS = 400;

export function useDebouncedCommit(commit, delay = SEARCH_INPUT_DEBOUNCE_MS) {
  const commitRef = useRef(commit);
  const timerRef = useRef(null);
  const pendingRef = useRef({ hasValue: false, value: undefined });

  useEffect(() => {
    commitRef.current = commit;
  });

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = { hasValue: false, value: undefined };
  }, []);

  const flush = useCallback(() => {
    if (!pendingRef.current.hasValue) return false;
    const { value } = pendingRef.current;
    cancel();
    commitRef.current(value);
    return true;
  }, [cancel]);

  const schedule = useCallback(
    (value) => {
      clearTimeout(timerRef.current);
      pendingRef.current = { hasValue: true, value };
      timerRef.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => cancel, [cancel]);

  return { schedule, flush, cancel };
}

export default useDebouncedCommit;
