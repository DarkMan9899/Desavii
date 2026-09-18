/**
 * Engagement analytics maintenance sweep — Step A4. Same shape as every
 * other scheduled sweep in this codebase (`advertising/jobs/
 * advertisementLifecycleSweep.js`, `listings/jobs/
 * listingRetentionPurgeSweep.js`): `sweepEngagementAnalyticsMaintenance`
 * is the plain, directly-callable, framework-free function integration
 * tests call directly; `registerEngagementAnalyticsMaintenanceJob` wraps
 * it as a BullMQ repeatable job, registered only from `server.js`.
 *
 * One job, one queue, covering aggregation + both retention purges in
 * their required order (brief §21) — not three separate jobs whose
 * independent schedules could otherwise race a raw purge ahead of the
 * aggregation that still needs that data; `runDailyMaintenance()` itself
 * (see the Service) is what fixes that order, this file only triggers it.
 *
 * Runs daily (brief §17). Every other repeatable job in this codebase
 * uses BullMQ's `repeat: { every }` cadence, never a cron `pattern` —
 * following that same established convention rather than introducing a
 * new scheduling mechanism. Because "every 24h from process start" does
 * not by itself land at a fixed Yerevan wall-clock time, and because
 * `aggregateRecentCompletedDays()` always recomputes the last 3
 * COMPLETED business days (never today's own still-open one) regardless
 * of exactly when in the day it runs, the job is correct at any run
 * time, not just at a specific Yerevan-midnight-adjacent instant — the
 * "00:15 Asia/Yerevan" target the brief suggests is a nice-to-have for
 * freshness, not a correctness requirement this design depends on.
 */

import { Queue, Worker } from 'bullmq';
import { createQueueConnection } from '../../../infrastructure/queue/connection.js';
import { getModuleLogger } from '../../../logging/logger.js';
import { createErrorTracker } from '../../../infrastructure/observability/createErrorTracker.js';

const QUEUE_NAME = 'engagement-analytics.maintenance-sweep';
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REPEATABLE_JOB_ID = 'engagement-analytics-maintenance-sweep';

const log = getModuleLogger('engagementAnalytics');
const errorTracker = createErrorTracker();

/** @returns {Promise<{aggregation: object[], rawPurge: {purged: number}, aggregatePurge: {listing: number, company: number, promotion: number}}>} */
export async function sweepEngagementAnalyticsMaintenance(
  engagementAnalyticsAggregationService,
) {
  return engagementAnalyticsAggregationService.runDailyMaintenance();
}

/**
 * @param {object} deps
 * @param {import('../services/engagementAnalyticsAggregationService.js').EngagementAnalyticsAggregationService} deps.engagementAnalyticsAggregationService
 * @returns {{queue: Queue, worker: Worker}}
 */
export function registerEngagementAnalyticsMaintenanceJob({
  engagementAnalyticsAggregationService,
}) {
  const connection = createQueueConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      // Aggregate counts/day strings only — never query_text, visitor
      // IDs, user IDs, or any raw analytics_events row (brief §25).
      const result = await sweepEngagementAnalyticsMaintenance(
        engagementAnalyticsAggregationService,
      );
      log.info(
        {
          days: result.aggregation.map((r) => r.day),
          rawPurged: result.rawPurge.purged,
          aggregatePurged: result.aggregatePurge,
        },
        'Engagement analytics maintenance sweep completed',
      );
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    log.error(
      { err, jobId: job?.id },
      'Engagement analytics maintenance sweep run failed',
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

export default registerEngagementAnalyticsMaintenanceJob;
