/**
 * Advertising module DI container (BACKEND_ARCHITECTURE.md §17).
 *
 * Depends on `listingService` (validate a listing exists/its category
 * memberships) and `searchService` (hydrate promoted listing ids into
 * public card data) — both public Service interfaces, never a second
 * Repository over their tables (§4's cross-module rule).
 */

import { MySqlAdvertisementRepository } from './repositories/mysqlAdvertisementRepository.js';
import { AdvertisementService } from './services/advertisementService.js';
import { createAdvertisementController } from './controllers/advertisementController.js';

export default function createAdvertisingContainer({
  listingService,
  searchService,
  auditLogger,
  eventBus,
}) {
  const advertisementRepository = new MySqlAdvertisementRepository();
  const advertisementService = new AdvertisementService({
    advertisementRepository,
    listingService,
    searchService,
    auditLogger,
    eventBus,
  });
  const advertisementController =
    createAdvertisementController(advertisementService);

  return {
    advertisementRepository,
    advertisementService,
    advertisementController,
  };
}
