import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { formatRatingAverage, ratingLabel } from './formatRating.js';

describe('formatRatingAverage — one decimal in the page language', () => {
  test.each([
    ['en', 4.66, '4.7'],
    ['hy', 4.66, '4,7'],
    ['ru', 4.66, '4,7'],
    ['hy', 5, '5,0'],
  ])('%s %p → %s', (locale, value, expected) => {
    expect(formatRatingAverage(value, locale)).toBe(expected);
  });
});

describe('ratingLabel — the star rating spoken in the page language', () => {
  test('with a review count, plural-correct', () => {
    expect(ratingLabel(i18n.getFixedT('en'), 'en', 4.5, 1)).toBe(
      'Rated 4.5 out of 5 from 1 review',
    );
    expect(ratingLabel(i18n.getFixedT('ru'), 'ru', 4.5, 5)).toBe(
      'Оценка 4,5 из 5, 5 отзывов',
    );
  });

  test('a single review’s own rating, without a count', () => {
    expect(ratingLabel(i18n.getFixedT('hy'), 'hy', 4)).toBe(
      'Գնահատականը՝ 4,0 5-ից',
    );
  });
});
