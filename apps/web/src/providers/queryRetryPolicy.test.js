import { describe, test, expect } from 'vitest';
import { shouldRetryQuery } from './queryRetryPolicy.js';

describe('shouldRetryQuery (apps/web/src/providers)', () => {
  test.each([400, 401, 403, 404, 409, 422, 499])(
    'never retries a %i client error, even on the very first failure',
    (status) => {
      expect(shouldRetryQuery(0, { status })).toBe(false);
    },
  );

  test.each([500, 502, 503])(
    'retries a %i server error up to the failure-count budget',
    (status) => {
      expect(shouldRetryQuery(0, { status })).toBe(true);
      expect(shouldRetryQuery(1, { status })).toBe(true);
      expect(shouldRetryQuery(2, { status })).toBe(false);
    },
  );

  test('retries a network failure (no status at all) up to the same budget', () => {
    expect(shouldRetryQuery(0, { status: undefined })).toBe(true);
    expect(shouldRetryQuery(1, { status: undefined })).toBe(true);
    expect(shouldRetryQuery(2, { status: undefined })).toBe(false);
  });

  test('treats a missing/malformed error object the same as a network failure, not a permanent one', () => {
    expect(shouldRetryQuery(0, {})).toBe(true);
    expect(shouldRetryQuery(0, undefined)).toBe(true);
  });
});
