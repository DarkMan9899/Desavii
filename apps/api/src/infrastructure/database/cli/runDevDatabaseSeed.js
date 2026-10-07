/**
 * The one guarded pipeline every "rebuild my LOCAL DEVELOPMENT database
 * with a seeded dataset" command shares (`db:seed:demo:dev`, `db:seed:qa`).
 *
 * Destructive by design — it drops and recreates `DATABASE_NAME` — so it
 * refuses to run unless every guard passes:
 * - an explicit `--confirm`/`--yes` flag (never an interactive prompt,
 *   which hangs forever in a non-interactive shell);
 * - NODE_ENV is not `test` (that would silently target the TEST database
 *   under a "dev" label) and not `production`;
 * - the resolved database name does not look like a test database
 *   (defense in depth against a shell that exported NODE_ENV=test some
 *   other way).
 *
 * After those, it recreates the database, applies every migration, runs
 * the `seedAll()` baseline and then each of the caller's `layers` in order,
 * each in its own transaction.
 */

import { isDevResetConfirmed, looksLikeTestDatabase } from '../resetSafety.js';

/**
 * @param {object} options
 * @param {string[]} options.argv - the CLI arguments after the script name.
 * @param {string} options.commandName - e.g. `db:seed:qa`, for messages.
 * @param {string} options.usage - printed when `--confirm` is missing.
 * @param {Array<{ label: string, run: (connection, previous: object) => Promise<object> }>} options.layers
 *   seed layers run in order; each receives the summary map of the layers before it.
 */
export async function runDevDatabaseSeed({ argv, commandName, usage, layers }) {
  if (!isDevResetConfirmed(argv)) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  if (process.env.NODE_ENV === 'test') {
    console.error(
      `✖ NODE_ENV=test is set in this shell — refusing to run the DEV ` +
        `"${commandName}" script in a test context. Unset NODE_ENV and re-run, ` +
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
  const { closeMysqlPool, getMysqlPool } = await import('../mysqlPool.js');
  const { withTransaction } = await import('../transaction.js');

  const log = getModuleLogger(
    `infrastructure:${commandName.replace(/:/g, '-')}`,
  );

  if (config.isProduction) {
    log.error(`${commandName} refuses to run when NODE_ENV=production.`);
    process.exitCode = 1;
    return;
  }
  if (config.isTest || looksLikeTestDatabase(config.database.name)) {
    log.error(
      { database: config.database.name },
      `${commandName} refuses to run against a database that looks like a test database.`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    log.warn(
      { database: config.database.name, host: config.database.host },
      `${commandName} — dropping and recreating the development database`,
    );
    await recreateDatabase();
    await up();
    await seedAll();

    const pool = getMysqlPool();
    const summaries = {};
    // eslint-disable-next-line no-restricted-syntax -- layers must run in order, each on the previous one's data
    for (const layer of layers) {
      log.info(`${commandName} — ${layer.label}`);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      summaries[layer.label] = await withTransaction(
        (connection) => layer.run(connection, summaries),
        { pool },
      );
    }
    log.info({ summaries }, `${commandName} complete`);
  } finally {
    await closeMysqlPool();
  }
}

export default runDevDatabaseSeed;
