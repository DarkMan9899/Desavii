/**
 * `npm run db:seed:qa -- --confirm` — rebuilds the LOCAL DEVELOPMENT
 * database (`DATABASE_NAME`) as a clean, reproducible QA marketplace:
 * exactly 5 published listings in each of the 9 public categories, one
 * synthetic login per role, non-public moderation fixtures, calendar
 * scenarios, bookings in every status and moderation-queue records.
 *
 * Layers: the `seedAll()` baseline (run by `runDevDatabaseSeed`), the
 * Sprint J catalog (3 per category), the QA environment
 * (`seedDemoQaEnvironment.js` — the QA accounts and 2 more per category),
 * then city-centroid coordinates for any listing that has none. It does
 * not load the large `db:seed:demo` dataset, so category counts stay exact.
 *
 * Destructive: the shared guards in `runDevDatabaseSeed.js` refuse to run
 * without --confirm, under NODE_ENV=test or production, or against a
 * test-looking database. The QA accounts' password is the repository's
 * documented, local-only demo password — see
 * docs/SPRINT_5_DATABASE_FOUNDATION.md §7.
 */

import { runDevDatabaseSeed } from './runDevDatabaseSeed.js';

const USAGE = `
✖ Refusing to rebuild the DEVELOPMENT database as a QA marketplace without explicit confirmation.

This drops and recreates your local development database, then re-runs
migrations, the baseline seed, the Sprint J catalog and the QA environment
(QA accounts, 5 listings per category, bookings). Any data beyond what the
seed scripts create will be permanently lost.

If you're sure, re-run with the --confirm flag:

    npm run db:seed:qa -- --confirm
`;

const layers = [
  {
    label: 'Sprint J marketplace coverage catalog (3 per public category)',
    run: async (connection) =>
      (await import('../seeds/demo/seedDemoSprintJCatalog.js')).default(
        connection,
      ),
  },
  {
    label: 'QA environment (accounts, 2 more per category, bookings)',
    run: async (connection) =>
      (await import('../seeds/demo/seedDemoQaEnvironment.js')).default(
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
    commandName: 'db:seed:qa',
    usage: USAGE,
    layers,
  });
} catch (err) {
  console.error('✖ db:seed:qa failed:', err);
  process.exitCode = 1;
}
