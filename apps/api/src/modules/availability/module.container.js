/**
 * Availability module DI container (BACKEND_ARCHITECTURE.md §17).
 * Constructs one Repository per owned table (`bookable_units`,
 * `availability_calendar`, `blackout_dates`), the two smaller Services
 * that own those tables directly (`BookableUnitService`,
 * `BlackoutService`), and `AvailabilityService`, which composes both
 * plus owns `availability_calendar` itself — mirroring
 * `BACKEND_ARCHITECTURE.md`'s Module Catalog #15 ("Public Services:
 * AvailabilityCheckService, BookableUnitService, BlackoutService").
 *
 * Takes `listingService` as an injected dependency (constructed by
 * `routes/v1.js` after the Listings container, same pattern as Auth
 * receiving Users' `userService`) rather than constructing its own
 * Listings repository — BACKEND_ARCHITECTURE.md §4's cross-module rule.
 */

import { MySqlBookableUnitRepository } from './repositories/mysqlBookableUnitRepository.js';
import { MySqlAvailabilityCalendarRepository } from './repositories/mysqlAvailabilityCalendarRepository.js';
import { MySqlBlackoutRepository } from './repositories/mysqlBlackoutRepository.js';
import { MySqlReservationHoldRepository } from './repositories/mysqlReservationHoldRepository.js';
import { MySqlInventoryLedgerRepository } from './repositories/mysqlInventoryLedgerRepository.js';
import { MySqlInventoryBlockRepository } from './repositories/mysqlInventoryBlockRepository.js';
import { MySqlExternalReservationRepository } from './repositories/mysqlExternalReservationRepository.js';
import { MySqlInventoryConnectionRepository } from './repositories/mysqlInventoryConnectionRepository.js';
import { MySqlHourlyInventoryRepository } from './repositories/mysqlHourlyInventoryRepository.js';
import { BookableUnitService } from './services/bookableUnitService.js';
import { BlackoutService } from './services/blackoutService.js';
import { AvailabilityService } from './services/availabilityService.js';
import { InventoryConnectionService } from './services/inventoryConnectionService.js';
import { createAvailabilityController } from './controllers/availabilityController.js';
import { createInventoryConnectionController } from './controllers/inventoryConnectionController.js';
import { createStorageProvider } from '../../infrastructure/storage/createStorageProvider.js';

export default function createAvailabilityContainer({
  listingService,
  permissionResolver,
  auditLogger,
  eventBus,
}) {
  const bookableUnitRepository = new MySqlBookableUnitRepository();
  const availabilityCalendarRepository =
    new MySqlAvailabilityCalendarRepository();
  const blackoutRepository = new MySqlBlackoutRepository();
  // Sprint 10: reservation_holds — Availability keeps owning this table
  // too, same as its other three (see availabilityService.js's header).
  const reservationHoldRepository = new MySqlReservationHoldRepository();
  // Phase 17: three new tables Availability owns for the same reason.
  const inventoryLedgerRepository = new MySqlInventoryLedgerRepository();
  const inventoryBlockRepository = new MySqlInventoryBlockRepository();
  const externalReservationRepository =
    new MySqlExternalReservationRepository();
  const inventoryConnectionRepository =
    new MySqlInventoryConnectionRepository();
  // Step L6.3B: hourly hotel stays' timed inventory (migration 0054).
  const hourlyInventoryRepository = new MySqlHourlyInventoryRepository();
  // Sprint C-1: room photo uploads — same StorageProvider abstraction the
  // Listings module's own `attachMedia` already uses, its own instance
  // here (cheap to construct, matching that module's own precedent of not
  // sharing one across module containers).
  const storageProvider = createStorageProvider();

  const bookableUnitService = new BookableUnitService({
    bookableUnitRepository,
  });
  const blackoutService = new BlackoutService({ blackoutRepository });
  const availabilityService = new AvailabilityService({
    availabilityCalendarRepository,
    reservationHoldRepository,
    bookableUnitService,
    blackoutService,
    listingService,
    permissionResolver,
    auditLogger,
    inventoryLedgerRepository,
    inventoryBlockRepository,
    externalReservationRepository,
    hourlyInventoryRepository,
    eventBus,
    storageProvider,
  });
  const inventoryConnectionService = new InventoryConnectionService({
    inventoryConnectionRepository,
    bookableUnitService,
    externalReservationRepository,
    listingService,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  // Late-bound to avoid a circular constructor dependency — both
  // Services live in this module and are constructed here together.
  inventoryConnectionService.setAvailabilityService(availabilityService);
  const availabilityController =
    createAvailabilityController(availabilityService);
  const inventoryConnectionController = createInventoryConnectionController(
    inventoryConnectionService,
  );

  return {
    bookableUnitRepository,
    availabilityCalendarRepository,
    blackoutRepository,
    reservationHoldRepository,
    inventoryLedgerRepository,
    inventoryBlockRepository,
    externalReservationRepository,
    inventoryConnectionRepository,
    hourlyInventoryRepository,
    bookableUnitService,
    blackoutService,
    availabilityService,
    inventoryConnectionService,
    availabilityController,
    inventoryConnectionController,
  };
}
