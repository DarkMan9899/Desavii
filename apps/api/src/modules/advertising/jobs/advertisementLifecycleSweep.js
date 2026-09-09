/**
 * Advertisement lifecycle sweep — Sprint E (spec §14/§15). Same shape as
 * every other scheduled sweep in this codebase (`booking-holds/jobs/
 * holdExpirySweep.js`, `bookings/jobs/pendingVendorSlaSweep.js`,
 * `availability/jobs/inventoryReconciliationSweep.js`):
 * `sweepAdvertisementLifecycle` is the plain, directly-callable,
 * framework-free function integration tests call directly;
 * `registerAdvertisementLifecycleSweepJob` wraps it as a BullMQ
 * repeatable job, registered only from `server.js`.
 *
 * Convenience/notification sweep only — never the sole authority on
 * public visibility (see `mysqlAdvertisementRepository.js`'s file
 * header). Runs hourly: reminders are day-granularity thresholds, so
 * there is no benefit to a tighter cadence, and this keeps it well clear
 * of the 15-minute inventory-reconciliation sweep's cadence for an
 * unrelated domain.
 */

import { Queue, Worker } from 'bullmq';
import { createQueueConnection } from '../../../infrastructure/queue/connection.js';
import { getModuleLogger } from '../../../logging/logger.js';
import { createErrorTracker } from '../../../infrastructure/observability/createErrorTracker.js';

const QUEUE_NAME = 'advertising.lifecycle-sweep';
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const REPEATABLE_JOB_ID = 'advertisement-lifecycle-sweep';

const log = getModuleLogger('advertising');
const errorTracker = createErrorTracker();

/** @returns {Promise<{activated:number, expired:number, reminders7d:number, reminders2d:number}>} */
export async function sweepAdvertisementLifecycle(advertisementService) {
  return advertisementService.runLifecycleSweep();
}

/**
 * @param {object} deps
 * @param {import('../services/advertisementService.js').AdvertisementService} deps.advertisementService
 * @returns {{queue: Queue, worker: Worker}}
 */
export function registerAdvertisementLifecycleSweepJob({
  advertisementService,
}) {
  const connection = createQueueConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await sweepAdvertisementLifecycle(advertisementService);
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    log.error(
      { err, jobId: job?.id },
      'Advertisement lifecycle sweep run failed',
    );
    errorTracker.captureException(err, { jobName: QUEUE_NAME, jobId: job?.id });
  });

  queue.add(
    'sweep',
    {},
    { repeat: { every: SWEEP_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID },
  );

  return { queue, worker };
}

export default registerAdvertisementLifecycleSweepJob;
