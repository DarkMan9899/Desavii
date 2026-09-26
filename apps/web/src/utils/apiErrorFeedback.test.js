import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import ApiError from '../api/ApiError.js';
import {
  API_ERROR_KINDS,
  normalizeFieldPath,
  getApiErrorKind,
  parseApiError,
  getIssueMessage,
  getApiErrorSummary,
} from './apiErrorFeedback.js';

const t = i18n.getFixedT('en');

function apiError(fields) {
  return new ApiError({ message: 'raw backend text', ...fields });
}

describe('normalizeFieldPath', () => {
  test.each([
    ['body.translations.0.title', 'translations.0.title'],
    ['query.status', 'status'],
    ['params.id', 'id'],
    ['attributeValues.star_rating', 'attributeValues.star_rating'],
    ['pricing.amount', 'pricing.amount'],
    ['body', ''],
    ['', ''],
    [undefined, ''],
    [42, ''],
  ])('%p -> %p', (input, expected) => {
    expect(normalizeFieldPath(input)).toBe(expected);
  });
});

describe('getApiErrorKind', () => {
  test.each([
    [{ code: 'VALIDATION_FAILED', status: 422 }, API_ERROR_KINDS.VALIDATION],
    [{ code: 'CONFLICT', status: 409 }, API_ERROR_KINDS.CONFLICT],
    [{ code: 'FORBIDDEN', status: 403 }, API_ERROR_KINDS.FORBIDDEN],
    [{ code: 'NOT_FOUND', status: 404 }, API_ERROR_KINDS.NOT_FOUND],
    [{ code: 'RATE_LIMITED', status: 429 }, API_ERROR_KINDS.RATE_LIMITED],
    [
      { code: 'PAYLOAD_TOO_LARGE', status: 413 },
      API_ERROR_KINDS.PAYLOAD_TOO_LARGE,
    ],
    [{ code: 'INTERNAL_ERROR', status: 500 }, API_ERROR_KINDS.SERVER],
    [{ code: 'BAD_GATEWAY', status: 502 }, API_ERROR_KINDS.SERVER],
    [{ code: 'NETWORK_ERROR' }, API_ERROR_KINDS.NETWORK],
    [{ code: 'UNKNOWN_ERROR', status: 418 }, API_ERROR_KINDS.UNKNOWN],
  ])('%p -> %s', (fields, kind) => {
    expect(getApiErrorKind(apiError(fields))).toBe(kind);
  });

  test('no error -> null', () => {
    expect(getApiErrorKind(null)).toBeNull();
  });
});

describe('parseApiError', () => {
  test('a single Zod field error keeps its bound context', () => {
    const parsed = parseApiError(
      apiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        details: [
          {
            field: 'body.translations.0.title',
            issue: 'too_big',
            maximum: 255,
            type: 'string',
          },
        ],
      }),
    );
    expect(parsed).toEqual({
      kind: API_ERROR_KINDS.VALIDATION,
      issues: [
        {
          path: 'translations.0.title',
          issue: 'too_big',
          maximum: 255,
          type: 'string',
        },
      ],
    });
  });

  test('multiple errors, a nested path and a service path are all kept, in order', () => {
    const parsed = parseApiError(
      apiError({
        status: 422,
        details: [
          { field: 'body.bookingRules.minimumStayNights', issue: 'too_small' },
          {
            field: 'attributeValues.star_rating',
            issue: 'UNKNOWN_OPTION_CODE',
          },
          { field: 'body.rows.2.quantity', issue: 'too_big', maximum: 10 },
        ],
      }),
    );
    expect(parsed.issues.map((issue) => issue.path)).toEqual([
      'bookingRules.minimumStayNights',
      'attributeValues.star_rating',
      'rows.2.quantity',
    ]);
  });

  test('an object-level (non-field) issue becomes a form-level issue with an empty path', () => {
    const parsed = parseApiError(
      apiError({ status: 422, details: [{ field: 'body', issue: 'custom' }] }),
    );
    expect(parsed.issues).toEqual([{ path: '', issue: 'custom' }]);
  });

  test('missing or malformed details never throw — they yield no issues', () => {
    expect(parseApiError(apiError({ status: 422 })).issues).toEqual([]);
    expect(
      parseApiError(apiError({ status: 422, details: 'nope' })).issues,
    ).toEqual([]);
    expect(
      parseApiError(
        apiError({
          status: 422,
          details: [null, 7, 'x', {}, { field: 'a' }, { issue: '' }],
        }),
      ).issues,
    ).toEqual([]);
  });

  test('unknown context keys and non-scalar context values are dropped', () => {
    const parsed = parseApiError(
      apiError({
        status: 422,
        details: [
          {
            field: 'body.title',
            issue: 'too_big',
            maximum: { evil: true },
            stack: 'at db.js:1',
          },
        ],
      }),
    );
    expect(parsed.issues).toEqual([{ path: 'title', issue: 'too_big' }]);
  });

  test('network and server errors parse with no issues', () => {
    expect(parseApiError(apiError({ code: 'NETWORK_ERROR' }))).toEqual({
      kind: API_ERROR_KINDS.NETWORK,
      issues: [],
    });
    expect(
      parseApiError(apiError({ status: 500, code: 'INTERNAL_ERROR' })).kind,
    ).toBe(API_ERROR_KINDS.SERVER);
  });

  test('no error -> null', () => {
    expect(parseApiError(undefined)).toBeNull();
  });
});

