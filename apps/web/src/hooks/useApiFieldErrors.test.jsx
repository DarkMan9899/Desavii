import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import ApiError from '../api/ApiError.js';
import useApiFieldErrors from './useApiFieldErrors.js';

function validationError(details) {
  return new ApiError({ code: 'VALIDATION_FAILED', status: 422, details });
}

const FIRST = validationError([
  {
    field: 'body.capacity',
    issue: 'too_big',
    maximum: 4294967295,
    type: 'number',
  },
  { field: 'body.unitLabel', issue: 'too_big', maximum: 120, type: 'string' },
]);

describe('useApiFieldErrors', () => {
  test('returns the translated message for an exact path only', () => {
    const { result } = renderHook(() => useApiFieldErrors(FIRST));
    expect(result.current.fieldError('capacity')).toBe(
      'Առավելագույնը 4294967295 է։',
    );
    expect(result.current.fieldError('unitLabel')).toBe(
      'Օգտագործեք առավելագույնը 120 նիշ։',
    );
    expect(result.current.fieldError('capacit')).toBeUndefined();
    expect(result.current.fieldError('maxGuests')).toBeUndefined();
  });

  test('no error -> no field errors', () => {
    const { result } = renderHook(() => useApiFieldErrors(null));
    expect(result.current.fieldError('capacity')).toBeUndefined();
  });

  test('clearing one field hides only that field', () => {
    const { result } = renderHook(() => useApiFieldErrors(FIRST));
    act(() => result.current.clearFieldError('capacity'));
    expect(result.current.fieldError('capacity')).toBeUndefined();
    expect(result.current.fieldError('unitLabel')).toBeDefined();
  });

  test('a new error object (a re-submit) brings cleared fields back', () => {
    const { result, rerender } = renderHook(
      ({ error }) => useApiFieldErrors(error),
      { initialProps: { error: FIRST } },
    );
    act(() => result.current.clearFieldError('capacity'));
    expect(result.current.fieldError('capacity')).toBeUndefined();

    const SECOND = validationError([
      {
        field: 'body.capacity',
        issue: 'too_big',
        maximum: 4294967295,
        type: 'number',
      },
    ]);
    rerender({ error: SECOND });
    expect(result.current.fieldError('capacity')).toBeDefined();
  });
});
