/**
 * Global error-handling middleware.
 *
 * Implements BACKEND_ARCHITECTURE.md §23: the ONLY place that converts a
 * thrown exception into an HTTP response. No Controller contains its own
 * try/catch-to-response logic — a Controller either succeeds or lets its
 * exception propagate here.
 *
 * Response shape matches API_SPECIFICATION.md §8-9 exactly.
 */

import { AppError } from '../errors/AppError.js';
import config from '../config/index.js';
import { createErrorTracker } from '../infrastructure/observability/createErrorTracker.js';

// P0.8 (Master Roadmap): one shared instance for the process lifetime —
// mirrors this file's own "plain module-level dependency" shape rather
// than threading a new constructor argument through app.js, matching
// how `config`/`logger` are already imported directly here.
const errorTracker = createErrorTracker();

// body-parser (express.raw/json/urlencoded) throws a plain error with
// `type: 'entity.too.large'` when a request body exceeds a route's
// configured `limit` — never one of our own AppError subclasses, so
// without special-casing it below it fell into the generic 500 branch: a
// routine, expected client mistake (an oversized upload) reported as an
// internal server error, complete with error-tracker noise. Step L3
// (brief §12/§30) makes this a real, regularly-exercised path once the
// listings media route enforces a real per-kind body limit instead of
// one flat 200MB ceiling every legitimate image upload used to stay
// safely under.
const PAYLOAD_TOO_LARGE_MESSAGE =
  'The uploaded file is larger than the maximum allowed size for this type of file.';

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const isPayloadTooLarge = !isAppError && err.type === 'entity.too.large';

  let httpStatus = 500;
  let code = 'INTERNAL_ERROR';
  if (isAppError) {
    httpStatus = err.httpStatus;
    code = err.code;
  } else if (isPayloadTooLarge) {
    httpStatus = 413;
    code = 'PAYLOAD_TOO_LARGE';
  }

  // Full internal detail is always logged server-side, regardless of
  // what is safe to return to the client (BACKEND_ARCHITECTURE.md §23).
  const log = req.log ?? req.app.get('logger');
  const logPayload = { err, code, httpStatus, requestId: req.requestId };
  if (httpStatus >= 500) {
    log?.error(logPayload, 'Unhandled error');
    // P0.8: only genuine server-side failures (5xx) go to the error
    // tracker — a 4xx is an expected, already-handled outcome
    // (validation, auth, not-found), not a signal something is broken.
    errorTracker.captureException(err, {
      code,
      httpStatus,
      requestId: req.requestId,
    });
  } else {
    log?.warn(logPayload, 'Request failed');
  }

  // Never leak internal detail (stack traces, driver-specific messages)
  // to the client in production — only the safe, documented message.
  let message = 'An unexpected error occurred.';
  if (isPayloadTooLarge) {
    message = PAYLOAD_TOO_LARGE_MESSAGE;
  } else if (isAppError || !config.isProduction) {
    message = err.message;
  }

  res.status(httpStatus).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code,
      message,
      details: isAppError ? err.details : undefined,
      request_id: req.requestId,
    },
  });
}
