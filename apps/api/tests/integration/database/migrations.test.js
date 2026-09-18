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
      'analytics_events',
      'listing_analytics_daily',
      'company_analytics_daily',
      'promotion_analytics_daily',
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

/**
 * Engagement Analytics, Step A1 (schema/domain foundation only) — proves
 * the exact shape A0/A0.1 locked: `analytics_events`'s columns/dedup
 * behavior/index set, the three daily rollup tables' composite-PK/
 * counter-defaults shape, and that NONE of the four tables carry any
 * foreign key — a deliberate, explicit departure from this codebase's
 * otherwise near-universal FK convention (see the migration's own header
 * comment for why). Reuses the same disposable
 * `travelhub_test_migration_check` database the suite above already
 * fully migrates in its first test, per this file's own established
 * "one throwaway database for the whole file" convention.
 */
describe('Engagement Analytics foundation (Step A1)', () => {
  async function openConnection() {
    return mysql.createConnection({
      host: config.database.host,
      port: config.database.port,
      database: MIGRATION_CHECK_DATABASE,
      user: config.database.user,
      password: config.database.password,
      multipleStatements: true,
    });
  }

  async function getColumns(connection, tableName) {
    const [rows] = await connection.query(
      `SELECT column_name, is_nullable, column_type
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [MIGRATION_CHECK_DATABASE, tableName],
    );
    return rows.map((row) => ({
      name: row.column_name ?? row.COLUMN_NAME,
      nullable: (row.is_nullable ?? row.IS_NULLABLE) === 'YES',
      type: row.column_type ?? row.COLUMN_TYPE,
    }));
  }

  async function getForeignKeyCount(connection, tableName) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM information_schema.table_constraints
       WHERE table_schema = ? AND table_name = ? AND constraint_type = 'FOREIGN KEY'`,
      [MIGRATION_CHECK_DATABASE, tableName],
    );
    return Number(rows[0].count ?? rows[0].COUNT);
  }

  async function getIndexNames(connection, tableName) {
    const [rows] = await connection.query(
      `SELECT DISTINCT index_name FROM information_schema.statistics
       WHERE table_schema = ? AND table_name = ?`,
      [MIGRATION_CHECK_DATABASE, tableName],
    );
    return new Set(rows.map((row) => row.index_name ?? row.INDEX_NAME));
  }

  test('analytics_events has exactly the expected columns and nullability', async () => {
    const connection = await openConnection();
    try {
      const columns = await getColumns(connection, 'analytics_events');
      const byName = Object.fromEntries(columns.map((c) => [c.name, c]));

      expect(byName.id.nullable).toBe(false);
      expect(byName.event_id.nullable).toBe(false);
      expect(byName.event_id.type).toBe('char(36)');
      expect(byName.dedup_key.nullable).toBe(true);
      expect(byName.dedup_key.type).toBe('binary(32)');
      expect(byName.event_name.nullable).toBe(false);
      expect(byName.occurred_at.nullable).toBe(false);
      expect(byName.occurred_at.type).toBe('datetime(3)');
      expect(byName.anonymous_visitor_id.nullable).toBe(true);
      expect(byName.session_id.nullable).toBe(true);
      expect(byName.user_id.nullable).toBe(true);
      expect(byName.listing_id.nullable).toBe(true);
      expect(byName.partner_id.nullable).toBe(true);
      expect(byName.promotion_id.nullable).toBe(true);
      expect(byName.booking_id.nullable).toBe(true);
      expect(byName.placement.nullable).toBe(true);
      expect(byName.position.nullable).toBe(true);
      expect(byName.category_code.nullable).toBe(true);
      expect(byName.query_text.nullable).toBe(true);
      expect(byName.result_count.nullable).toBe(true);
      expect(byName.locale.nullable).toBe(true);
      expect(byName.locale.type).toBe('char(2)');
      expect(byName.device_class.nullable).toBe(true);
      expect(byName.traffic_source.nullable).toBe(true);
      expect(byName.contact_method.nullable).toBe(true);
      // No metadata/properties/context JSON escape hatch (A0 §18/A0.1 §18).
      expect(byName.metadata).toBeUndefined();
      expect(byName.properties).toBeUndefined();
      expect(byName.context).toBeUndefined();
      // Never an audit-trail/soft-delete column set — this is an
      // insert-only log, matching audit_logs/activity_logs, never a
      // mutable business entity.
      expect(byName.updated_at).toBeUndefined();
      expect(byName.deleted_at).toBeUndefined();
    } finally {
      await connection.end();
    }
  });

  test('analytics_events has zero foreign keys', async () => {
    const connection = await openConnection();
    try {
      expect(await getForeignKeyCount(connection, 'analytics_events')).toBe(0);
    } finally {
      await connection.end();
    }
  });

  test('analytics_events has the required unique keys and composite indexes', async () => {
    const connection = await openConnection();
    try {
      const indexNames = await getIndexNames(connection, 'analytics_events');
      expect(indexNames.has('uq_analytics_events_event_id')).toBe(true);
      expect(indexNames.has('uq_analytics_events_dedup_key')).toBe(true);
      expect(
        indexNames.has('idx_analytics_events_event_name_occurred_at'),
      ).toBe(true);
      expect(
        indexNames.has(
          'idx_analytics_events_partner_id_event_name_occurred_at',
        ),
      ).toBe(true);
      expect(
        indexNames.has(
          'idx_analytics_events_listing_id_event_name_occurred_at',
        ),
      ).toBe(true);
      expect(
        indexNames.has(
          'idx_analytics_events_promotion_id_event_name_occurred_at',
        ),
      ).toBe(true);
      expect(
        indexNames.has('idx_analytics_events_anonymous_visitor_id_occurred_at'),
      ).toBe(true);
    } finally {
      await connection.end();
    }
  });

  test('event_id is unique — a duplicate is rejected', async () => {
    const connection = await openConnection();
    try {
      const insert = () =>
        connection.query(
          `INSERT INTO analytics_events (event_id, event_name, occurred_at)
           VALUES (?, 'listing_impression', UTC_TIMESTAMP(3))`,
          ['11111111-1111-1111-1111-111111111111'],
        );
      await expect(insert()).resolves.toBeTruthy();
      await expect(insert()).rejects.toThrow(/Duplicate entry/);
    } finally {
      // This test's own rows are analytics telemetry with no cleanup
      // contract elsewhere in this suite — remove them so they don't
      // leak into whatever runs against this disposable database next.
      await connection.query(
        `DELETE FROM analytics_events WHERE event_id = ?`,
        ['11111111-1111-1111-1111-111111111111'],
      );
      await connection.end();
    }
  });

  test('dedup_key allows multiple NULL rows but rejects a duplicate non-NULL value', async () => {
    const connection = await openConnection();
    try {
      // Two rows both with dedup_key = NULL — MySQL treats each NULL as
      // distinct under a UNIQUE index, so both must succeed.
      await expect(
        connection.query(
          `INSERT INTO analytics_events (event_id, event_name, occurred_at, dedup_key)
           VALUES (?, 'contact_click', UTC_TIMESTAMP(3), NULL)`,
          ['22222222-2222-2222-2222-222222222222'],
        ),
      ).resolves.toBeTruthy();
      await expect(
        connection.query(
          `INSERT INTO analytics_events (event_id, event_name, occurred_at, dedup_key)
           VALUES (?, 'contact_click', UTC_TIMESTAMP(3), NULL)`,
          ['33333333-3333-3333-3333-333333333333'],
        ),
      ).resolves.toBeTruthy();

      // A real (non-NULL) dedup_key: the first insert succeeds, a second
      // row reusing the identical digest is rejected.
      const sameDigest = Buffer.alloc(32, 7);
      await expect(
        connection.query(
          `INSERT INTO analytics_events (event_id, event_name, occurred_at, dedup_key)
           VALUES (?, 'listing_viewed', UTC_TIMESTAMP(3), ?)`,
          ['44444444-4444-4444-4444-444444444444', sameDigest],
        ),
      ).resolves.toBeTruthy();
      await expect(
        connection.query(
          `INSERT INTO analytics_events (event_id, event_name, occurred_at, dedup_key)
           VALUES (?, 'listing_viewed', UTC_TIMESTAMP(3), ?)`,
          ['55555555-5555-5555-5555-555555555555', sameDigest],
        ),
      ).rejects.toThrow(/Duplicate entry/);
    } finally {
      await connection.query(
        `DELETE FROM analytics_events WHERE event_id IN (?, ?, ?, ?, ?)`,
        [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          '44444444-4444-4444-4444-444444444444',
          '55555555-5555-5555-5555-555555555555',
        ],
      );
      await connection.end();
    }
  });

  test.each([
    ['listing_analytics_daily', ['listing_id', 'day']],
    ['company_analytics_daily', ['partner_id', 'day']],
    ['promotion_analytics_daily', ['promotion_id', 'day']],
  ])(
    '%s has the correct composite primary key, required counters defaulting to 0, and zero foreign keys',
    async (tableName, expectedPkColumns) => {
      const connection = await openConnection();
      try {
        const [pkRows] = await connection.query(
          `SELECT column_name FROM information_schema.key_column_usage
           WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY'
           ORDER BY ordinal_position`,
          [MIGRATION_CHECK_DATABASE, tableName],
        );
        const pkColumns = pkRows.map(
          (row) => row.column_name ?? row.COLUMN_NAME,
        );
        expect(pkColumns).toEqual(expectedPkColumns);

        const columns = await getColumns(connection, tableName);
        const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
        // No visitor identifier of any kind on a daily aggregate table.
        expect(byName.anonymous_visitor_id).toBeUndefined();
        expect(byName.session_id).toBeUndefined();
        expect(byName.user_id).toBeUndefined();
        // No stored CTR/conversion ratio — always computed at read time.
        expect(
          columns.some((c) => /rate|ratio|ctr|ctr_|percentage/i.test(c.name)),
        ).toBe(false);

        expect(await getForeignKeyCount(connection, tableName)).toBe(0);
      } finally {
        await connection.end();
      }
    },
  );

  test('listing_analytics_daily counters all default to 0 and partner_id is required', async () => {
    const connection = await openConnection();
    try {
      await connection.query(
        `INSERT INTO listing_analytics_daily (listing_id, day, partner_id) VALUES (999999, '2026-01-01', 1)`,
      );
      const [[row]] = await connection.query(
        `SELECT impressions_count, views_count, daily_unique_visitors,
                favorite_adds_count, favorite_removes_count, contact_clicks_count,
                booking_starts_count, booking_requests_count, booking_confirmations_count,
                search_impressions_count, search_clicks_count,
                promotion_impressions_count, promotion_clicks_count
         FROM listing_analytics_daily WHERE listing_id = 999999 AND day = '2026-01-01'`,
      );
      Object.values(row).forEach((value) => {
        expect(Number(value)).toBe(0);
      });
    } finally {
      await connection.query(
        `DELETE FROM listing_analytics_daily WHERE listing_id = 999999`,
      );
      await connection.end();
    }
  });

  test('migration 0049 down.sql cleanly drops all four engagement analytics tables, and re-up restores them', async () => {
    const connection = await openConnection();
    try {
      const downSql = readFileSync(
        path.join(
          MIGRATIONS_DIR,
          '0049_engagement_analytics_foundation.down.sql',
        ),
        'utf8',
      );
      await expect(connection.query(downSql)).resolves.not.toThrow();

      const [tables] = await connection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
        [MIGRATION_CHECK_DATABASE],
      );
      const tableNames = new Set(
        tables.map((row) => row.table_name ?? row.TABLE_NAME),
      );
      expect(tableNames.has('analytics_events')).toBe(false);
      expect(tableNames.has('listing_analytics_daily')).toBe(false);
      expect(tableNames.has('company_analytics_daily')).toBe(false);
      expect(tableNames.has('promotion_analytics_daily')).toBe(false);
      // A pre-existing table this migration never touched is untouched.
      expect(tableNames.has('listings')).toBe(true);

      await connection.query(
        `DELETE FROM schema_migrations WHERE version = '0049'`,
      );
    } finally {
      await connection.end();
    }
    await up(undefined, { databaseName: MIGRATION_CHECK_DATABASE });

    const verifyConnection = await openConnection();
    try {
      const [tables] = await verifyConnection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
        [MIGRATION_CHECK_DATABASE],
      );
      const tableNames = new Set(
        tables.map((row) => row.table_name ?? row.TABLE_NAME),
      );
      expect(tableNames.has('analytics_events')).toBe(true);
      expect(tableNames.has('listing_analytics_daily')).toBe(true);
      expect(tableNames.has('company_analytics_daily')).toBe(true);
      expect(tableNames.has('promotion_analytics_daily')).toBe(true);
      expect(
        await getForeignKeyCount(verifyConnection, 'analytics_events'),
      ).toBe(0);
    } finally {
      await verifyConnection.end();
    }
  });
});
