/**
 * Engagement Analytics module DI container (BACKEND_ARCHITECTURE.md §17).
 *
 * Depends on `listingService`/`partnerService`/`advertisementService`'s
 * public interfaces only, for server-side target resolution — never a
 * second Repository over `listings`/`partners`/`advertisements`
 * (BACKEND_ARCHITECTURE.md §4). Constructed in `routes/v1.js` after the
 * Listings, Partners, and Advertising containers.
 */

import { MySqlEngagementAnalyticsRepository } from './repositories/mysqlEngagementAnalyticsRepository.js';
import { MySqlEngagementAnalyticsAggregationRepository } from './repositories/mysqlEngagementAnalyticsAggregationRepository.js';
import { EngagementAnalyticsService } from './services/engagementAnalyticsService.js';
import { EngagementAnalyticsAggregationService } from './services/engagementAnalyticsAggregationService.js';
import { createEngagementAnalyticsController } from './controllers/engagementAnalyticsController.js';

export default function createEngagementAnalyticsContainer({
  listingService,
  partnerService,
  advertisementService,
}) {
  const engagementAnalyticsRepository =
    new MySqlEngagementAnalyticsRepository();
  const engagementAnalyticsService = new EngagementAnalyticsService({
    engagementAnalyticsRepository,
    listingService,
    partnerService,
    advertisementService,
  });
  const engagementAnalyticsController = createEngagementAnalyticsController(
    engagementAnalyticsService,
  );

  // Step A4: a separate repository/service pair for daily aggregation +
  // retention — reads `analytics_events` and writes the three daily
  // rollup tables directly, never through `listingService`/
  // `partnerService`/`advertisementService` (brief §9: attribution must
  // come from the raw event's own server-resolved `partner_id`, never a
  // fresh ownership re-query at aggregation time).
  const engagementAnalyticsAggregationRepository =
    new MySqlEngagementAnalyticsAggregationRepository();
  const engagementAnalyticsAggregationService =
    new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });

  return {
    engagementAnalyticsRepository,
    engagementAnalyticsService,
    engagementAnalyticsController,
    engagementAnalyticsAggregationRepository,
    engagementAnalyticsAggregationService,
  };
}
