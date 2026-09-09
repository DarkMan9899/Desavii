/**
 * Process entry point.
 *
 * Starts the Express app (src/app.js) and handles graceful shutdown —
 * closing the MySQL pool and Redis connection cleanly on SIGTERM/SIGINT,
 * consistent with BACKEND_ARCHITECTURE.md §59's stateless, horizontally-
 * scaled application-tier model (any instance can be stopped/started
 * without coordination, provided it shuts down cleanly).
 */

import app, { services } from './app.js';
import config from './config/index.js';
import logger from './logging/logger.js';
import { closeMysqlPool } from './infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from './infrastructure/cache/redisClient.js';
import { createErrorTracker } from './infrastructure/observability/createErrorTracker.js';
import { registerHoldExpirySweepJob } from './modules/booking-holds/jobs/holdExpirySweep.js';
import { registerInventoryReconciliationSweepJob } from './modules/availability/jobs/inventoryReconciliationSweep.js';
import { registerPendingVendorSlaSweepJob } from './modules/bookings/jobs/pendingVendorSlaSweep.js';
import { registerNotificationDeliveryWorker } from './modules/notifications/jobs/notificationDeliveryQueue.js';
import { registerLocalProviderSettlementWorker } from './modules/payments/jobs/localProviderSettlementQueue.js';
import { registerAdvertisementLifecycleSweepJob } from './modules/advertising/jobs/advertisementLifecycleSweep.js';

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'desavii-api started');
});

// P0.8 (Master Roadmap): previously no process-level handler existed at
// all — a genuinely uncaught exception outside Express's own request
// cycle (a synchronous throw in a timer callback, a BullMQ worker
// callback that isn't itself wrapped) crashed the process with only a
// raw stack trace on stderr, and an unhandled promise rejection had no
// handler whatsoever. Both now go through the same ErrorTracker every
// other failure path in this app uses, so a real error-tracking
// provider (once one is configured) never has a blind spot here.
// `uncaughtException` still exits after reporting — per Node's own
// guidance, process state after a truly uncaught exception is not
// guaranteed safe to keep serving requests on; `unhandledRejection`
// does not exit (an unhandled rejection is recoverable more often than
// not, and this app predates having one handler at all, so exiting on
// every occurrence would be a behavior change far riskier than logging
// it).
const errorTracker = createErrorTracker();

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — exiting');
  errorTracker.captureException(err, { fatal: true });
  errorTracker
    .flush(2000)
    .catch(() => {})
    .finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err }, 'Unhandled promise rejection');
  errorTracker.captureException(err, { unhandledRejection: true });
});

// Sprint 10: scheduled jobs (BullMQ), registered only here — never in
// app.js — so importing app.js for tests (supertest) never starts a
// Redis-backed worker as a side effect.
const holdExpirySweep = registerHoldExpirySweepJob({
  availabilityService: services.availabilityService,
});
// Phase 17: periodic pull re-sync of every active inventory connection
// (spec §24-27) — reuses the same InventoryConnectionService#syncNow
// code path a partner's "Sync now" button drives.
const inventoryReconciliationSweep = registerInventoryReconciliationSweepJob({
  inventoryConnectionService: services.inventoryConnectionService,
});
const pendingVendorSlaSweep = registerPendingVendorSlaSweepJob({
  bookingService: services.bookingService,
});
// Phase 13: the Queue itself (the producer side `enqueueDelivery` adds
// jobs to) is already constructed in the composition root
// (`modules/notifications/module.container.js`) since HTTP requests
// need to enqueue jobs, not just server.js — only the consumer-side
// Worker is registered here.
const notificationDelivery = registerNotificationDeliveryWorker({
  queue: services.notificationDeliveryQueue,
  notificationDeliveryService: services.notificationDeliveryService,
});
// Phase 16: resolves LocalPaymentProvider's simulated `PROCESSING`
// scenario a few seconds after creation — see
// `modules/payments/jobs/localProviderSettlementQueue.js`'s header.
const localProviderSettlement = registerLocalProviderSettlementWorker({
  paymentService: services.paymentService,
});
// Sprint E: hourly convenience status sync + 7-day/2-day expiry
// reminders (spec §14/§15) — never the sole authority on public
// visibility, see advertisementService.js's own header.
const advertisementLifecycleSweep = registerAdvertisementLifecycleSweepJob({
  advertisementService: services.advertisementService,
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(async () => {
    await Promise.all([
      holdExpirySweep.worker.close(),
      holdExpirySweep.queue.close(),
      inventoryReconciliationSweep.worker.close(),
      inventoryReconciliationSweep.queue.close(),
      pendingVendorSlaSweep.worker.close(),
      pendingVendorSlaSweep.queue.close(),
      notificationDelivery.worker.close(),
      notificationDelivery.queue.close(),
      localProviderSettlement.worker.close(),
      localProviderSettlement.queue.close(),
      advertisementLifecycleSweep.worker.close(),
      advertisementLifecycleSweep.queue.close(),
    ]);
    await closeMysqlPool();
    await closeRedisConnection();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force-exit if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
