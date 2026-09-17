/**
 * Listing expiration sweep — Listing Lifetime / Renewal, Step B4. Same
 * shape as every other scheduled sweep in this codebase (`advertising/jobs/
 * advertisementLifecycleSweep.js`, `booking-holds/jobs/holdExpirySweep.js`,
 * `bookings/jobs/pendingVendorSlaSweep.js`): `sweepListingExpiry` is the
 * plain, directly-callable, framework-free function integration tests call
 * directly; `registerListingExpirySweepJob` wraps it as a BullMQ repeatable
 * job, registered only from `server.js`.
 *
 * Convenience/STORED-state sync only — never the sole authority on public
 * visibility. Every public-facing listing read (Search, Category, Company
 * profile, TOP hydration, Favorites — see `listingVisibilitySql.js`)
 * independently re-derives "already expired" straight from `expires_at`,
 * so this sweep's only job is to flip the STORED `status_id`/`frozen_at`/
 * `purge_after` (what Partner/Admin actually see) reasonably promptly.
 * Runs hourly: mirrors `advertisementLifecycleSweep.js`'s own cadence
 * choice for the identical reason — there is no benefit to a tighter
 * cadence for a day/month-granularity lifecycle, and it stays well clear
 * of the 15-minute inventory-reconciliation sweep's cadence for an
 * unrelated domain.
 *
 * Step B6 extended `ListingService#runExpirySweep` itself with a T-2-day
 * expiry-reminder phase (see that method's own doc comment for why this
 * stayed one combined sweep rather than a second worker on the same
 * table) — this job file needed no change beyond surfacing the extra
 * `remindersSent` count already returned.
 */

import { Queue, Worker } from 'bullmq';
import { createQueueConnection } from '../../../infrastructure/queue/connection.js';
import { getModuleLogger } from '../../../logging/logger.js';
import { createErrorTracker } from '../../../infrastructure/observability/createErrorTracker.js';

const QUEUE_NAME = 'listings.expiry-sweep';
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const REPEATABLE_JOB_ID = 'listing-expiry-sweep';

const log = getModuleLogger('listings');
const errorTracker = createErrorTracker();

/** @returns {Promise<{frozen: number, remindersSent: number}>} */
export async function sweepListingExpiry(listingService) {
  return listingService.runExpirySweep();
}

/**
 * @param {object} deps
 * @param {import('../services/listingService.js').ListingService} deps.listingService
 * @returns {{queue: Queue, worker: Worker}}
 */
export function registerListingExpirySweepJob({ listingService }) {
  const connection = createQueueConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const { frozen, remindersSent } =
        await sweepListingExpiry(listingService);
      if (frozen > 0 || remindersSent > 0) {
        log.info({ frozen, remindersSent }, 'Listing expiry sweep completed');
      }
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id }, 'Listing expiry sweep run failed');
    errorTracker.captureException(err, { jobName: QUEUE_NAME, jobId: job?.id });
  });

  queue.add(
    'sweep',
    {},
    { repeat: { every: SWEEP_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID },
  );

  return { queue, worker };
}

export default registerListingExpirySweepJob;
