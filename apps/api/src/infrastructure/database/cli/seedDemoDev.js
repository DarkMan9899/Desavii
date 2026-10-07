/**
 * `npm run db:seed:demo:dev -- --confirm` — synchronizes the verified demo
 * marketplace dataset into the LOCAL DEVELOPMENT database.
 *
 * Workflow this supports: `travelhub_test` stays the private, disposable
 * workspace for development/debugging/automated tests/Playwright. Once a
 * phase is fully implemented and verified there, this script copies the
 * same result into the development database (`DATABASE_NAME`) so the
 * normal dev servers (`npm run dev --workspace apps/api` / `apps/web`)
 * show the completed application immediately, with no NODE_ENV override
 * needed.
 *
 * Every destructive-reset guard (explicit --confirm, no NODE_ENV=test, no
 * production, no test-looking database) lives in `runDevDatabaseSeed.js`,
 * shared with `db:seed:qa`. The layers mirror `cli/seedDemo.js`'s
 * pipeline exactly, just targeting the development database. Seed modules
 * are imported lazily, only after those guards have passed.
 */

import { runDevDatabaseSeed } from './runDevDatabaseSeed.js';

const USAGE = `
✖ Refusing to sync demo data into the DEVELOPMENT database without explicit confirmation.

This drops and recreates your local development database, then re-runs
migrations, the baseline seed, and the full demo marketplace dataset. Any
data beyond what the seed scripts create (listings you created by hand via
the Partner Wizard, manual test bookings, etc.) will be permanently lost.

If you're sure, re-run with the --confirm flag:

    npm run db:seed:demo:dev -- --confirm
`;

const layers = [
  {
    label: 'demo marketplace dataset',
    run: async (connection) =>
      (await import('../seeds/demo/seedDemoMarketplace.js')).default(
        connection,
      ),
  },
  {
    label: 'dev-vendor inventory scenarios (Phase 17)',
    run: async (connection) =>
      (await import('../seeds/demo/seedDemoInventoryScenarios.js')).default(
        connection,
      ),
  },
  {
    label: 'Phase 18 rich content for flagship listings',
    run: async (connection, previous) =>
      (await import('../seeds/demo/seedDemoListingRichContent.js')).default(
        connection,
        previous['dev-vendor inventory scenarios (Phase 17)'].listings,
      ),
  },
  {
    label: 'Sprint J marketplace coverage catalog (3 per public category)',
    run: async (connection) =>
      (await import('../seeds/demo/seedDemoSprintJCatalog.js')).default(
        connection,
      ),
  },
  {
    label: 'listing coordinates backfilled from their city centroid',
    run: async (connection) =>
      (
        await import('../seeds/demo/backfillListingCoordinatesFromCity.js')
      ).default(connection),
  },
];

try {
  await runDevDatabaseSeed({
    argv: process.argv.slice(2),
    commandName: 'db:seed:demo:dev',
    usage: USAGE,
    layers,
  });
} catch (err) {
  console.error('✖ db:seed:demo:dev failed:', err);
  process.exitCode = 1;
}
