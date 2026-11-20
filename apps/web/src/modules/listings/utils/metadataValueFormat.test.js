import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import {
  formatValueList,
  formatMetadataValue,
  hasMetadataValue,
} from './metadataValueFormat.js';

describe('formatValueList — the page language owns the list grammar', () => {
  test.each([
    ['en', 'A, B and C'],
    ['hy', 'A, B և C'],
    ['ru', 'A, B и C'],
  ])('%s', (locale, expected) => {
    expect(formatValueList(['A', 'B', 'C'], i18n.getFixedT(locale))).toBe(
      expected,
    );
  });

  test('one value reads alone; none reads as nothing', () => {
    const t = i18n.getFixedT('en');
    expect(formatValueList(['09:00'], t)).toBe('09:00');
    expect(formatValueList([], t)).toBe('');
  });
});

describe('formatMetadataValue', () => {
  const t = i18n.getFixedT('en');

  test('a duration reads as the cards read it', () => {
    expect(
      formatMetadataValue(
        { code: 'duration_minutes', data_type: 'INTEGER', unit: 'minutes' },
        240,
        t,
        'en',
      ),
    ).toBe('4h');
  });

  test('measured numbers use the page locale; an identifier such as a year is written as stored', () => {
    const bathrooms = {
      code: 'bathrooms',
      data_type: 'DECIMAL',
      unit: 'rooms',
    };
    const area = { code: 'floor_area_sqm', data_type: 'INTEGER', unit: 'sqm' };
    const year = { code: 'vehicle_year', data_type: 'INTEGER' };
    expect(formatMetadataValue(bathrooms, 1.5, t, 'en')).toMatch(/^1\.5 /);
    expect(
      formatMetadataValue(bathrooms, 1.5, i18n.getFixedT('ru'), 'ru'),
    ).toMatch(/^1,5 /);
    expect(formatMetadataValue(area, 2000, t, 'en')).toMatch(/^2,000 /);
    expect(formatMetadataValue(year, 2022, t, 'en')).toBe('2022');
  });

  test('choices read as their labels, never as stored codes', () => {
    expect(
      formatMetadataValue(
        { code: 'transport_modes', data_type: 'MULTI_ENUM' },
        ['MINIBUS', 'CABLE_CAR'],
        t,
        'en',
      ),
    ).toBe('Minibus and Cable car');
  });
});

describe('hasMetadataValue', () => {
  test.each([
    [undefined, false],
    [null, false],
    ['', false],
    [[], false],
    [0, true],
    [false, true],
    ['x', true],
    [['A'], true],
  ])('%p → %p', (value, expected) => {
    expect(hasMetadataValue(value)).toBe(expected);
  });
});
