/**
 * Bookings module DI container (BACKEND_ARCHITECTURE.md §17).
 *
 * Takes `availabilityService`, `listingService`, and `partnerService` as
 * injected dependencies (constructed by `routes/v1.js` after their
 * respective containers) — never a second Repository over
 * `bookable_units`/`availability_calendar`/`reservation_holds`/`listings`/
 * `partners`, the same cross-module rule every other module in this
 * codebase already follows. `partnerService` resolves a booking's
 * partner-owner user id (Phase 14.9's "message the partner" entry point).
 */

import { MySqlBookingRepository } from './repositories/mysqlBookingRepository.js';
import { BookingService } from './services/bookingService.js';
import { createBookingController } from './controllers/bookingController.js';

export default function createBookingsContainer({
  availabilityService,
  listingService,
  partnerService,
  // Pass 8 (Multi-Currency / CBA FX Pricing): the FX module's public
  // Service interface only — never a second Repository over
  // `exchange_rates` (BACKEND_ARCHITECTURE.md §4's cross-module rule).
  exchangeRateService,
  permissionResolver,
  auditLogger,
  eventBus,
}) {
  const bookingRepository = new MySqlBookingRepository();
  const bookingService = new BookingService({
    bookingRepository,
    availabilityService,
    listingService,
    partnerService,
    exchangeRateService,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  const bookingController = createBookingController(bookingService);

  return {
    bookingRepository,
    bookingService,
    bookingController,
  };
}
