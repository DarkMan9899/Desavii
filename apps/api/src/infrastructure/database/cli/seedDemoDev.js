/**
 * `npm run db:seed:demo:dev -- --confirm` — synchronizes the verified demo
 * marketplace dataset into the LOCAL DEVELOPMENT database.
 *
 * Workflow this supports: `travelhub_test` stays the private, disposable
 * workspace for development/debugging/automated tests/Playwright. Once a
 * phase is fully implemented and verified there, this script copies the
 * same result into `travelhub_dev` so the normal dev servers
 * (`npm run dev --workspace apps/api` / `apps/web`) show the completed
 * application immediately, with no NODE_ENV override needed.
 *
 * Mirrors `cli/resetDev.js`'s confirmation guard exactly (same --confirm/
 * --yes flag, same refusal under NODE_ENV=test, same production refusal)
 * since this is equally destructive to the developer's local database —
 * any data beyond what the seed scripts create is lost. Mirrors
 * `cli/seedDemo.js`'s reset+migrate+seedAll+seedDemoMarketplace pipeline
 * exactly, just targeting `config.database.name` (DATABASE_NAME) instead
 * of the test database.
 *
 * Adds one extra guard `seedDemo.js` doesn't need: refuses to run against
 * a resolved database name that looks like a test database — defense in
 * depth against a shell that already has NODE_ENV=test exported some
 * other way, which would otherwise make this silently target the wrong
 * database under the wrong label.
 */

import { isDevResetConfirmed, looksLikeTestDatabase } from '../resetSafety.js';

const argv = process.argv.slice(2);

function printUsage() {
  console.error(`
✖ Refusing to sync demo data into the DEVELOPMENT database without explicit confirmation.

This drops and recreates your local development database, then re-runs
migrations, the baseline seed, and the full demo marketplace dataset. Any
data beyond what the seed scripts create (listings you created by hand via
the Partner Wizard, manual test bookings, etc.) will be permanently lost.

If you're sure, re-run with the --confirm flag:

    npm run db:seed:demo:dev -- --confirm
`);
}

async function main() {
  if (!isDevResetConfirmed(argv)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (process.env.NODE_ENV === 'test') {
    console.error(
      '✖ NODE_ENV=test is set in this shell — refusing to run the DEV ' +
        'demo-sync script in a test context. Unset NODE_ENV and re-run, ' +
        'or use `npm run db:seed:demo` if you meant to target the test database.',
    );
    process.exitCode = 1;
    return;
  }

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
  const { closeMysqlPool, getMysqlPool } = await import('../mysqlPool.js');
  const { withTransaction } = await import('../transaction.js');

  const log = getModuleLogger('infrastructure:db-seed-demo-dev');

  if (config.isProduction) {
    log.error('db:seed:demo:dev refuses to run when NODE_ENV=production.');
    process.exitCode = 1;
    return;
  }
  if (config.isTest || looksLikeTestDatabase(config.database.name)) {
    log.error(
      { database: config.database.name },
      'db:seed:demo:dev refuses to run against a database that looks like a test database.',
    );
    process.exitCode = 1;
    return;
  }

  try {
    log.warn(
      { database: config.database.name, host: config.database.host },
      'db:seed:demo:dev — dropping and recreating the development database',
    );
    await recreateDatabase();
    await up();
    await seedAll();

    log.info('db:seed:demo:dev — loading demo marketplace dataset');
    const pool = getMysqlPool();
    const summary = await withTransaction(
      (connection) => seedDemoMarketplace(connection),
      { pool },
    );

    log.info(
      'db:seed:demo:dev — loading dev-vendor inventory scenarios (Phase 17)',
    );
    const inventorySummary = await withTransaction(
      (connection) => seedDemoInventoryScenarios(connection),
      { pool },
    );

    log.info(
      'db:seed:demo:dev — loading Phase 18 rich content for flagship listings',
    );
    await withTransaction(
      (connection) =>
        seedDemoListingRichContent(connection, inventorySummary.listings),
      { pool },
    );

    log.info(
      'db:seed:demo:dev — loading Sprint J marketplace coverage catalog (3 per public category)',
    );
    const sprintJSummary = await withTransaction(
      (connection) => seedDemoSprintJCatalog(connection),
      { pool },
    );

    log.info(
      { summary, inventorySummary, sprintJSummary },
      'db:seed:demo:dev complete',
    );
  } finally {
    await closeMysqlPool();
  }
}

try {
  await main();
} catch (err) {
  console.error('✖ db:seed:demo:dev failed:', err);
  process.exitCode = 1;
}
