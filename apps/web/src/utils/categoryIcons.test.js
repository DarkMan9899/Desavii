import { describe, test, expect } from 'vitest';
import {
  getCategoryIcon,
  CATEGORY_ICONS_BY_SLUG,
  DEFAULT_CATEGORY_ICON,
} from './categoryIcons.js';

describe('categoryIcons (apps/web/src/utils)', () => {
  test('Entertainment Venues (Sprint I) has its own real icon, not the fallback', () => {
    expect(getCategoryIcon('entertainment-venues')).toBe(
      CATEGORY_ICONS_BY_SLUG['entertainment-venues'],
    );
    expect(getCategoryIcon('entertainment-venues')).not.toBe(
      DEFAULT_CATEGORY_ICON,
    );
  });

  test('an unrecognized slug still falls back gracefully', () => {
    expect(getCategoryIcon('some-future-category')).toBe(DEFAULT_CATEGORY_ICON);
  });
});
