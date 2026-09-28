/**
 * Step L6.2H1 — the demo marketplace pipeline only prices listings with
 * models their category offers (and so the booking engine can charge): no
 * demo Tour is PER_HOUR any more, and no Tour copy promises an hourly price.
 * (The Sprint J catalog — which holds the Entertainment Venues — is checked
 * by `listings/sprintJMarketplaceCoverage.test.js`, which already seeds it.)
 *
 * Runs the real demo pipeline in `cli/seedDemo.js`'s order on one connection
 * inside a transaction that is always rolled back, so the shared test
 * database is left exactly as the global setup made it.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import seedDemoMarketplace from '../../../src/infrastructure/database/seeds/demo/seedDemoMarketplace.js';
import seedDemoInventoryScenarios from '../../../src/infrastructure/database/seeds/demo/seedDemoInventoryScenarios.js';
import seedDemoListingRichContent from '../../../src/infrastructure/database/seeds/demo/seedDemoListingRichContent.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import {
  listSeededPricing,
  findPriceBasisClaims,
} from '../helpers/seedPricingModels.js';

const SEEDED_SCOPE = 'l.id >= ?';

let connection;
let seededParams;

beforeAll(async () => {
  await up();
  await seedAll();
  connection = await getMysqlPool().getConnection();
  await connection.beginTransaction();
  const [[{ maxId }]] = await connection.query(
    'SELECT COALESCE(MAX(id), 0) AS maxId FROM listings',
  );
  // COALESCE over a BIGINT comes back as a string.
  seededParams = [Number(maxId) + 1];
  await seedDemoMarketplace(connection);
  const inventorySummary = await seedDemoInventoryScenarios(connection);
  await seedDemoListingRichContent(connection, inventorySummary.listings);
}, 180_000);

afterAll(async () => {
  await connection.rollback();
  connection.release();
  await closeMysqlPool();
});

describe('demo marketplace pricing models (Step L6.2H1)', () => {
  test('no demo listing is priced PER_HOUR; the demo tours are all still there, PER_PERSON', async () => {
    const rows = await listSeededPricing(
      connection,
      SEEDED_SCOPE,
      seededParams,
    );
    const tours = rows.filter((row) => row.category === 'tours');

    expect(rows.filter((row) => row.model === 'PER_HOUR')).toEqual([]);
    expect(tours.length).toBeGreaterThanOrEqual(8);
    expect(tours.every((row) => row.model === 'PER_PERSON')).toBe(true);
  });

  test("every demo listing's model is one its category offers", async () => {
    const rows = await listSeededPricing(
      connection,
      SEEDED_SCOPE,
      seededParams,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.offered)).toEqual([]);
  });

  test('demo Tour copy never claims an hourly, per-session or per-lane price', async () => {
    const { checked, claims } = await findPriceBasisClaims(
      connection,
      SEEDED_SCOPE,
      seededParams,
    );
    expect(checked).toBeGreaterThan(0);
    expect(claims).toEqual([]);
  });
});
