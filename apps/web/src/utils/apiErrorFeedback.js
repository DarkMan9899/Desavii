/**
 * The one place a rejected API call (`ApiError`, `api/ApiError.js`) is
 * turned into Partner-facing feedback. Forms never render `error.message`
 * (the backend's English, developer-facing text, and for a 5xx possibly
 * internal detail) — they render the translated summary/field messages
 * produced here instead.
 *
 * `error.details` entries come from two backend sources with one shape:
 * - `validate.js` (Zod): `{ field: 'body.translations.0.title', issue:
 *   'too_big', maximum: 255, type: 'string' }` — request-part prefix;
 * - service validation: `{ field: 'attributeValues.star_rating', issue:
 *   'UNKNOWN_OPTION_CODE' }` — no prefix.
 * `normalizeFieldPath` maps both to one form path (`translations.0.title`,
 * `attributeValues.star_rating`); callers match paths exactly, never by
 * substring, so an issue can't land on the wrong field.
 */

export const API_ERROR_KINDS = Object.freeze({
  VALIDATION: 'validation',
  CONFLICT: 'conflict',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'notFound',
  UNAUTHENTICATED: 'unauthenticated',
  RATE_LIMITED: 'rateLimited',
  PAYLOAD_TOO_LARGE: 'payloadTooLarge',
  NETWORK: 'network',
  SERVER: 'server',
  UNKNOWN: 'unknown',
});

const KIND_BY_STATUS = {
  401: API_ERROR_KINDS.UNAUTHENTICATED,
  403: API_ERROR_KINDS.FORBIDDEN,
  404: API_ERROR_KINDS.NOT_FOUND,
  409: API_ERROR_KINDS.CONFLICT,
  413: API_ERROR_KINDS.PAYLOAD_TOO_LARGE,
  422: API_ERROR_KINDS.VALIDATION,
  429: API_ERROR_KINDS.RATE_LIMITED,
};

const REQUEST_PARTS = new Set(['body', 'query', 'params']);
const CONTEXT_KEYS = ['minimum', 'maximum', 'type', 'received', 'validation'];

/** `body.translations.0.title` -> `translations.0.title`; '' when absent. */
export function normalizeFieldPath(field) {
  if (typeof field !== 'string') return '';
  const segments = field.split('.').filter((segment) => segment !== '');
  if (REQUEST_PARTS.has(segments[0])) segments.shift();
  return segments.join('.');
}

export function getApiErrorKind(error) {
  if (!error) return null;
  if (error.code === 'NETWORK_ERROR') return API_ERROR_KINDS.NETWORK;
  if (error.code === 'VALIDATION_FAILED') return API_ERROR_KINDS.VALIDATION;
  const kind = KIND_BY_STATUS[error.status];
  if (kind) return kind;
  if (typeof error.status === 'number' && error.status >= 500) {
    return API_ERROR_KINDS.SERVER;
  }
  return API_ERROR_KINDS.UNKNOWN;
}

function toIssue(detail) {
  const issue = { path: normalizeFieldPath(detail.field), issue: detail.issue };
  CONTEXT_KEYS.forEach((key) => {
    const value = detail[key];
    if (typeof value === 'number' || typeof value === 'string') {
      issue[key] = value;
    }
  });
  return issue;
}

/**
 * @returns {null | { kind: string, issues: Array<{ path: string, issue: string }> }}
 * `issues` only ever holds well-formed entries; anything malformed in
 * `details` is dropped rather than rendered, and a missing/non-array
 * `details` simply yields no issues (the summary still explains the kind).
 */
export function parseApiError(error) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : [];
  const issues = details
    .filter(
      (detail) =>
        detail !== null &&
        typeof detail === 'object' &&
        typeof detail.issue === 'string' &&
        detail.issue !== '',
    )
    .map(toIssue);
  return { kind: getApiErrorKind(error), issues };
}

