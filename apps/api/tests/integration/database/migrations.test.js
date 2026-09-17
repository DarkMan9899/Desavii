/**
 * Sprint 5 Quality Gate item 4: "Validate a fresh database migration from
 * an empty database." Drops + recreates a dedicated, disposable
 * `travelhub_test_migration_check` database, runs every migration from
 * scratch, and asserts the resulting schema is complete — the only way
 * to genuinely prove migrations 0001-0011 apply cleanly in order with no
 * missing dependency.
 *
 * Deliberately does NOT run this against the shared `travelhub_test`
 * database (DATABASE_NAME_TEST): every other integration test file in
 * the same `--runInBand` run shares that database, self-seeding it via
 * up()+seedAll() in its own beforeAll. Dropping *that* database mid-suite
 * left the run's outcome dependent on file execution order and could
 * cascade "Unknown database" failures into whichever files happened to
 * run next. Using an isolated, throwaway database name for this one
 * destructive check keeps it fully independent of the rest of the suite.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, afterAll } from '@jest/globals';
import mysql from 'mysql2/promise';
import config from '../../../src/config/index.js';
import {
  recreateDatabase,
  dropDatabase,
} from '../../../src/infrastructure/database/reset.js';
import {
  up,
  listMigrations,
} from '../../../src/infrastructure/database/migrate.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/infrastructure/database/migrations',
);

const MIGRATION_CHECK_DATABASE = 'travelhub_test_migration_check';

afterAll(async () => {
  await dropDatabase(MIGRATION_CHECK_DATABASE);
  await closeMysqlPool();
}, 60_000);

describe('Fresh migration from an empty database (Sprint 5 Quality Gate #4)', () => {
  test('every migration applies cleanly, in order, against a brand-new database', async () => {
    // Safety net: this test drops the database it connects to — never
    // let it run against anything but its own dedicated, disposable
    // database, and never the shared database the rest of the suite uses.
    expect(config.isTest).toBe(true);
    expect(MIGRATION_CHECK_DATABASE).not.toBe(config.database.name);

    await recreateDatabase(MIGRATION_CHECK_DATABASE);
    await up(undefined, { databaseName: MIGRATION_CHECK_DATABASE });

    const pool = getMysqlPool();
    const [rows] = await pool.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
      [MIGRATION_CHECK_DATABASE],
    );
    const tableNames = new Set(
      rows.map((row) => row.table_name ?? row.TABLE_NAME),
    );

    const expectedCoreTables = [
      'schema_migrations',
      'languages',
      'currencies',
      'countries',
      'regions',
      'cities',
      'users',
      'roles',
      'permissions',
      'role_user',
      'permission_role',
      'partners',
      'partner_employees',
      'addresses',
      'listing_categories',
      'tags',
      'listings',
      'listing_translations',
      'media',
      'bookable_units',
      'availability_calendar',
      'reservation_holds',
      'bookings',
      'booking_items',
      'booking_status_history',
      'reviews',
      'favorites',
      'advertisements',
      'audit_logs',
      'activity_logs',
    ];
    expectedCoreTables.forEach((table) => {
      expect(tableNames.has(table)).toBe(true);
    });
  }, 60_000);

  test('schema_migrations records exactly one row per migration file, none pending', async () => {
    const pool = getMysqlPool();
    const [rows] = await pool.query(
      `SELECT version FROM \`${MIGRATION_CHECK_DATABASE}\`.schema_migrations ORDER BY version`,
    );
    const appliedVersions = rows.map((row) => row.version);
    const allMigrations = listMigrations();

    expect(appliedVersions).toHaveLength(allMigrations.length);
    expect(new Set(appliedVersions).size).toBe(appliedVersions.length);
  });

  test('re-running "up" against an already-migrated database is a no-op (idempotent)', async () => {
    await expect(
      up(undefined, { databaseName: MIGRATION_CHECK_DATABASE }),
    ).resolves.not.toThrow();
    const pool = getMysqlPool();
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM \`${MIGRATION_CHECK_DATABASE}\`.schema_migrations`,
    );
    expect(Number(rows[0].count)).toBe(listMigrations().length);
  });

  // P2.2A review: `migrate.js`'s own `down(steps)` has no `{databaseName}`
  // option (unlike `up`) — it always targets `config.database.name`, so it
  // cannot be pointed at this file's disposable database the way `up` is
  // above. Rather than inventing a new down-migration mechanism, this
  // opens one raw connection scoped to the disposable database (the same
  // `mysql2` package `migrate.js` itself uses) and runs 0034's own
  // `.down.sql` file content directly — proving THIS migration's down
  // script is valid, reversible SQL, without adding a general capability
  // this repository's tooling doesn't already have.
  test('migration 0034 down.sql cleanly reverses the four new bookable_units columns', async () => {
    const connection = await mysql.createConnection({
      host: config.database.host,
      port: config.database.port,
      database: MIGRATION_CHECK_DATABASE,
      user: config.database.user,
      password: config.database.password,
      multipleStatements: true,
    });
    try {
      const downSql = readFileSync(
        path.join(
          MIGRATIONS_DIR,
          '0034_bookable_unit_pricing_occupancy.down.sql',
        ),
        'utf8',
      );
      await expect(connection.query(downSql)).resolves.not.toThrow();

      const [columns] = await connection.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'bookable_units'`,
        [MIGRATION_CHECK_DATABASE],
      );
      const columnNames = new Set(
        columns.map((row) => row.column_name ?? row.COLUMN_NAME),
      );
      expect(columnNames.has('max_guests')).toBe(false);
      expect(columnNames.has('bed_configuration')).toBe(false);
      expect(columnNames.has('base_price_amount')).toBe(false);
      expect(columnNames.has('base_price_currency_id')).toBe(false);
      // The pre-0034 columns this migration never touched are untouched.
      expect(columnNames.has('capacity')).toBe(true);
      expect(columnNames.has('unit_label')).toBe(true);

      // Restore this disposable database to fully-migrated state so this
      // test doesn't leave it in a half-reverted condition for anything
      // that might run after it within this same file.
      await connection.query(
        `DELETE FROM schema_migrations WHERE version = '0034'`,
      );
    } finally {
      await connection.end();
    }
    await up(undefined, { databaseName: MIGRATION_CHECK_DATABASE });
  });

  // P2.2E final acceptance: same pattern as the 0034 proof above, now for
  // the current most-recent migration — proves 0035's down.sql is valid,
  // reversible SQL and that reversing it leaves every other column
  // (including 0034's own additions) untouched.
  test('migration 0035 down.sql cleanly reverses the booking_items unit-label snapshot column', async () => {
    const connection = await mysql.createConnection({
      host: config.database.host,
      port: config.database.port,
      database: MIGRATION_CHECK_DATABASE,
      user: config.database.user,
      password: config.database.password,
      multipleStatements: true,
    });
    try {
      const downSql = readFileSync(
        path.join(
          MIGRATIONS_DIR,
          '0035_booking_item_unit_label_snapshot.down.sql',
        ),
        'utf8',
      );
      await expect(connection.query(downSql)).resolves.not.toThrow();

      const [columns] = await connection.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'booking_items'`,
        [MIGRATION_CHECK_DATABASE],
      );
      const columnNames = new Set(
        columns.map((row) => row.column_name ?? row.COLUMN_NAME),
      );
      expect(columnNames.has('unit_label_snapshot')).toBe(false);
      // Pre-existing columns this migration never touched are untouched.
      expect(columnNames.has('bookable_unit_id')).toBe(true);
      expect(columnNames.has('unit_price_amount')).toBe(true);
      expect(columnNames.has('quantity')).toBe(true);

      await connection.query(
        `DELETE FROM schema_migrations WHERE version = '0035'`,
      );
    } finally {
      await connection.end();
    }
    await up(undefined, { databaseName: MIGRATION_CHECK_DATABASE });
  });

  // Listing Lifetime / Renewal, Step B2: same pattern as the 0034/0035
  // proofs above, now for the current most-recent migration. Also proves
  // the specific real bug this migration's own down.sql was written
  // around: `idx_listings_status_id_expires_at` silently became the sole
  // index supporting `fk_listings_status_id` once added (superseding
  // migration 0005's implicit one), so a naive `DROP INDEX` on it alone
  // fails with ER_DROP_INDEX_FK — the down script restores a plain
  // `idx_listings_status_id` index first, in the same statement.
  test('migration 0048 down.sql cleanly reverses the listing publication-lifecycle columns/indexes', async () => {
    const connection = await mysql.createConnection({
      host: config.database.host,
      port: config.database.port,
      database: MIGRATION_CHECK_DATABASE,
      user: config.database.user,
      password: config.database.password,
      multipleStatements: true,
    });
    try {
      const downSql = readFileSync(
        path.join(
          MIGRATIONS_DIR,
          '0048_listing_publication_lifecycle.down.sql',
        ),
        'utf8',
      );
      await expect(connection.query(downSql)).resolves.not.toThrow();

      const [columns] = await connection.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'listings'`,
        [MIGRATION_CHECK_DATABASE],
      );
      const columnNames = new Set(
        columns.map((row) => row.column_name ?? row.COLUMN_NAME),
      );
      expect(columnNames.has('publication_period_days')).toBe(false);
      expect(columnNames.has('expires_at')).toBe(false);
      expect(columnNames.has('expiry_reminder_sent_at')).toBe(false);
      expect(columnNames.has('frozen_at')).toBe(false);
      expect(columnNames.has('purge_after')).toBe(false);
      expect(columnNames.has('renewed_at')).toBe(false);
      // Pre-existing columns this migration never touched are untouched.
      expect(columnNames.has('archived_at')).toBe(true);
      expect(columnNames.has('status_id')).toBe(true);

      const [indexes] = await connection.query(
        `SELECT DISTINCT index_name FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'listings'`,
        [MIGRATION_CHECK_DATABASE],
      );
      const indexNames = new Set(
        indexes.map((row) => row.index_name ?? row.INDEX_NAME),
      );
      expect(indexNames.has('idx_listings_status_id_expires_at')).toBe(false);
      expect(indexNames.has('idx_listings_frozen_at_purge_after')).toBe(false);
      // fk_listings_status_id must still have a supporting index — the
      // very bug this down script exists to avoid re-introducing.
      expect(indexNames.has('idx_listings_status_id')).toBe(true);

      await connection.query(
        `DELETE FROM schema_migrations WHERE version = '0048'`,
      );
    } finally {
      await connection.end();
    }
    await up(undefined, { databaseName: MIGRATION_CHECK_DATABASE });
  });
});
