/**
 * Shared React Query `retry` policy (Sprint L — see `AppProviders.jsx`'s
 * own header for the full defect this replaces).
 *
 * Every `api/*.js` call rejects with a normalized `ApiError` (`api/
 * ApiError.js`), so `error.status` is always the real HTTP status code
 * when one exists (`undefined` for a network failure that never reached
 * the server). A 4xx response is the server telling the client its
 * request itself is invalid/unauthorized/not-found/etc. — retrying the
 * exact same request can never turn that into a success, so it isn't
 * "transient" in the sense retries exist for. Anything else (network
 * failure, 5xx) genuinely can succeed on a second attempt, so those keep
 * the original retry budget.
 *
 * @param {number} failureCount
 * @param {{ status?: number }} error
 * @returns {boolean}
 */
export function shouldRetryQuery(failureCount, error) {
  const status = error?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
}

export default shouldRetryQuery;
