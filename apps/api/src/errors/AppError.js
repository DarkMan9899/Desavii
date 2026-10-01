/**
 * The base of the platform's Exception Hierarchy.
 *
 * Implements BACKEND_ARCHITECTURE.md §24: every thrown exception on the
 * platform is a named, specific instance of one of the classes in this
 * file (or a module-specific subclass of one of them) — never a raw
 * string or a generic `Error`. Every subclass fixes its own
 * API_SPECIFICATION.md Appendix A `code` and HTTP status, so the global
 * error-handling middleware (src/middleware/errorHandler.js,
 * BACKEND_ARCHITECTURE.md §23) can be a simple, total mapping rather
 * than a sprawling set of special cases.
 */

export class AppError extends Error {
  /**
   * @param {string} message - safe to display to the end user (already
   *   in the response locale, per API_SPECIFICATION.md §9).
   * @param {object} [options]
   * @param {string} [options.code] - API_SPECIFICATION.md Appendix A code.
   * @param {number} [options.httpStatus]
   * @param {Array<{field: string, issue: string}>} [options.details]
   */
  constructor(
    message,
    { code = 'INTERNAL_ERROR', httpStatus = 500, details = undefined } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'The request could not be validated.',
    details = undefined,
  ) {
    super(message, { code: 'VALIDATION_FAILED', httpStatus: 422, details });
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message = 'Authentication is required.',
    code = 'UNAUTHENTICATED',
  ) {
    super(message, { code, httpStatus: 401 });
  }
}

export class AuthorizationError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action.',
    code = 'FORBIDDEN',
  ) {
    super(message, { code, httpStatus: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = 'The requested resource was not found.',
    code = 'NOT_FOUND',
  ) {
    super(message, { code, httpStatus: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'The request conflicts with the current state of the resource.',
    code = 'CONFLICT',
  ) {
    super(message, { code, httpStatus: 409 });
  }
}

/**
 * Step L6.2H4 — a booking's accepted quote no longer matches the current
 * server price (409). `details` carries the complete current quote, one
 * entry per request item, so the client can show it and ask the customer to
 * accept it before retrying. No booking was created; the holds stay active.
 */
export class PriceChangedError extends AppError {
  constructor(details, message = 'The price changed while you were booking.') {
    super(message, { code: 'PRICE_CHANGED', httpStatus: 409, details });
  }
}

export class LockedError extends AppError {
  constructor(
    message = 'This account is temporarily locked. Please try again later.',
    code = 'ACCOUNT_LOCKED',
  ) {
    super(message, { code, httpStatus: 423 });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again shortly.') {
    super(message, { code: 'RATE_LIMITED', httpStatus: 429 });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message = 'This service is temporarily unavailable.',
    code = 'SERVICE_UNAVAILABLE',
  ) {
    super(message, { code, httpStatus: 503 });
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message = 'An upstream service failed. Please try again.',
    code = 'EXTERNAL_SERVICE_ERROR',
  ) {
    super(message, { code, httpStatus: 502 });
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.') {
    super(message, { code: 'INTERNAL_ERROR', httpStatus: 500 });
  }
}

export default AppError;
