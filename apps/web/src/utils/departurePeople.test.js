import { describe, test, expect } from 'vitest';
import {
  resolveDeparturePeopleKey,
  resolveDeparturePeopleCount,
} from './departurePeople.js';

// Step L6.2H3B — what a departure's quantity counts, by category.
describe('departurePeople', () => {
  test.each([
    [{ categorySlug: 'tours' }, 'travelers'],
    [{ categorySlug: 'attractions' }, 'visitors'],
    [{ categorySlug: 'entertainment-venues' }, 'participants'],
    [{ listingType: 'TOUR' }, 'travelers'],
    [{ listingType: 'ATTRACTION' }, 'visitors'],
    [
      { categorySlug: 'entertainment-venues', listingType: 'ATTRACTION' },
      'participants',
    ],
    [{}, 'people'],
  ])('%o -> %s', (input, key) => {
    expect(resolveDeparturePeopleKey(input)).toBe(key);
  });

  test("a departure item's people count is its quantity; any other item has none", () => {
    expect(
      resolveDeparturePeopleCount({
        bookable_unit_type: 'TOUR_DEPARTURE',
        quantity: 4,
      }),
    ).toBe(4);
    expect(
      resolveDeparturePeopleCount({
        bookable_unit_type: 'HOTEL_ROOM',
        quantity: 2,
      }),
    ).toBeNull();
  });
});
