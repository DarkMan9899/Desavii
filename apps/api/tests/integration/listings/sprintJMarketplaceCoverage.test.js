/**
 * Sprint J — Final Realistic Marketplace Data. Protects the sprint's core
 * product contract: every public category has at least 3 real, distinct,
 * fully tri-lingual, publicly discoverable listings, reproducible from the
 * repository's own seed scripts (not left-over manual QA rows).
 *
 * Deliberately DB-only (mirrors `database/seeds.test.js`'s own pattern —
 * `up()`/`seedAll()`/`getMysqlPool` only, no `app.js`/HTTP/Redis): this
 * asserts against the seeded rows directly, which is enough to prove the
 * contract and keeps the check fast, since `seedDemoSprintJCatalog.js` was
 * deliberately built to need nothing beyond the plain `seedAll()` baseline
 * (see that file's own header) — this test intentionally does NOT run the
 * much heavier `seedDemoMarketplace`/`seedDemoInventoryScenarios`/
 * `seedDemoListingRichContent` pipeline, which is exercised separately by
 * the demo CLI scripts, not by the Jest suite.
 *
 * The 9-category list is the explicit product contract (spec §47): if a
 * 10th public category is ever added, this list must be updated too, and
 * the deliberately-hardcoded array below makes that obvious rather than
 * silently passing.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import seedDemoSprintJCatalog from '../../../src/infrastructure/database/seeds/demo/seedDemoSprintJCatalog.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';

const PUBLIC_CATEGORIES = [
  'hotels',
  'apartments',
  'villas',
  'guest-houses',
  'restaurants',
  'tours',
  'car-rentals',
  'attractions',
  'entertainment-venues',
];

const MINIMUM_QUALIFYING_LISTINGS_PER_CATEGORY = 3;
const REQUIRED_LOCALES = ['en', 'hy', 'ru'];

let pool;

beforeAll(async () => {
  await up();
  await seedAll();
  pool = getMysqlPool();
  await seedDemoSprintJCatalog(pool);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
});

describe('Sprint J marketplace coverage — 9 public categories x >=3 qualifying listings', () => {
  test.each(PUBLIC_CATEGORIES)(
    'category "%s" exists as real taxonomy',
    async (categorySlug) => {
      const [[category]] = await pool.query(
        'SELECT id FROM listing_categories WHERE slug = ?',
        [categorySlug],
      );
      expect(category).toBeDefined();
    },
  );

  test.each(PUBLIC_CATEGORIES)(
    'category "%s" has >=3 published, publicly discoverable listings',
    async (categorySlug) => {
      const [[category]] = await pool.query(
        'SELECT id FROM listing_categories WHERE slug = ?',
        [categorySlug],
      );

      const [rows] = await pool.query(
        `SELECT l.id, l.slug, lt.code AS listing_type_code
         FROM listings l
         JOIN listing_category_listing lcl ON lcl.listing_id = l.id
         JOIN listing_statuses ls ON ls.id = l.status_id
         JOIN listing_types lt ON lt.id = l.listing_type_id
         WHERE lcl.category_id = ?
           AND ls.code = 'PUBLISHED'
           AND l.deleted_at IS NULL
           AND l.is_indexable = 1`,
        [category.id],
      );

      expect(rows.length).toBeGreaterThanOrEqual(
        MINIMUM_QUALIFYING_LISTINGS_PER_CATEGORY,
      );
      // every published listing must resolve to a real listing_type — no
      // orphaned/half-seeded row sneaking past the count.
      rows.forEach((row) => {
        expect(row.listing_type_code).toEqual(expect.any(String));
      });
    },
  );

  test.each(PUBLIC_CATEGORIES)(
    'category "%s": every published Sprint J listing has real EN/HY/RU title+summary+description',
    async (categorySlug) => {
      // Scoped to this module's own `sprintj-` listings, not "every
      // listing in the category" — other integration test FILES (e.g.
      // `entertainmentVenues.test.js`) create their own real, dynamically
      // titled listings in shared categories and never clean them up
      // (this codebase's own established test convention relies on an
      // external `db:reset:test` between full-suite runs, not per-file
      // teardown), so a suite-wide `--runInBand` run can leave sibling
      // rows in the same category with only a `title` and no
      // `summary`/`description` at all. Scoping by slug keeps this
      // assertion about Sprint J's own contract, not about unrelated
      // tests' fixtures.
      const [[category]] = await pool.query(
        'SELECT id FROM listing_categories WHERE slug = ?',
        [categorySlug],
      );
      const [listings] = await pool.query(
        `SELECT l.id
         FROM listings l
         JOIN listing_category_listing lcl ON lcl.listing_id = l.id
         JOIN listing_statuses ls ON ls.id = l.status_id
         WHERE lcl.category_id = ? AND ls.code = 'PUBLISHED' AND l.deleted_at IS NULL
           AND l.slug LIKE 'sprintj-%'`,
        [category.id],
      );
      expect(listings.length).toBeGreaterThanOrEqual(
        MINIMUM_QUALIFYING_LISTINGS_PER_CATEGORY,
      );

      // eslint-disable-next-line no-restricted-syntax -- assertion order must stay stable/readable
      for (const listing of listings) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design, this is a test not a hot path
        const [translations] = await pool.query(
          `SELECT l2.code AS language_code, lt.title, lt.summary, lt.description
           FROM listing_translations lt
           JOIN languages l2 ON l2.id = lt.language_id
           WHERE lt.listing_id = ?`,
          [listing.id],
        );
        const byLocale = new Map(
          translations.map((row) => [row.language_code, row]),
        );

        REQUIRED_LOCALES.forEach((locale) => {
          const translation = byLocale.get(locale);
          expect(translation).toBeDefined();
          expect(translation.title?.trim().length).toBeGreaterThan(0);
          expect(translation.summary?.trim().length).toBeGreaterThan(0);
          expect(translation.description?.trim().length).toBeGreaterThan(0);
        });
      }
    },
  );

  test.each(PUBLIC_CATEGORIES)(
    'category "%s": every published Sprint J listing has pricing, >=1 bookable unit with real availability, >=1 amenity',
    async (categorySlug) => {
      // Scoped to `sprintj-` listings — see the translation-completeness
      // test above for why (shared-DB pollution from other test files).
      const [[category]] = await pool.query(
        'SELECT id FROM listing_categories WHERE slug = ?',
        [categorySlug],
      );
      const [listings] = await pool.query(
        `SELECT l.id
         FROM listings l
         JOIN listing_category_listing lcl ON lcl.listing_id = l.id
         JOIN listing_statuses ls ON ls.id = l.status_id
         WHERE lcl.category_id = ? AND ls.code = 'PUBLISHED' AND l.deleted_at IS NULL
           AND l.slug LIKE 'sprintj-%'`,
        [category.id],
      );
      expect(listings.length).toBeGreaterThanOrEqual(
        MINIMUM_QUALIFYING_LISTINGS_PER_CATEGORY,
      );

      // eslint-disable-next-line no-restricted-syntax -- assertion order must stay stable/readable
      for (const listing of listings) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const [[pricing]] = await pool.query(
          'SELECT amount FROM listing_pricing WHERE listing_id = ?',
          [listing.id],
        );
        expect(pricing).toBeDefined();
        expect(Number(pricing.amount)).toBeGreaterThan(0);

        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const [units] = await pool.query(
          'SELECT id FROM bookable_units WHERE listing_id = ?',
          [listing.id],
        );
        expect(units.length).toBeGreaterThan(0);

        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const [[calendarCount]] = await pool.query(
          `SELECT COUNT(*) AS c FROM availability_calendar
           WHERE bookable_unit_id = ? AND status_id = (
             SELECT id FROM availability_statuses WHERE code = 'AVAILABLE'
           )`,
          [units[0].id],
        );
        expect(Number(calendarCount.c)).toBeGreaterThan(0);

        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const [[amenityCount]] = await pool.query(
          'SELECT COUNT(*) AS c FROM listing_amenity_listing WHERE listing_id = ?',
          [listing.id],
        );
        expect(Number(amenityCount.c)).toBeGreaterThan(0);

        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const [media] = await pool.query(
          "SELECT id FROM media WHERE mediable_type = 'listing' AND mediable_id = ?",
          [listing.id],
        );
        expect(media.length).toBeGreaterThan(0);
      }
    },
  );

  test.each(PUBLIC_CATEGORIES)(
    'category "%s": Sprint J listings are materially non-clone (unique slug/title, no two identical descriptions)',
    async (categorySlug) => {
      // Scoped to `sprintj-` listings — see the translation-completeness
      // test above for why (shared-DB pollution from other test files;
      // this guard only makes a claim about Sprint J's own 3-per-category
      // set, not about the category's full contents).
      const [[category]] = await pool.query(
        'SELECT id FROM listing_categories WHERE slug = ?',
        [categorySlug],
      );
      const [rows] = await pool.query(
        `SELECT l.id, l.slug, lt.title, lt.description
         FROM listings l
         JOIN listing_category_listing lcl ON lcl.listing_id = l.id
         JOIN listing_statuses ls ON ls.id = l.status_id
         JOIN listing_translations lt ON lt.listing_id = l.id
         JOIN languages lang ON lang.id = lt.language_id AND lang.code = 'en'
         WHERE lcl.category_id = ? AND ls.code = 'PUBLISHED' AND l.deleted_at IS NULL
           AND l.slug LIKE 'sprintj-%'`,
        [category.id],
      );
      expect(rows.length).toBeGreaterThanOrEqual(
        MINIMUM_QUALIFYING_LISTINGS_PER_CATEGORY,
      );

      const slugs = rows.map((r) => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);

      const titles = rows.map((r) => r.title);
      expect(new Set(titles).size).toBe(titles.length);

      const descriptions = rows.map((r) => r.description);
      expect(new Set(descriptions).size).toBe(descriptions.length);
    },
  );

  test('GET-equivalent category listing appears through the same category/type relation search relies on (no orphaned category link)', async () => {
    // eslint-disable-next-line no-restricted-syntax -- assertion order must stay stable/readable
    for (const categorySlug of PUBLIC_CATEGORIES) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS c
         FROM listings l
         JOIN listing_category_listing lcl ON lcl.listing_id = l.id
         JOIN listing_categories lc ON lc.id = lcl.category_id
         JOIN listing_statuses ls ON ls.id = l.status_id
         WHERE lc.slug = ? AND ls.code = 'PUBLISHED' AND l.deleted_at IS NULL`,
        [categorySlug],
      );
      expect(Number(row.c)).toBeGreaterThanOrEqual(
        MINIMUM_QUALIFYING_LISTINGS_PER_CATEGORY,
      );
    }
  });
});
