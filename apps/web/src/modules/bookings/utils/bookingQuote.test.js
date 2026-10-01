import { describe, test, expect } from 'vitest';
import {
  PRICE_CHANGED_ERROR_CODE,
  toAcceptedQuoteFields,
  readCurrentQuote,
} from './bookingQuote.js';

const QUOTE = {
  unit_price_amount: '15000.00',
  total_amount: '30000.00',
  currency: 'AMD',
};

// Step L6.2H4.
describe('bookingQuote utils', () => {
  test('toAcceptedQuoteFields echoes the server strings unchanged', () => {
    expect(toAcceptedQuoteFields(QUOTE)).toEqual({
      expectedTotalAmount: '30000.00',
      expectedCurrency: 'AMD',
    });
  });

  test('readCurrentQuote returns the item quote from a PRICE_CHANGED error', () => {
    const error = {
      code: PRICE_CHANGED_ERROR_CODE,
      details: [{ field: 'items.0', issue: 'PRICE_CHANGED', ...QUOTE }],
    };
    expect(readCurrentQuote(error)).toEqual(QUOTE);
  });

  test.each([
    ['another error code', { code: 'HOLD_EXPIRED', details: [] }],
    ['no details', { code: PRICE_CHANGED_ERROR_CODE }],
    [
      'another item only',
      {
        code: PRICE_CHANGED_ERROR_CODE,
        details: [{ field: 'items.1', ...QUOTE }],
      },
    ],
    [
      'a malformed amount',
      {
        code: PRICE_CHANGED_ERROR_CODE,
        details: [{ field: 'items.0', total_amount: 30000, currency: 'AMD' }],
      },
    ],
    ['no error', null],
  ])('readCurrentQuote is null for %s', (_label, error) => {
    expect(readCurrentQuote(error)).toBeNull();
  });
});
