/**
 * Seed orchestrator (Sprint 5 §15).
 *
 * Runs every seed module in a fixed, dependency-respecting order inside a
 * single transaction (src/infrastructure/database/transaction.js) — all
 * seed data commits together, or none of it does. Every individual seed
 * module is idempotent (see seeds/helpers.js), so `seedAll()` is safe to
 * run repeatedly against a database that already has this seed data.
 *
 * Usage: node src/infrastructure/database/seeds/index.js
 * (also invoked by `npm run db:seed` and, after a fresh migrate, by
 * `npm run db:reset`.)
 */

import { fileURLToPath } from 'node:url';
import { getMysqlPool, closeMysqlPool } from '../mysqlPool.js';
import { withTransaction } from '../transaction.js';
import { getModuleLogger } from '../../../logging/logger.js';
import config from '../../../config/index.js';
import seedLookups from './001_lookups.js';
import seedReferenceData from './002_reference_data.js';
import seedTaxonomyAndProducts from './003_taxonomy_and_products.js';
import seedRolesAndPermissions from './004_roles_and_permissions.js';
import seedDevAccounts, { DEV_CREDENTIALS } from './005_dev_accounts.js';
import seedSearchFilters from './006_search_filters.js';
import seedPricingAndPolicies from './007_pricing_and_policies.js';
import seedCmsPages from './008_cms_pages.js';
import seedSettingsAndFeatureFlags from './009_settings_and_feature_flags.js';
import seedNotificationLookups from './010_notification_lookups.js';
import seedPaymentLookups from './011_payment_lookups.js';
import seedBlogContent from './012_blog_content.js';

const log = getModuleLogger('infrastructure:seed');

export async function seedAll() {
  const pool = getMysqlPool();
  const accounts = await withTransaction(
    async (connection) => {
      await seedLookups(connection);
      await seedReferenceData(connection);
      await seedTaxonomyAndProducts(connection);
      await seedRolesAndPermissions(connection);
      await seedSearchFilters(connection);
      await seedPricingAndPolicies(connection);
      await seedCmsPages(connection);
      await seedSettingsAndFeatureFlags(connection);
      await seedNotificationLookups(connection);
      await seedPaymentLookups(connection);
      await seedBlogContent(connection);
      return seedDevAccounts(connection);
    },
    { pool },
  );

  log.info({ accounts }, 'Seed data applied');
  log.warn(
    { credentials: DEV_CREDENTIALS },
    'Dev-only credentials seeded — publicly documented, never valid in production',
  );
}

async function main() {
  // Announces the resolved target up front — this never runs during
  // tests (`seedAll` is imported directly by test files, which never
  // trigger this `isMain` block), so it only adds visibility for
  // humans running `db:seed` directly.
  log.info(
    { database: config.database.name, host: config.database.host },
    'db:seed target',
  );
  try {
    await seedAll();
  } finally {
    await closeMysqlPool();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    log.error({ err }, 'Seeding failed');
    process.exitCode = 1;
  });
}

export default seedAll;
