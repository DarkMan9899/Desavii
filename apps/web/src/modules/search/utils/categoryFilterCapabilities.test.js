import { describe, test, expect } from 'vitest';
import {
  DATE_MODES,
  getSearchCapabilities,
  shouldShowGuestsFilter,
} from './categoryFilterCapabilities.js';

describe('categoryFilterCapabilities (apps/web/src/modules/search)', () => {
  test.each([
    ['hotels', DATE_MODES.STAY, 'guests'],
    ['apartments', DATE_MODES.STAY, 'guests'],
    ['villas', DATE_MODES.STAY, 'guests'],
    ['guest-houses', DATE_MODES.STAY, 'guests'],
    ['car-rentals', DATE_MODES.RENTAL, null],
    ['restaurants', DATE_MODES.DAY, null],
    ['tours', DATE_MODES.DAY, 'travelers'],
    ['attractions', DATE_MODES.DAY, 'visitors'],
    ['entertainment-venues', DATE_MODES.DAY, 'participants'],
    [undefined, DATE_MODES.RANGE, 'guests'],
    ['some-future-category', DATE_MODES.RANGE, 'guests'],
  ])('%s: %s dates, party %s', (slug, dateMode, party) => {
    expect(getSearchCapabilities(slug)).toEqual({ dateMode, party });
    expect(shouldShowGuestsFilter(slug)).toBe(party !== null);
  });
});
