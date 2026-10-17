/**
 * Sprint 8: "Sorting: newest, oldest, alphabetical, relevance (prepare
 * architecture even if initial implementation is simple)." Search &
 * Discovery rebuild: plus price low-to-high / high-to-low. Remediation:
 * plus top rated.
 */

import { describe, test, expect } from '@jest/globals';
import {
  SORT_KEYS,
  DEFAULT_SORT_KEY,
  resolveSortOption,
} from '../../../../src/core/domain/sortOptions.js';

describe('resolveSortOption', () => {
  test('newest sorts by created_at DESC', () => {
    expect(resolveSortOption('newest')).toEqual({
      key: 'newest',
      column: 'created_at',
      direction: 'DESC',
      requiresKeyword: false,
    });
  });

  test('oldest sorts by created_at ASC', () => {
    expect(resolveSortOption('oldest').direction).toBe('ASC');
    expect(resolveSortOption('oldest').column).toBe('created_at');
  });

  test('alphabetical sorts by title ASC', () => {
    expect(resolveSortOption('alphabetical').column).toBe('title');
    expect(resolveSortOption('alphabetical').direction).toBe('ASC');
  });

  test('relevance is honored when a keyword is present', () => {
    const option = resolveSortOption('relevance', { hasKeyword: true });
    expect(option.key).toBe('relevance');
    expect(option.column).toBe('relevance_score');
  });

  test('relevance falls back to the default sort when no keyword is present', () => {
    const option = resolveSortOption('relevance', { hasKeyword: false });
    expect(option.key).toBe(DEFAULT_SORT_KEY);
  });

  test('relevance with no options argument also falls back (hasKeyword defaults to false)', () => {
    expect(resolveSortOption('relevance').key).toBe(DEFAULT_SORT_KEY);
  });

  test('an unknown sort key throws rather than silently defaulting', () => {
    expect(() => resolveSortOption('popularity')).toThrow(TypeError);
  });

  test('price_asc / price_desc sort by their own never-NULL price keys and need no keyword', () => {
    expect(resolveSortOption('price_asc')).toEqual({
      key: 'price_asc',
      column: 'price_sort_asc',
      direction: 'ASC',
      requiresKeyword: false,
    });
    expect(resolveSortOption('price_desc')).toEqual({
      key: 'price_desc',
      column: 'price_sort_desc',
      direction: 'DESC',
      requiresKeyword: false,
    });
  });

  test('rating_desc sorts by the never-NULL rating key and needs no keyword', () => {
    expect(resolveSortOption('rating_desc')).toEqual({
      key: 'rating_desc',
      column: 'rating_sort',
      direction: 'DESC',
      requiresKeyword: false,
    });
  });

  test('SORT_KEYS exposes exactly the seven documented sort options', () => {
    expect([...SORT_KEYS].sort()).toEqual(
      [
        'newest',
        'oldest',
        'alphabetical',
        'relevance',
        'price_asc',
        'price_desc',
        'rating_desc',
      ].sort(),
    );
  });
});
