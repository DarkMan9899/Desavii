import { describe, test, expect } from 'vitest';
import {
  MAX_PREORDER_LINES,
  MAX_PREORDER_QUANTITY,
  buildPreorderLines,
  clampPreorderQuantity,
  resolveOrderableSections,
  sumDecimalAmounts,
  toMenuSelectionsPayload,
} from './menuPreorder.js';

const dish = (id, price, extra = {}) => ({
  id,
  title: `Dish ${id}`,
  price_amount: price,
  price_currency_code: 'AMD',
  is_active: true,
  ...extra,
});

const MENUS = [
  {
    id: 1,
    is_active: true,
    sections: [
      { id: 10, title: 'Grill', items: [dish(1, '5500.00'), dish(2, '0.10')] },
      {
        id: 11,
        title: 'Seasonal',
        items: [dish(3, '7500.00', { is_active: false })],
      },
    ],
  },
  {
    id: 2,
    is_active: false,
    sections: [{ id: 20, title: 'Old', items: [dish(4, '100.00')] }],
  },
];

describe('resolveOrderableSections', () => {
  test('only active menus and active dishes; empty sections are dropped', () => {
    const sections = resolveOrderableSections(MENUS);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Grill');
    expect(sections[0].items.map((item) => item.id)).toEqual([1, 2]);
  });

  test('no menu at all is no sections', () => {
    expect(resolveOrderableSections(undefined)).toEqual([]);
    expect(resolveOrderableSections([])).toEqual([]);
  });
});

describe('buildPreorderLines', () => {
  const sections = resolveOrderableSections(MENUS);

  test('prices lines in exact decimals, in menu order', () => {
    const preorder = buildPreorderLines(sections, { 2: 3, 1: 2 });
    expect(preorder.lines.map((line) => line.menuItemId)).toEqual([1, 2]);
    expect(preorder.lines.map((line) => line.lineTotalAmount)).toEqual([
      '11000.00',
      '0.30',
    ]);
    expect(preorder.subtotalAmount).toBe('11000.30');
    expect(preorder.currency).toBe('AMD');
    expect(preorder.lines[0]).not.toHaveProperty('minor');
  });

  test('nothing chosen is no subtotal', () => {
    expect(buildPreorderLines(sections, { 1: 0 })).toEqual({
      lines: [],
      subtotalAmount: null,
      currency: null,
    });
  });

  test('a dish no longer on the menu drops out', () => {
    expect(buildPreorderLines(sections, { 3: 2 }).lines).toEqual([]);
  });

  test('dishes in two currencies have no single subtotal', () => {
    const mixed = [
      {
        id: 1,
        title: 'Mixed',
        items: [
          dish(1, '10.00'),
          dish(2, '10.00', { price_currency_code: 'USD' }),
        ],
      },
    ];
    const preorder = buildPreorderLines(mixed, { 1: 1, 2: 1 });
    expect(preorder.lines).toHaveLength(2);
    expect(preorder.subtotalAmount).toBeNull();
  });
});

describe('clampPreorderQuantity', () => {
  test('keeps a quantity within 0..MAX, whole', () => {
    expect(clampPreorderQuantity({}, 1, -3)).toBe(0);
    expect(clampPreorderQuantity({}, 1, 2.7)).toBe(2);
    expect(clampPreorderQuantity({}, 1, MAX_PREORDER_QUANTITY + 5)).toBe(
      MAX_PREORDER_QUANTITY,
    );
    expect(clampPreorderQuantity({}, 1, 'abc')).toBe(0);
  });

  test('refuses a new dish beyond the line limit, but lets existing ones change', () => {
    const full = Object.fromEntries(
      Array.from({ length: MAX_PREORDER_LINES }, (_, index) => [index + 1, 1]),
    );
    expect(clampPreorderQuantity(full, 999, 1)).toBe(0);
    expect(clampPreorderQuantity(full, 1, 4)).toBe(4);
  });
});

describe('sumDecimalAmounts', () => {
  test('sums two-decimal strings exactly', () => {
    expect(sumDecimalAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumDecimalAmounts(['12000.00', '4500.50'])).toBe('16500.50');
    expect(sumDecimalAmounts([])).toBe('0.00');
  });
});

describe('toMenuSelectionsPayload', () => {
  test('sends only ids, quantities and the subtotal the guest saw', () => {
    const preorder = buildPreorderLines(resolveOrderableSections(MENUS), {
      1: 2,
    });
    expect(toMenuSelectionsPayload(preorder)).toEqual({
      menuSelections: [{ menuItemId: 1, quantity: 2 }],
      expectedMenuSubtotalAmount: '11000.00',
      expectedMenuCurrency: 'AMD',
    });
  });

  test('no pre-order adds nothing to the request', () => {
    expect(toMenuSelectionsPayload(null)).toEqual({});
    expect(
      toMenuSelectionsPayload({ lines: [], subtotalAmount: null }),
    ).toEqual({});
  });
});