// Service-level issue codes -> message key. Anything not listed (and not
// a known Zod code below) falls back to the generic "invalid" message —
// a raw code is never shown.
const DOMAIN_ISSUE_KEYS = {
  UNKNOWN_OPTION_CODE: 'invalidOption',
  UNKNOWN_ATTRIBUTE_CODE: 'notAvailableForCategory',
  UNKNOWN_POLICY_CODE: 'notAvailableForCategory',
  UNKNOWN_PRICING_MODEL: 'notAvailableForCategory',
  DUPLICATE_OPTION_CODE: 'duplicateOption',
  BELOW_MINIMUM: 'tooSmall',
  ABOVE_MAXIMUM: 'tooLarge',
  INVALID_NUMBER: 'invalidNumber',
  MUST_BE_INTEGER: 'mustBeInteger',
  UNKNOWN_CURRENCY: 'unknownCurrency',
  BEFORE_DATE_FROM: 'dateOrder',
  AT_LEAST_ONE_TRANSLATION_REQUIRED: 'AT_LEAST_ONE_TRANSLATION_REQUIRED',
  AT_LEAST_ONE_IMAGE_REQUIRED: 'AT_LEAST_ONE_IMAGE_REQUIRED',
  COMPLETE_LOCATION_REQUIRED: 'COMPLETE_LOCATION_REQUIRED',
  REQUIRED_ATTRIBUTE_MISSING: 'REQUIRED_ATTRIBUTE_MISSING',
  REQUIRED_POLICY_MISSING: 'REQUIRED_POLICY_MISSING',
  AT_LEAST_ONE_BOOKABLE_UNIT_REQUIRED: 'AT_LEAST_ONE_BOOKABLE_UNIT_REQUIRED',
  PUBLICATION_PERIOD_REQUIRED: 'PUBLICATION_PERIOD_REQUIRED',
  INVALID_PUBLICATION_PERIOD: 'INVALID_PUBLICATION_PERIOD',
};

const BOUND_KEYS = {
  too_big: { string: 'tooLong', array: 'tooManyItems', other: 'tooLarge' },
  too_small: { string: 'tooShort', array: 'tooFewItems', other: 'tooSmall' },
};

function messageKeyFor(issue) {
  const { issue: code, type, minimum, maximum } = issue;
  if (code === 'too_small' && type === 'string' && minimum === 1) {
    return 'required';
  }
  if (BOUND_KEYS[code]) {
    const bound = code === 'too_big' ? maximum : minimum;
    if (bound === undefined) return 'invalid';
    const byType = BOUND_KEYS[code];
    return byType[type] ?? byType.other;
  }
  if (code === 'invalid_type') {
    return issue.received === 'undefined' ? 'required' : 'invalid';
  }
  if (code === 'invalid_enum_value') return 'invalidOption';
  if (code === 'invalid_date') return 'invalidDate';
  if (code === 'invalid_string') {
    if (issue.validation === 'url') return 'invalidUrl';
    if (issue.validation === 'email') return 'invalidEmail';
    return 'invalidFormat';
  }
  if (DOMAIN_ISSUE_KEYS[code] === 'tooSmall' && minimum === undefined) {
    return 'invalid';
  }
  if (DOMAIN_ISSUE_KEYS[code] === 'tooLarge' && maximum === undefined) {
    return 'invalid';
  }
  return DOMAIN_ISSUE_KEYS[code] ?? 'invalid';
}

/** A translated, Partner-facing message for one parsed issue. */
export function getIssueMessage(t, issue) {
  return t(`apiErrors.issues.${messageKeyFor(issue)}`, {
    minimum: issue.minimum,
    maximum: issue.maximum,
  });
}

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * The translated headline for an error (never `error.message`): the
 * specific message for its backend `code` when one is translated (e.g.
 * `SECTION_HAS_ITEMS` — tells the Partner what to do), otherwise the
 * generic message for its kind.
 */
export function getApiErrorSummary(t, error) {
  const kind = getApiErrorKind(error) ?? API_ERROR_KINDS.UNKNOWN;
  const kindSummary = t(`apiErrors.summary.${kind}`);
  const code = error?.code;
  if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code)) {
    return kindSummary;
  }
  return t(`apiErrors.codes.${code}`, { defaultValue: kindSummary });
}
