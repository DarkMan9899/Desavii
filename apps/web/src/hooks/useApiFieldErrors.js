/**
 * Inline field errors from a rejected mutation, for forms that keep their
 * own controlled state (not React Hook Form — RHF forms use `setError`
 * with `parseApiError` directly). `fieldError(path)` returns the
 * translated message for an exact form path; `clearFieldError(path)` hides
 * it once the Partner edits that field. Cleared paths reset automatically
 * whenever a different error object arrives (a new submit).
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseApiError, getIssueMessage } from '../utils/apiErrorFeedback.js';

const NO_CLEARED_PATHS = new Set();

export default function useApiFieldErrors(error) {
  const { t } = useTranslation();
  const parsed = useMemo(() => parseApiError(error), [error]);
  const [cleared, setCleared] = useState({
    source: error,
    paths: NO_CLEARED_PATHS,
  });
  const clearedPaths =
    cleared.source === error ? cleared.paths : NO_CLEARED_PATHS;

  const fieldError = useCallback(
    (path) => {
      if (!parsed || clearedPaths.has(path)) return undefined;
      const issue = parsed.issues.find((candidate) => candidate.path === path);
      return issue ? getIssueMessage(t, issue) : undefined;
    },
    [parsed, clearedPaths, t],
  );

  const clearFieldError = useCallback(
    (path) => {
      setCleared((current) => {
        const base =
          current.source === error ? current.paths : NO_CLEARED_PATHS;
        if (base.has(path)) return current;
        return { source: error, paths: new Set([...base, path]) };
      });
    },
    [error],
  );

  return { fieldError, clearFieldError };
}
