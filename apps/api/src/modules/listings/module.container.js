/**
 * Listings module DI container (BACKEND_ARCHITECTURE.md §17): constructs
 * this module's own Repository + Service, wiring concrete infrastructure
 * to the core ports/services it depends on. Shared, cross-module
 * singletons (`auditLogger`, `permissionResolver`) are constructed once at
 * the true composition root (`src/app.js`) and passed in here, mirroring
 * `modules/users/module.container.js` exactly.
 */

import { MySqlListingRepository } from './repositories/mysqlListingRepository.js';
import { MySqlListingMetadataRepository } from './repositories/mysqlListingMetadataRepository.js';
import { MySqlRestaurantMenuRepository } from './repositories/mysqlRestaurantMenuRepository.js';
import { MySqlOpeningHoursRepository } from './repositories/mysqlOpeningHoursRepository.js';
import { ListingService } from './services/listingService.js';
import { ListingMetadataService } from './services/listingMetadataService.js';
import { RestaurantMenuService } from './services/restaurantMenuService.js';
import { OpeningHoursService } from './services/openingHoursService.js';
import { createListingController } from './controllers/listingController.js';
import { createRestaurantMenuController } from './controllers/restaurantMenuController.js';
import { createOpeningHoursController } from './controllers/openingHoursController.js';
import { createStorageProvider } from '../../infrastructure/storage/createStorageProvider.js';

export default function createListingsContainer({
  auditLogger,
  permissionResolver,
  eventBus,
}) {
  const listingRepository = new MySqlListingRepository();
  const listingMetadataRepository = new MySqlListingMetadataRepository();
  const restaurantMenuRepository = new MySqlRestaurantMenuRepository();
  const openingHoursRepository = new MySqlOpeningHoursRepository();
  const storageProvider = createStorageProvider();

  const listingService = new ListingService({
    listingRepository,
    listingMetadataRepository,
    storageProvider,
    auditLogger,
    permissionResolver,
    eventBus,
  });
  const listingMetadataService = new ListingMetadataService({
    listingMetadataRepository,
  });
  const restaurantMenuService = new RestaurantMenuService({
    restaurantMenuRepository,
    listingRepository,
    permissionResolver,
  });
  const openingHoursService = new OpeningHoursService({
    openingHoursRepository,
    listingRepository,
    permissionResolver,
  });
  const listingController = createListingController(
    listingService,
    listingMetadataService,
  );
  const restaurantMenuController = createRestaurantMenuController(
    restaurantMenuService,
  );
  const openingHoursController =
    createOpeningHoursController(openingHoursService);

  return {
    listingRepository,
    listingMetadataRepository,
    restaurantMenuRepository,
    openingHoursRepository,
    listingService,
    listingMetadataService,
    restaurantMenuService,
    openingHoursService,
    listingController,
    restaurantMenuController,
    openingHoursController,
  };
}
