import { describe, test, expect } from 'vitest';
import {
  FEATURED_RAIL_SIZE,
  FEATURED_SOURCES,
  needsFeaturedFill,
  selectFeaturedListings,
} from './selectFeaturedListings.js';
import {
  TOP_RATING_MIN,
  TOP_RATING_MIN_REVIEWS,
} from '../../../utils/listingCardModel.js';

const listing = (id, listingType, reviewCount = 0, rating = null) => ({
  id,
  listing_type: listingType,
  review_count: reviewCount,
  rating_average: rating,
  title: `Listing ${id}`,
});

const ids = (picked) => picked.map(({ listing: l }) => l.id);
const sources = (picked) => picked.map(({ source }) => source);

describe('selectFeaturedListings (apps/web/src/modules/home)', () => {
  test('promotions come first, in order, and are always marked promoted', () => {
    const picked = selectFeaturedListings(
      [listing(2, 'HOTEL'), listing(9, 'TOUR')],
      [listing(5, 'RESTAURANT', 3, 4.5)],
    );
    expect(ids(picked).slice(0, 2)).toEqual([2, 9]);
    expect(sources(picked).slice(0, 2)).toEqual([
      FEATURED_SOURCES.PROMOTED,
      FEATURED_SOURCES.PROMOTED,
    ]);
  });

  test('a full set of promotions is shown alone — nothing is added', () => {
    const promoted = Array.from({ length: FEATURED_RAIL_SIZE + 2 }, (_, i) =>
      listing(i + 1, 'HOTEL'),
    );
    const picked = selectFeaturedListings(promoted, [
      listing(99, 'TOUR', 4, 5),
    ]);
    expect(picked).toHaveLength(FEATURED_RAIL_SIZE + 2);
    expect(new Set(sources(picked))).toEqual(
      new Set([FEATURED_SOURCES.PROMOTED]),
    );
  });

  test('fills with top-rated listings first, then the newest of each unseen category', () => {
    const picked = selectFeaturedListings(
      [listing(2, 'HOTEL')],
      [
        listing(28, 'HOTEL', 12, 4.9),
        listing(34, 'PROPERTY', 3, 4.5),
        listing(45, 'ATTRACTION'),
        listing(44, 'ATTRACTION'),
        listing(41, 'CAR_RENTAL'),
        listing(39, 'TOUR'),
        listing(37, 'RESTAURANT'),
        listing(36, 'RESTAURANT'),
        listing(35, 'PROPERTY'),
      ],
    );
    expect(ids(picked)).toEqual([2, 28, 34, 45, 41, 39, 37]);
    expect(sources(picked)).toEqual([
      'promoted',
      'rated',
      'rated',
      'newest',
      'newest',
      'newest',
      'newest',
    ]);
  });

  test('never repeats a listing, even when a promotion is also a candidate', () => {
    const picked = selectFeaturedListings(
      [listing(2, 'HOTEL')],
      [listing(2, 'HOTEL', 5, 4.9), listing(3, 'TOUR')],
    );
    expect(ids(picked)).toEqual([2, 3]);
  });

  test('stops at the rail size', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      listing(i + 10, 'TOUR', 5, 5),
    );
    expect(selectFeaturedListings([], candidates)).toHaveLength(
      FEATURED_RAIL_SIZE,
    );
  });

  test('a single real promotion with nothing to add stays a single card', () => {
    expect(selectFeaturedListings([listing(2, 'HOTEL')], [])).toHaveLength(1);
  });

  test('no data at all is an empty rail — nothing invented', () => {
    expect(selectFeaturedListings([], [])).toEqual([]);
  });

  test('only a high average from enough reviews earns "Top guest rating"', () => {
    const picked = selectFeaturedListings(
      [],
      [
        // Unrated, or a count without an average.
        listing(1, 'TOUR', 0, null),
        listing(2, 'HOTEL', 2, null),
        // A perfect score from too few reviews.
        listing(3, 'PROPERTY', TOP_RATING_MIN_REVIEWS - 1, 5),
        // Enough reviews, but below the top step.
        listing(4, 'RESTAURANT', 20, TOP_RATING_MIN - 0.1),
        // Exactly at both thresholds.
        listing(5, 'ATTRACTION', TOP_RATING_MIN_REVIEWS, TOP_RATING_MIN),
      ],
    );
    const rated = picked.filter(
      ({ source }) => source === FEATURED_SOURCES.RATED,
    );
    expect(rated.map(({ listing: l }) => l.id)).toEqual([5]);
  });

  test('the rule matches the top step of the Search guest-rating filter', () => {
    expect(TOP_RATING_MIN).toBe(4.5);
    expect(TOP_RATING_MIN_REVIEWS).toBe(3);
  });

  test('needsFeaturedFill is true only while promotions cannot fill the rail', () => {
    expect(needsFeaturedFill(0)).toBe(true);
    expect(needsFeaturedFill(FEATURED_RAIL_SIZE - 1)).toBe(true);
    expect(needsFeaturedFill(FEATURED_RAIL_SIZE)).toBe(false);
  });
});
