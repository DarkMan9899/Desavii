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
      { issue: 'UNKNOWN_AMENITY' },
      "This isn't available for this listing's category.",
    ],
    [
      { issue: 'UNIT_TYPE_NOT_ALLOWED' },
      "This isn't available for this listing's category.",
    ],
    [
      { issue: 'ONE_VEHICLE_PER_LISTING' },
      'This listing already has its vehicle. A car rental listing describes one vehicle model — edit the existing vehicle instead.',
    ],
    [
      { issue: 'NOT_APPLICABLE_FOR_UNIT_TYPE' },
      "This doesn't apply to this kind of unit.",
    ],
    [
      { issue: 'ROOM_DETAILS_NOT_APPLICABLE' },
      "This doesn't apply to this kind of unit.",
    ],
    // Step L6.2H1 — a legacy pricing model (PER_HOUR) on publish and booking.
    [
      { issue: 'UNSUPPORTED_PRICING_MODEL' },
      'This pricing model is no longer supported. Choose a new one in the Pricing step, then publish again.',
    ],
    [
      { issue: 'UNSUPPORTED_PRICING_MODEL_FOR_BOOKING' },
      "This listing can't be booked online right now — its host is updating how it's priced.",
    ],
    // Step L6.2E — base customer-hold contract and rule-state issues.
    [
      { issue: 'ZERO_NIGHT_STAY' },
      'Choose a check-out date after your check-in date.',
    ],
    [
      { issue: 'BOOKING_IN_PAST' },
      'This date or time has already passed. Please choose a later one.',
    ],
    [
      { issue: 'INCOMPLETE_RENTAL_INTERVAL' },
      'Choose both a pickup time and a return time.',
    ],
    [
      { issue: 'RETURN_NOT_AFTER_PICKUP' },
      'The return time must be after the pickup time.',
    ],
    [{ issue: 'RESERVATION_TIME_REQUIRED' }, 'Choose a reservation time.'],
    [
      { issue: 'MIN_STAY_EXCEEDS_MAX' },
      "The minimum can't be greater than the maximum.",
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

  // Step L6.2F — Partner booking-rule rejections: nights vs rental days,
  // plural forms, and a 0-day horizon worded as "today only".
  describe('booking-rule issues', () => {
    test.each([
      [
        { issue: 'MINIMUM_STAY_NOT_MET', minimum: 2, unit: 'nights' },
        'The minimum stay is 2 nights.',
      ],
      [
        { issue: 'MINIMUM_STAY_NOT_MET', minimum: 1, unit: 'nights' },
        'The minimum stay is 1 night.',
      ],
      [
        { issue: 'MAXIMUM_STAY_EXCEEDED', maximum: 14, unit: 'nights' },
        'The maximum stay is 14 nights.',
      ],
      [
        { issue: 'MINIMUM_STAY_NOT_MET', minimum: 3, unit: 'days' },
        'The minimum rental is 3 days.',
      ],
      [
        { issue: 'MAXIMUM_STAY_EXCEEDED', maximum: 7, unit: 'days' },
        'The maximum rental is 7 days.',
      ],
      [
        { issue: 'BOOKING_TOO_SOON', minimumHours: 24 },
        'This booking must be made at least 24 hours in advance.',
      ],
      [
        { issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays: 30 },
        'Bookings are accepted up to 30 days ahead.',
      ],
      [
        { issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays: 0 },
        'This listing only accepts bookings for today.',
      ],
    ])('%p -> %p', (issue, expected) => {
      expect(getIssueMessage(t, issue)).toBe(expected);
    });

    test('Armenian and Russian wording (Russian plural forms)', () => {
      const hy = i18n.getFixedT('hy');
      const ru = i18n.getFixedT('ru');
      expect(
        getIssueMessage(hy, {
          issue: 'MINIMUM_STAY_NOT_MET',
          minimum: 2,
          unit: 'nights',
        }),
      ).toBe('Նվազագույն մնալու տևողությունը 2 գիշեր է։');
      expect(
        getIssueMessage(hy, {
          issue: 'MAXIMUM_STAY_EXCEEDED',
          maximum: 7,
          unit: 'days',
        }),
      ).toBe('Առավելագույն վարձակալումը 7 օր է։');
      expect(
        getIssueMessage(ru, {
          issue: 'MINIMUM_STAY_NOT_MET',
          minimum: 2,
          unit: 'nights',
        }),
      ).toBe('Минимальный срок проживания — 2 ночи.');
      expect(
        getIssueMessage(ru, {
          issue: 'MAXIMUM_STAY_EXCEEDED',
          maximum: 5,
          unit: 'days',
        }),
      ).toBe('Максимальный срок аренды — 5 дней.');
      expect(
        getIssueMessage(ru, { issue: 'BOOKING_TOO_SOON', minimumHours: 1 }),
      ).toBe('Бронирование нужно сделать не менее чем за 1 час.');
      expect(
        getIssueMessage(ru, { issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays: 0 }),
      ).toBe('Это объявление принимает бронирования только на сегодня.');
    });

    test('parseApiError keeps the booking-rule metadata', () => {
      const parsed = parseApiError(
        new ApiError({
          code: 'VALIDATION_FAILED',
          status: 422,
          message: 'rules',
          details: [
            {
              field: 'items',
              issue: 'MAXIMUM_STAY_EXCEEDED',
              maximum: 3,
              unit: 'days',
            },
            { field: 'items', issue: 'BOOKING_TOO_SOON', minimumHours: 6 },
            { field: 'items', issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays: 0 },
          ],
        }),
      );
      expect(parsed.issues).toEqual([
        {
          path: 'items',
          issue: 'MAXIMUM_STAY_EXCEEDED',
          maximum: 3,
          unit: 'days',
        },
        { path: 'items', issue: 'BOOKING_TOO_SOON', minimumHours: 6 },
        { path: 'items', issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays: 0 },
      ]);
    });
  });

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
