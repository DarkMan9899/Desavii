/**
 * Listing retention-purge sweep — Listing Lifetime / Renewal, Step B7. Same
 * shape as every other scheduled sweep in this codebase (`listingExpirySweep
 * .js`, `advertising/jobs/advertisementLifecycleSweep.js`, `booking-holds/
 * jobs/holdExpirySweep.js`): `sweepListingRetentionPurge` is the plain,
 * directly-callable, framework-free function integration tests call
 * directly; `registerListingRetentionPurgeSweepJob` wraps it as a BullMQ
 * repeatable job, registered only from `server.js`.
 *
 * A deliberately SEPARATE job/queue from `listingExpirySweep.js`, not a
 * third phase folded into that hourly sweep — see `ListingService
 * #runRetentionPurgeSweep`'s own doc comment for why: this runs DAILY, a
 * genuinely different cadence for a genuinely different concern (a listing
 * only ever becomes purge-eligible once, at most every six months).
 *
 * Final marketplace retirement only — the canonical soft-delete
 * (`deleted_at`), never a hard `DELETE FROM listings` and never touching any
 * dependent table. Every public-facing listing read already scopes to
 * `deleted_at IS NULL` by default (`infrastructure/database/softDelete.js`'s
 * `scopeActive`), so this sweep's only job is to flip that one column for a
 * listing that sat frozen past its retention window without being renewed —
 * it is not the sole authority on visibility any more than
 * `listingExpirySweep.js` is (that listing was already excluded from every
 * public surface the moment it froze, long before this sweep ever runs).
 */

import { Queue, Worker } from 'bullmq';
import { createQueueConnection } from '../../../infrastructure/queue/connection.js';
import { getModuleLogger } from '../../../logging/logger.js';
import { createErrorTracker } from '../../../infrastructure/observability/createErrorTracker.js';

const QUEUE_NAME = 'listings.retention-purge-sweep';
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REPEATABLE_JOB_ID = 'listing-retention-purge-sweep';

const log = getModuleLogger('listings');
const errorTracker = createErrorTracker();

/** @returns {Promise<{purged: number}>} */
export async function sweepListingRetentionPurge(listingService) {
  return listingService.runRetentionPurgeSweep();
}

/**
 * @param {object} deps
 * @param {import('../services/listingService.js').ListingService} deps.listingService
 * @returns {{queue: Queue, worker: Worker}}
 */
export function registerListingRetentionPurgeSweepJob({ listingService }) {
  const connection = createQueueConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const { purged } = await sweepListingRetentionPurge(listingService);
      // Aggregate count only — never listing content, never any dependent
      // table's data (brief §33).
      if (purged > 0) {
        log.info({ purged }, 'Listing retention purge sweep completed');
      }
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    log.error(
      { err, jobId: job?.id },
      'Listing retention purge sweep run failed',
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

export default registerListingRetentionPurgeSweepJob;
