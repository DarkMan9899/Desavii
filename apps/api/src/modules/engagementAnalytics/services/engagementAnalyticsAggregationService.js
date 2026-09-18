/**
 * EngagementAnalyticsAggregationService — Step A4 (Daily Aggregation +
 * Retention). The ONLY entry point the daily maintenance job calls;
 * every date/timezone decision lives here, never in the job file itself
 * (`jobs/engagementAnalyticsMaintenance.js` stays a thin BullMQ wrapper,
 * matching every other sweep in this codebase).
 *
 * Deliberately separate from `EngagementAnalyticsService` (A2 ingestion
 * + server-event recording) — a different caller (a scheduled job, never
 * an HTTP request), a different repository (aggregation reads/writes,
 * never `analytics_events` INSERT), and a different failure posture
 * (background maintenance must never surface to a live request).
 *
 * No Partner read API, no dashboard, no chart data, no CTR — A5's scope
 * (brief §31/§40).
 */

import { InternalError } from '../../../errors/AppError.js';
import { getModuleLogger } from '../../../logging/logger.js';
import { ENGAGEMENT_RETENTION } from '../constants/engagementAnalyticsConstants.js';

const log = getModuleLogger('engagementAnalytics');

/** Recompute the 3 most recently completed Yerevan business days on every run (brief §16) — ordinary scheduler jitter, a missed run, or a retry all self-heal because aggregation is idempotent, with no separate watermark table. */
const RECENT_DAYS_TO_RECOMPUTE = 3;

export class EngagementAnalyticsAggregationService {
  #aggregationRepository;

  constructor({ engagementAnalyticsAggregationRepository }) {
    this.#aggregationRepository = engagementAnalyticsAggregationRepository;
  }

  /** Today's Asia/Yerevan business date — never itself aggregated (brief §15). */
  async getCurrentBusinessDate() {
    return this.#aggregationRepository.getCurrentBusinessDate();
  }

  /**
   * Idempotent full recompute of all three daily tables for one business
   * date (`YYYY-MM-DD`). Safe to call any number of times for the same
   * day (brief §7) and safe to call for any historical day still within
   * raw retention (backfill/manual reprocessing, brief §16).
   *
   * Fails safely (brief §9/§26) rather than writing a guessed value: if
   * any listing or promotion has more than one distinct server-resolved
   * `partner_id` among the day's raw events (a data-integrity fault, not
   * an expected condition), this throws BEFORE writing anything for that
   * table, and reports exactly which entities conflicted. `listing`,
   * `company`, and `promotion` are independent statements, never one
   * shared transaction (brief §26) — a promotion-table failure never
   * rolls back an already-committed listing/company upsert for the same
   * run, and the next run safely recomputes everything again either way.
   *
   * @param {string} day - `YYYY-MM-DD` Asia/Yerevan business date.
   */
  async aggregateDay(day) {
    const [listingConflicts, promotionConflicts] = await Promise.all([
      this.#aggregationRepository.findListingPartnerIdConflicts({ day }),
      this.#aggregationRepository.findPromotionPartnerIdConflicts({ day }),
    ]);
    if (listingConflicts.length > 0) {
      throw new InternalError(
        `Engagement analytics aggregation aborted for ${day}: ` +
          `${listingConflicts.length} listing(s) have conflicting server-resolved partner_id values in analytics_events (listing_id: ${listingConflicts.map((c) => c.listingId).join(', ')}).`,
      );
    }
    if (promotionConflicts.length > 0) {
      throw new InternalError(
        `Engagement analytics aggregation aborted for ${day}: ` +
          `${promotionConflicts.length} promotion(s) have conflicting server-resolved partner_id values in analytics_events (promotion_id: ${promotionConflicts.map((c) => c.promotionId).join(', ')}).`,
      );
    }

    const listingRowsAffected =
      await this.#aggregationRepository.upsertListingDaily({ day });
    const companyRowsAffected =
      await this.#aggregationRepository.upsertCompanyDaily({ day });
    const promotionRowsAffected =
      await this.#aggregationRepository.upsertPromotionDaily({ day });

    return {
      day,
      listingRowsAffected,
      companyRowsAffected,
      promotionRowsAffected,
    };
  }

  /**
   * The daily job's primary aggregation step (brief §16): recomputes the
   * 3 most recently COMPLETED Yerevan business days, oldest→newest, so a
   * single missed scheduled run, host downtime, or scheduler jitter
   * never permanently loses a day — the next run's own 3-day window
   * covers it, and recomputation is a pure overwrite (brief §7), never
   * an increment.
   */
  async aggregateRecentCompletedDays() {
    const days =
      await this.#aggregationRepository.getRecentCompletedBusinessDates(
        RECENT_DAYS_TO_RECOMPUTE,
      );
    const results = [];
    for (const day of [...days].reverse()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design: oldest day first, deliberately never parallelized across days
      results.push(await this.aggregateDay(day));
    }
    return results;
  }

  /**
   * Raw-event retention purge (brief §18/§19/§22/§23) — independent of
   * `ANALYTICS_COLLECTION_ENABLED` (brief §39): turning event COLLECTION
   * off must never stop this privacy-retention cleanup of already-stored
   * events. See the repository method's own header for the exact
   * business-day-aligned boundary this uses instead of a naive
   * `now - 90*24h` instant cutoff.
   */
  async purgeRawEvents() {
    const purged =
      await this.#aggregationRepository.purgeRawEventsOlderThanRetentionWindow({
        windowDays: ENGAGEMENT_RETENTION.RAW_EVENT_RETENTION_DAYS,
      });
    if (purged > 0) {
      log.info({ purged }, 'Engagement analytics raw event purge completed');
    }
    return { purged };
  }

  /** Daily-aggregate retention purge (brief §20), applied to all three tables independently. */
  async purgeAggregates() {
    const result =
      await this.#aggregationRepository.purgeAggregatesOlderThanRetentionWindow(
        {
          retentionMonths:
            ENGAGEMENT_RETENTION.DAILY_AGGREGATE_RETENTION_MONTHS,
        },
      );
    const total = result.listing + result.company + result.promotion;
    if (total > 0) {
      log.info(
        result,
        'Engagement analytics aggregate retention purge completed',
      );
    }
    return result;
  }

  /**
   * The full daily maintenance orchestration the job calls (brief §21):
   * aggregate the recent completed days FIRST, then purge raw events,
   * then purge aggregates — so raw retention can never remove a day's
   * source facts before that day's own aggregate has been computed from
   * them. Each step stays independently callable/testable above; this
   * is only their fixed ordering.
   */
  async runDailyMaintenance() {
    const aggregation = await this.aggregateRecentCompletedDays();
    const rawPurge = await this.purgeRawEvents();
    const aggregatePurge = await this.purgeAggregates();
    return { aggregation, rawPurge, aggregatePurge };
  }
}

export default EngagementAnalyticsAggregationService;
