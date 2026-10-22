import { describe, test, expect } from '@jest/globals';
import {
  isAttributeApplicable,
  hasAttributeValue,
  mergeAttributeValues,
} from '../../../../src/core/domain/attributeConditions.js';

const DISTANCE_LIMIT = {
  code: 'daily_distance_limit_km',
  dependsOn: { attributeCode: 'mileage_policy', optionCode: 'LIMITED' },
};

describe('attributeConditions', () => {
  test('an unconditional attribute always applies', () => {
    expect(isAttributeApplicable({ code: 'seats' }, new Map())).toBe(true);
    expect(
      isAttributeApplicable({ code: 'seats', dependsOn: null }, new Map()),
    ).toBe(true);
  });

  test('a conditional attribute applies only while its option is chosen', () => {
    const limited = new Map([
      ['mileage_policy', { code: 'mileage_policy', optionCodes: ['LIMITED'] }],
    ]);
    const unlimited = new Map([
      [
        'mileage_policy',
        { code: 'mileage_policy', optionCodes: ['UNLIMITED'] },
      ],
    ]);
    expect(isAttributeApplicable(DISTANCE_LIMIT, limited)).toBe(true);
    expect(isAttributeApplicable(DISTANCE_LIMIT, unlimited)).toBe(false);
    expect(isAttributeApplicable(DISTANCE_LIMIT, new Map())).toBe(false);
  });

  test('a cleared choice or blank value states nothing', () => {
    expect(hasAttributeValue({ code: 'x', optionCodes: [] })).toBe(false);
    expect(hasAttributeValue({ code: 'x', optionCodes: ['A'] })).toBe(true);
    expect(hasAttributeValue({ code: 'x', value: '' })).toBe(false);
    expect(hasAttributeValue({ code: 'x', value: null })).toBe(false);
    expect(hasAttributeValue({ code: 'x', value: 0 })).toBe(true);
    expect(hasAttributeValue(undefined)).toBe(false);
  });

  test('submitted values replace stored ones, untouched codes stay', () => {
    const merged = mergeAttributeValues(
      [
        { code: 'mileage_policy', optionCodes: ['LIMITED'] },
        { code: 'daily_distance_limit_km', value: 200 },
      ],
      [{ code: 'mileage_policy', optionCodes: ['UNLIMITED'] }],
    );
    expect(merged.get('mileage_policy').optionCodes).toEqual(['UNLIMITED']);
    expect(merged.get('daily_distance_limit_km').value).toBe(200);
    expect(isAttributeApplicable(DISTANCE_LIMIT, merged)).toBe(false);
  });
});