describe('getIssueMessage', () => {
  test.each([
    [
      { issue: 'too_big', type: 'string', maximum: 255 },
      'Use at most 255 characters.',
    ],
    [
      { issue: 'too_small', type: 'string', minimum: 1 },
      'This field is required.',
    ],
    [
      { issue: 'too_small', type: 'string', minimum: 3 },
      'Use at least 3 characters.',
    ],
    [{ issue: 'too_big', type: 'number', maximum: 100 }, 'The maximum is 100.'],
    [{ issue: 'too_small', type: 'number', minimum: 1 }, 'The minimum is 1.'],
    [{ issue: 'too_big', type: 'array', maximum: 1 }, 'Select at most 1.'],
    [
      { issue: 'invalid_type', received: 'undefined' },
      'This field is required.',
    ],
    [{ issue: 'invalid_type', received: 'string' }, "This value isn't valid."],
    [{ issue: 'invalid_enum_value' }, 'Choose one of the available options.'],
    [
      { issue: 'invalid_string', validation: 'url' },
      'Enter a web address that starts with http:// or https://.',
    ],
    [
      { issue: 'invalid_string', validation: 'email' },
      'Enter a valid email address.',
    ],
    [
      { issue: 'invalid_string', validation: 'regex' },
      "This value isn't in a valid format.",
    ],
    [{ issue: 'invalid_date' }, 'Enter a valid date.'],
    [{ issue: 'UNKNOWN_OPTION_CODE' }, 'Choose one of the available options.'],
    [
      { issue: 'UNKNOWN_ATTRIBUTE_CODE' },
      "This isn't available for this listing's category.",
    ],
    [
      { issue: 'DUPLICATE_OPTION_CODE' },
      'Each option can be selected only once.',
    ],
    [{ issue: 'ABOVE_MAXIMUM', maximum: 999 }, 'The maximum is 999.'],
    [{ issue: 'BELOW_MINIMUM', minimum: 15 }, 'The minimum is 15.'],
    [{ issue: 'MUST_BE_INTEGER' }, 'Enter a whole number.'],
    [
      { issue: 'BEFORE_DATE_FROM' },
      "The end date can't be before the start date.",
    ],
    [
      { issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' },
      'Add at least one photo before publishing.',
    ],
  ])('%p -> %p', (issue, expected) => {
    expect(getIssueMessage(t, issue)).toBe(expected);
  });

  test.each([
    [{ issue: 'too_big', type: 'string' }],
    [{ issue: 'ABOVE_MAXIMUM' }],
    [{ issue: 'custom' }],
    [{ issue: 'SOME_FUTURE_BACKEND_CODE' }],
  ])(
    '%p (no usable context / unknown code) -> generic message, never a raw code',
    (issue) => {
      const message = getIssueMessage(t, issue);
      expect(message).toBe("This value isn't valid.");
      expect(message).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    },
  );

  test('a message is translated in Armenian and Russian', () => {
    const issue = { issue: 'too_big', type: 'string', maximum: 255 };
    expect(getIssueMessage(i18n.getFixedT('hy'), issue)).toBe(
      'Օգտագործեք առավելագույնը 255 նիշ։',
    );
    expect(getIssueMessage(i18n.getFixedT('ru'), issue)).toBe(
      'Используйте не более 255 символов.',
    );
  });
});

describe('getApiErrorSummary', () => {
  test.each([
    [
      { status: 422, code: 'VALIDATION_FAILED' },
      'Some information needs to be fixed.',
    ],
    [
      { status: 403, code: 'FORBIDDEN' },
      "You don't have permission to do this.",
    ],
    [
      { status: 409, code: 'CONFLICT' },
      "This change conflicts with the listing's current state. Refresh the page and try again.",
    ],
    [
      { status: 404, code: 'NOT_FOUND' },
      'This item could not be found. It may have been removed.',
    ],
    [
      { code: 'NETWORK_ERROR' },
      "We couldn't reach the server. Check your connection and try again.",
    ],
  ])('%p -> translated summary', (fields, expected) => {
    expect(getApiErrorSummary(t, apiError(fields))).toBe(expected);
  });

  test('a known backend code gets its own translated guidance instead of the generic kind summary', () => {
    expect(
      getApiErrorSummary(
        t,
        apiError({ status: 409, code: 'LISTING_PUBLISHED_EDIT_BLOCKED' }),
      ),
    ).toBe(
      "A published listing can't be edited directly. Unpublish it first, then edit it and submit it for review again.",
    );
    expect(
      getApiErrorSummary(
        i18n.getFixedT('ru'),
        apiError({ status: 409, code: 'SECTION_HAS_ITEMS' }),
      ),
    ).toBe('Перед удалением раздела удалите все его блюда.');
  });

  test('an untranslated or malformed code falls back to the kind summary', () => {
    const conflict =
      "This change conflicts with the listing's current state. Refresh the page and try again.";
    expect(
      getApiErrorSummary(t, apiError({ status: 409, code: 'SOME_NEW_CODE' })),
    ).toBe(conflict);
    expect(
      getApiErrorSummary(t, apiError({ status: 409, code: 'summary.server' })),
    ).toBe(conflict);
    expect(getApiErrorSummary(t, apiError({ status: 409, code: 42 }))).toBe(
      conflict,
    );
  });

  test('a 5xx never surfaces the server message (e.g. a SQL error in non-production)', () => {
    const error = apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: "ER_DUP_ENTRY: Duplicate entry 'x' for key 'listings.slug'",
    });
    const summary = getApiErrorSummary(t, error);
    expect(summary).toBe('Something went wrong on our side. Please try again.');
    expect(summary).not.toContain('ER_DUP_ENTRY');
  });
});
