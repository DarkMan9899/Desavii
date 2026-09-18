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
import { EngagementAnalyticsService } from './services/engagementAnalyticsService.js';
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

  return {
    engagementAnalyticsRepository,
    engagementAnalyticsService,
    engagementAnalyticsController,
  };
}
