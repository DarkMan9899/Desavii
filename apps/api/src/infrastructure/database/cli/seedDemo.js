/**
 * `npm run db:seed:demo` — resets the disposable test database and fills it
 * with a large, realistic demo marketplace dataset (Phase 11 pre-flight
 * verification): 5 partners, 20 customers, 80+ listings across every
 * category/city/pricing-model/status, 150+ bookings across every status,
 * plus reviews/favorites — then layers Phase 17 inventory scenarios onto
 * the dev-credentials vendor partner (`seedDemoInventoryScenarios.js`).
 *
 * Follows the exact same safety pattern as `cli/resetTest.js`: forces
 * `process.env.NODE_ENV = 'test'` as the very first statement (before any
 * dynamic import touches config), then re-verifies with `config.isTest`
 * and `looksLikeTestDatabase` before doing anything destructive. This
 * script only ever targets `travelhub_test` — it reuses `db:reset:test`'s
 * own reset+migrate+seedAll sequence and layers the demo dataset on top,
 * so it can never reach the developer's real database.
 */

process.env.NODE_ENV = 'test';

const { default: config } = await import('../../../config/index.js');
const { getModuleLogger } = await import('../../../logging/logger.js');
const { recreateDatabase } = await import('../reset.js');
const { up } = await import('../migrate.js');
const { seedAll } = await import('../seeds/index.js');
const { default: seedDemoMarketplace } =
  await import('../seeds/demo/seedDemoMarketplace.js');
const { default: seedDemoInventoryScenarios } =
  await import('../seeds/demo/seedDemoInventoryScenarios.js');
const { default: seedDemoListingRichContent } =
  await import('../seeds/demo/seedDemoListingRichContent.js');
const { default: seedDemoSprintJCatalog } =
  await import('../seeds/demo/seedDemoSprintJCatalog.js');
const { default: backfillListingCoordinatesFromCity } =
  await import('../seeds/demo/backfillListingCoordinatesFromCity.js');
const { closeMysqlPool, getMysqlPool } = await import('../mysqlPool.js');
const { withTransaction } = await import('../transaction.js');
const { looksLikeTestDatabase } = await import('../resetSafety.js');

const log = getModuleLogger('infrastructure:db-seed-demo');

async function main() {
  if (!config.isTest) {
    throw new Error(
      `Expected NODE_ENV=test to be in effect, but config.isTest is false.`,
    );
  }
  if (!looksLikeTestDatabase(config.database.name)) {
    throw new Error(
      `Refusing to seed "${config.database.name}" with demo data — it ` +
        `doesn't look like a test database. Check DATABASE_NAME_TEST in your .env.`,
    );
  }

  log.info(
    { database: config.database.name, host: config.database.host },
    'db:seed:demo — resetting the test database before loading demo data',
  );
  await recreateDatabase();
  await up();
  await seedAll();

  log.info('db:seed:demo — loading demo marketplace dataset');
  const pool = getMysqlPool();
  const summary = await withTransaction(
    (connection) => seedDemoMarketplace(connection),
    { pool },
  );

  log.info('db:seed:demo — loading dev-vendor inventory scenarios (Phase 17)');
  const inventorySummary = await withTransaction(
    (connection) => seedDemoInventoryScenarios(connection),
    { pool },
  );

  log.info(
    'db:seed:demo — loading Phase 18 rich content for flagship listings',
  );
  await withTransaction(
    (connection) =>
      seedDemoListingRichContent(connection, inventorySummary.listings),
    { pool },
  );

  log.info(
    'db:seed:demo — loading Sprint J marketplace coverage catalog (3 per public category)',
  );
  const sprintJSummary = await withTransaction(
    (connection) => seedDemoSprintJCatalog(connection),
    { pool },
  );

  log.info(
    'db:seed:demo — backfilling listing coordinates from their city centroid',
  );
  const coordinateSummary = await withTransaction(
    (connection) => backfillListingCoordinatesFromCity(connection),
    { pool },
  );

  log.info(
    { summary, inventorySummary, sprintJSummary, coordinateSummary },
    'db:seed:demo complete',
  );
}

try {
  await main();
} catch (err) {
  log.error({ err }, 'db:seed:demo failed');
  process.exitCode = 1;
} finally {
  await closeMysqlPool();
}
