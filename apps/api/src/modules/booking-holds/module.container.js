/**
 * Booking-Holds module DI container (BACKEND_ARCHITECTURE.md §17).
 *
 * Owns no Repository of its own — `reservation_holds` stays owned by
 * Availability. Takes `availabilityService` as an injected dependency
 * (constructed by `routes/v1.js` after the Availability container), the
 * same cross-module pattern Availability itself uses for `listingService`.
 */

import { BookingHoldsService } from './services/bookingHoldsService.js';
import { createBookingHoldController } from './controllers/bookingHoldController.js';

export default function createBookingHoldsContainer({
  availabilityService,
  eventBus,
}) {
  const bookingHoldsService = new BookingHoldsService({
    availabilityService,
    eventBus,
  });
  const bookingHoldController =
    createBookingHoldController(bookingHoldsService);

  return {
    bookingHoldsService,
    bookingHoldController,
  };
}
