/**
 * Blog scheduled-publish sweep — Sprint H (spec §23). Same shape as
 * every other scheduled sweep in this codebase
 * (`advertising/jobs/advertisementLifecycleSweep.js`,
 * `booking-holds/jobs/holdExpirySweep.js`): `sweepScheduledPublish` is
 * the plain, directly-callable, framework-free function integration
 * tests call directly; `registerScheduledPublishSweepJob` wraps it as a
 * BullMQ repeatable job, registered only from `server.js`.
 *
 * Convenience status-flip only — never the sole authority on public
 * visibility. `mysqlBlogRepository.js`'s own visible-post queries
 * already treat a SCHEDULED post as publicly visible once
 * `scheduled_at` has passed, independent of whether this sweep has run
 * yet (spec §23: "public truth should remain safe even if a background
 * job is delayed"). Runs every 5 minutes — tighter than the hourly
 * advertisement-reminder sweep (editorial publish timing matters more
 * than a day-granularity reminder), looser than the 30-second booking-
 * hold sweep (nothing here is contended/time-critical at that scale).
 */

import { Queue, Worker } from 'bullmq';
import { createQueueConnection } from '../../../infrastructure/queue/connection.js';
import { getModuleLogger } from '../../../logging/logger.js';
import { createErrorTracker } from '../../../infrastructure/observability/createErrorTracker.js';

const QUEUE_NAME = 'blog.scheduled-publish-sweep';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const REPEATABLE_JOB_ID = 'blog-scheduled-publish-sweep';

const log = getModuleLogger('blog');
const errorTracker = createErrorTracker();

/** @returns {Promise<{published: number}>} */
export async function sweepScheduledPublish(blogService) {
  return blogService.runScheduledPublishSweep();
}

/**
 * @param {object} deps
 * @param {import('../services/blogService.js').BlogService} deps.blogService
 * @returns {{queue: Queue, worker: Worker}}
 */
export function registerScheduledPublishSweepJob({ blogService }) {
  const connection = createQueueConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await sweepScheduledPublish(blogService);
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    log.error(
      { err, jobId: job?.id },
      'Blog scheduled-publish sweep run failed',
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

export default registerScheduledPublishSweepJob;
