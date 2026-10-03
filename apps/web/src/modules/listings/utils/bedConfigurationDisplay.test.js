import { describe, test, expect, beforeEach } from 'vitest';
import i18n from 'i18next';
import {
  describeBedConfiguration,
  formatBedConfiguration,
} from './bedConfigurationDisplay.js';

// Step L6.3A — one natural wording for a room's sleeping setup.
describe('bedConfigurationDisplay', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('pluralizes per bed type and keeps the stored order', () => {
    expect(
      describeBedConfiguration(i18n.t, [
        { type: 'DOUBLE', count: 1 },
        { type: 'SINGLE', count: 2 },
        { type: 'CHILD_BED', count: 1 },
      ]),
    ).toEqual(['1 double bed', '2 single beds', '1 child bed available']);
  });

  test('never shows a zero count', () => {
    expect(
      formatBedConfiguration(i18n.t, [
        { type: 'SINGLE', count: 0 },
        { type: 'KING', count: 1 },
      ]),
    ).toBe('1 king bed');
  });

  test.each([[null], [undefined], [[]], [[{ type: 'CRIB', count: 0 }]]])(
    'no stated beds (%j) renders nothing',
    (bedConfiguration) => {
      expect(formatBedConfiguration(i18n.t, bedConfiguration)).toBeNull();
    },
  );

  test('Russian uses its few/many forms', async () => {
    await i18n.changeLanguage('ru');
    expect(
      describeBedConfiguration(i18n.t, [
        { type: 'SINGLE', count: 2 },
        { type: 'SINGLE', count: 5 },
        { type: 'CRIB', count: 1 },
      ]),
    ).toEqual([
      '2 односпальные кровати',
      '5 односпальных кроватей',
      'Доступна 1 детская кроватка',
    ]);
  });
});
