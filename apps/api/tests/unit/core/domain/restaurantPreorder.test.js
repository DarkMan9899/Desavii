import { describe, test, expect } from '@jest/globals';
import {
  pricePreorder,
  isAcceptedMenuSubtotalCurrent,
  MAX_PREORDER_LINES,
  MAX_PREORDER_QUANTITY,
} from '../../../../src/core/domain/restaurantPreorder.js';

const dish = (id, priceAmount, currencyCode = 'AMD') => [
  id,
  {
    id,
    title: `Dish ${id}`,
    sectionTitle: 'Grill',
    languageCode: 'en',
    priceAmount,
    currencyCode,
  },
];

const MENU = new Map([dish(1, '12000.00'), dish(2, '1500.00')]);

describe('pricePreorder', () => {
  test('prices every line from the menu and sums the subtotal', () => {
    const priced = pricePreorder(
      [
        { menuItemId: 1, quantity: 2 },
        { menuItemId: 2, quantity: 3 },
      ],
      MENU,
    );
    expect(priced.unavailableIds).toEqual([]);
    expect(
      priced.lines.map((line) => line.lineTotal.toDecimalString()),
    ).toEqual(['24000.00', '4500.00']);
    expect(priced.subtotal.toDecimalString()).toBe('28500.00');
    expect(priced.subtotal.currency).toBe('AMD');
    expect(priced.lines.map((line) => line.sortOrder)).toEqual([0, 1]);
  });

  test('names every requested dish the menu does not offer', () => {
    const priced = pricePreorder(
      [
        { menuItemId: 1, quantity: 1 },
        { menuItemId: 9, quantity: 1 },
        { menuItemId: 10, quantity: 1 },
      ],
      MENU,
    );
    expect(priced.unavailableIds).toEqual([9, 10]);
    expect(priced.subtotal).toBeNull();
  });

  test('refuses dishes priced in different currencies together', () => {
    const priced = pricePreorder(
      [
        { menuItemId: 1, quantity: 1 },
        { menuItemId: 3, quantity: 1 },
      ],
      new Map([...MENU, dish(3, '10.00', 'USD')]),
    );
    expect(priced.mixedCurrency).toBe(true);
    expect(priced.subtotal).toBeNull();
  });
});

describe('isAcceptedMenuSubtotalCurrent', () => {
  const { subtotal } = pricePreorder([{ menuItemId: 2, quantity: 2 }], MENU);

  test('the exact amount and currency the customer saw', () => {
    expect(
      isAcceptedMenuSubtotalCurrent(
        { amount: '3000.00', currency: 'AMD' },
        subtotal,
      ),
    ).toBe(true);
  });

  test.each([
    [{ amount: '2999.99', currency: 'AMD' }],
    [{ amount: '3000.00', currency: 'USD' }],
    [{ amount: undefined, currency: undefined }],
    [undefined],
  ])('anything else is stale: %p', (expected) => {
    expect(isAcceptedMenuSubtotalCurrent(expected, subtotal)).toBe(false);
  });
});

test('limits are positive whole numbers', () => {
  expect(Number.isInteger(MAX_PREORDER_LINES)).toBe(true);
  expect(Number.isInteger(MAX_PREORDER_QUANTITY)).toBe(true);
  expect(MAX_PREORDER_QUANTITY).toBeGreaterThan(0);
});
