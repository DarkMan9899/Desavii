/**
 * Pass 3 remediation (Map data contract). `listingService.js`'s
 * `#checkPublishReadiness` already requires real coordinates for any
 * listing published through the real service — the demo/dev catalog only
 * ended up 100% coordinate-less because the seed scripts insert
 * `listing_locations` directly, bypassing that check. This proves the
 * backfill helper (`seeds/demo/backfillListingCoordinatesFromCity.js`)
 * fixes that without fabricating any address: it derives coordinates only
 * from a listing's own real, seeded city centroid (`cities.latitude`/
 * `longitude`, already real geographic data), never invents a value, and
 * never overwrites a coordinate a listing already has.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import backfillListingCoordinatesFromCity from '../../../src/infrastructure/database/seeds/demo/backfillListingCoordinatesFromCity.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';

beforeAll(async () => {
  await up();
  await seedAll();
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
});

async function insertFixtureListing(
  pool,
  { slug, cityId, latitude, longitude },
) {
  const [[partner]] = await pool.query('SELECT id FROM partners LIMIT 1');
  const [[listingType]] = await pool.query(
    "SELECT id FROM listing_types WHERE code = 'HOTEL' LIMIT 1",
  );
  const [[status]] = await pool.query(
    "SELECT id FROM listing_statuses WHERE code = 'DRAFT' LIMIT 1",
  );
  const [[moderationStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'PENDING' LIMIT 1",
  );
  const [listingResult] = await pool.query(
    `INSERT INTO listings (partner_id, listing_type_id, slug, status_id, moderation_status_id)
     VALUES (?, ?, ?, ?, ?)`,
    [partner.id, listingType.id, slug, status.id, moderationStatus.id],
  );
  const listingId = listingResult.insertId;
  await pool.query(
    `INSERT INTO listing_locations (listing_id, city_id, latitude, longitude)
     VALUES (?, ?, ?, ?)`,
    [listingId, cityId, latitude, longitude],
  );
  return listingId;
}

describe('backfillListingCoordinatesFromCity (Map data contract)', () => {
  test("fills a listing's missing coordinates from its own city's real centroid", async () => {
    const pool = getMysqlPool();
    const [[city]] = await pool.query(
      'SELECT id, latitude, longitude FROM cities WHERE latitude IS NOT NULL LIMIT 1',
    );
    const listingId = await insertFixtureListing(pool, {
      slug: `backfill-coord-test-${Date.now()}`,
      cityId: city.id,
      latitude: null,
      longitude: null,
    });

    const { backfilledRows } = await backfillListingCoordinatesFromCity(pool);
    expect(backfilledRows).toBeGreaterThanOrEqual(1);

    const [[location]] = await pool.query(
      'SELECT latitude, longitude FROM listing_locations WHERE listing_id = ?',
      [listingId],
    );
    expect(Number(location.latitude)).toBeCloseTo(Number(city.latitude), 5);
    expect(Number(location.longitude)).toBeCloseTo(Number(city.longitude), 5);
  });

  test('never overwrites a listing that already has real coordinates', async () => {
    const pool = getMysqlPool();
    const [[city]] = await pool.query(
      'SELECT id, latitude, longitude FROM cities WHERE latitude IS NOT NULL LIMIT 1',
    );
    const explicitLat = 40.111111;
    const explicitLng = 44.222222;
    const listingId = await insertFixtureListing(pool, {
      slug: `backfill-coord-preserve-${Date.now()}`,
      cityId: city.id,
      latitude: explicitLat,
      longitude: explicitLng,
    });

    await backfillListingCoordinatesFromCity(pool);

    const [[location]] = await pool.query(
      'SELECT latitude, longitude FROM listing_locations WHERE listing_id = ?',
      [listingId],
    );
    expect(Number(location.latitude)).toBeCloseTo(explicitLat, 5);
    expect(Number(location.longitude)).toBeCloseTo(explicitLng, 5);
  });
});
