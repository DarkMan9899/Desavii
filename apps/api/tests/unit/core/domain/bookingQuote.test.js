import { describe, test, expect } from '@jest/globals';
import { Money } from '../../../../src/core/domain/money.js';
import {
  EXPECTED_AMOUNT_PATTERN,
  quoteItemTotal,
  isAcceptedQuoteCurrent,
} from '../../../../src/core/domain/bookingQuote.js';

// Step L6.2H4 — an accepted quote is compared exactly, never charged.
describe('EXPECTED_AMOUNT_PATTERN', () => {
  test.each(['0.00', '8000.00', '9999999999.99', '0.05'])(
    'accepts the canonical decimal %p',
    (amount) => expect(EXPECTED_AMOUNT_PATTERN.test(amount)).toBe(true),
  );

  test.each([
    '8000',
    '8000.0',
    '8000.000',
    '8e3',
    '-8000.00',
    '+8000.00',
    '08000.00',
    'NaN',
    'Infinity',
    '',
    ' 8000.00',
    '10000000000.00',
  ])('rejects %p', (amount) => {
    expect(EXPECTED_AMOUNT_PATTERN.test(amount)).toBe(false);
  });
});

describe('quoteItemTotal', () => {
  test('is the per-unit price × held quantity, in minor units', () => {
    const total = quoteItemTotal(Money.fromDecimalString('333.33', 'AMD'), 3);
    expect(total.toDecimalString()).toBe('999.99');
  });
});

describe('isAcceptedQuoteCurrent', () => {
  const current = Money.fromDecimalString('16000.00', 'AMD');

  test('an identical amount and currency is current', () => {
    expect(
      isAcceptedQuoteCurrent(
        { expectedTotalAmount: '16000.00', expectedCurrency: 'AMD' },
        current,
      ),
    ).toBe(true);
  });

  test.each([
    ['a lower amount', '15999.99', 'AMD'],
    ['a higher amount', '16000.01', 'AMD'],
    ['the same digits in another currency', '16000.00', 'USD'],
  ])('%s is not current', (_label, amount, currency) => {
    expect(
      isAcceptedQuoteCurrent(
        { expectedTotalAmount: amount, expectedCurrency: currency },
        current,
      ),
    ).toBe(false);
  });
});
