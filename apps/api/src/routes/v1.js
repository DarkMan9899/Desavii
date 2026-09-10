/**
 * `/api/v1` router aggregator.
 *
 * Implements BACKEND_ARCHITECTURE.md §49 (API Versioning): URL path
 * versioning, routing versioned by directory rather than runtime
 * feature-flagging — this file is that directory's entry point.
 *
 * Sprint 6: the first modules are wired in. Each module owns its own
 * `module.container.js` (constructs that module's Repositories/Services,
 * §17) and `module.routes.js` (route wiring only, §2) — this file's only
 * job is composing them together with the shared guards/services
 * constructed once in `src/app.js`'s composition root.
 */

import { Router } from 'express';
import createUsersContainer from '../modules/users/module.container.js';
import createUserRoutes from '../modules/users/module.routes.js';
import createAuthContainer from '../modules/auth/module.container.js';
import createAuthRoutes from '../modules/auth/module.routes.js';
import createListingsContainer from '../modules/listings/module.container.js';
import createListingRoutes from '../modules/listings/module.routes.js';
import createSearchContainer from '../modules/search/module.container.js';
import createSearchRoutes from '../modules/search/module.routes.js';
import createAvailabilityContainer from '../modules/availability/module.container.js';
import createAvailabilityRoutes from '../modules/availability/module.routes.js';
import createInventoryConnectionRoutes from '../modules/availability/module.connectionRoutes.js';
import createBookingHoldsContainer from '../modules/booking-holds/module.container.js';
import createBookingHoldRoutes from '../modules/booking-holds/module.routes.js';
import createBookingsContainer from '../modules/bookings/module.container.js';
import createBookingRoutes from '../modules/bookings/module.routes.js';
import createPartnersContainer from '../modules/partners/module.container.js';
import createPartnerRoutes from '../modules/partners/module.routes.js';
import createAdminContainer from '../modules/admin/module.container.js';
import createAdminRoutes from '../modules/admin/module.routes.js';
import createCmsContainer from '../modules/cms/module.container.js';
import createCmsRoutes from '../modules/cms/module.routes.js';
import createReviewsContainer from '../modules/reviews/module.container.js';
import createReviewRoutes from '../modules/reviews/module.routes.js';
import createFavoritesContainer from '../modules/favorites/module.container.js';
import createFavoriteRoutes from '../modules/favorites/module.routes.js';
import createNotificationsContainer from '../modules/notifications/module.container.js';
import createNotificationRoutes from '../modules/notifications/module.routes.js';
import { registerNotificationListeners } from '../modules/notifications/events/notificationListener.js';
import createMessagingContainer from '../modules/messaging/module.container.js';
import createMessagingRoutes from '../modules/messaging/module.routes.js';
import createAiContainer from '../modules/ai/module.container.js';
import createAiRoutes from '../modules/ai/module.routes.js';
import { registerAiListeners } from '../modules/ai/events/aiListener.js';
import createPaymentsContainer from '../modules/payments/module.container.js';
import createPaymentRoutes from '../modules/payments/module.routes.js';
import createAdvertisingContainer from '../modules/advertising/module.container.js';
import createAdvertisingRoutes from '../modules/advertising/module.routes.js';
import createManagersContainer from '../modules/managers/module.container.js';
import createManagerRoutes from '../modules/managers/module.routes.js';
import createContactContainer from '../modules/contact/module.container.js';
import createContactRoutes from '../modules/contact/module.routes.js';
import createBlogContainer from '../modules/blog/module.container.js';
import createBlogRoutes from '../modules/blog/module.routes.js';

export default function createV1Router({
  guards,
  auditLogger,
  permissionResolver,
  eventBus,
}) {
  const router = Router();

  const usersContainer = createUsersContainer({
    auditLogger,
    permissionResolver,
  });
  // Auth depends on Users' public Service interface, never its
  // Repository directly (BACKEND_ARCHITECTURE.md §4's cross-module rule).
  const authContainer = createAuthContainer({
    userService: usersContainer.userService,
    auditLogger,
    permissionResolver,
  });
  const listingsContainer = createListingsContainer({
    auditLogger,
    permissionResolver,
    eventBus,
  });
  const searchContainer = createSearchContainer({ permissionResolver });
  // Sprint E (Promotion Engine): depends on Listings' (`getListingAdminDetail`,
  // listing existence + category membership) and Search's
  // (`getListingsByIds`, public card hydration) public Service
  // interfaces only — never a second Repository over either module's own
  // tables (BACKEND_ARCHITECTURE.md §4).
  const advertisingContainer = createAdvertisingContainer({
    listingService: listingsContainer.listingService,
    searchService: searchContainer.searchService,
    auditLogger,
    eventBus,
  });
  // Availability depends on Listings' public Service interface, never its
  // Repository directly (BACKEND_ARCHITECTURE.md §4's cross-module rule).
  const availabilityContainer = createAvailabilityContainer({
    listingService: listingsContainer.listingService,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  // Phase 5 publish-gating needs "does this listing have >=1 bookable
  // unit" — late-bound (not a constructor dependency) because
  // AvailabilityService already depends on ListingService above; the
  // reverse import would be circular (BACKEND_ARCHITECTURE.md §4).
  listingsContainer.listingService.setBookableUnitChecker((listingId) =>
    availabilityContainer.availabilityService.hasBookableUnit(listingId),
  );
  // Sprint 10: Booking-Holds/Bookings depend on Availability's (and,
  // for Bookings, Listings') public Service interfaces only — never a
  // second Repository over bookable_units/availability_calendar/
  // reservation_holds/listings (BACKEND_ARCHITECTURE.md §4).
  const bookingHoldsContainer = createBookingHoldsContainer({
    availabilityService: availabilityContainer.availabilityService,
  });
  // Moved ahead of Bookings (Partners has no dependency on any other
  // module's Service, so this ordering is free) — Bookings needs
  // Partners' public `getOwnerUserId` to resolve who a customer can
  // message about a booking (Phase 14.9's "message the partner about
  // this booking" entry point).
  // P1.4 (Master Roadmap): also depends on Users' public Service
  // interface (`userService`) — resolving the accepting user's email
  // against an invitation, never a second Repository over `users`
  // (BACKEND_ARCHITECTURE.md §4), same cross-module rule as Auth above.
  const partnersContainer = createPartnersContainer({
    permissionResolver,
    auditLogger,
    eventBus,
    userService: usersContainer.userService,
  });
  // Sprint F (Manager Workspace + Analytics): depends on Partners' and
  // Users' public Service interfaces only (existence/role validation on
  // assignment) — never a second Repository over either module's own
  // tables (BACKEND_ARCHITECTURE.md §4). The actual authorization
  // boundary Managers rely on (ListingService's/BookingService's
  // `isManagerAssignedToPartner` check) lives directly in those two
  // services, not here — this container only wires the Admin-management
  // and Manager-self-service HTTP surface.
  const managersContainer = createManagersContainer({
    partnerService: partnersContainer.partnerService,
    userService: usersContainer.userService,
    permissionResolver,
    auditLogger,
  });
  const bookingsContainer = createBookingsContainer({
    availabilityService: availabilityContainer.availabilityService,
    listingService: listingsContainer.listingService,
    partnerService: partnersContainer.partnerService,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  // Phase 12 (Product Polish): Reviews/Favorites depend on Bookings'/
  // Listings' public Service interfaces only — never a second Repository
  // over `bookings`/`listings` (BACKEND_ARCHITECTURE.md §4).
  const reviewsContainer = createReviewsContainer({
    bookingService: bookingsContainer.bookingService,
    listingService: listingsContainer.listingService,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  const favoritesContainer = createFavoritesContainer({
    listingService: listingsContainer.listingService,
    eventBus,
  });
  // Phase 13 (Notifications): depends on Users' public Service interface
  // only (announcement audience resolution) — never a second Repository
  // over `users` (BACKEND_ARCHITECTURE.md §4).
  const notificationsContainer = createNotificationsContainer({
    userService: usersContainer.userService,
    auditLogger,
  });
  // Phase 14 (Messaging): no dependency on any other module's Service —
  // participants are just user ids, resolved from the request body.
  const messagingContainer = createMessagingContainer({
    permissionResolver,
    auditLogger,
    eventBus,
  });
  // Phase 13 (Notifications): the ONLY place this module subscribes to
  // another module's domain events — business services above publish,
  // they never call `notificationService` directly.
  registerNotificationListeners({
    eventBus,
    notificationService: notificationsContainer.notificationService,
    partnerService: partnersContainer.partnerService,
    conversationService: messagingContainer.conversationService,
    // P1.5 (Master Roadmap): moderator/admin audience resolution for
    // REVIEW_REPORTED — same `usersContainer.userService` every other
    // cross-module listener dependency already reuses.
    userService: usersContainer.userService,
  });
  // Phase 15 (AI Platform): depends on Bookings'/Listings' public Service
  // interfaces only (memory-affinity resolution in aiListener.js) — never
  // a second Repository over `bookings`/`listings`.
  const aiContainer = createAiContainer({
    permissionResolver,
    auditLogger,
    searchService: searchContainer.searchService,
    listingService: listingsContainer.listingService,
    bookingService: bookingsContainer.bookingService,
  });
  // Phase 15: the second place this module subscribes to another
  // module's domain events (after Notifications) — AI is a subscriber
  // only, it never publishes.
  registerAiListeners({
    eventBus,
    aiMemoryService: aiContainer.aiMemoryService,
    bookingService: bookingsContainer.bookingService,
    listingService: listingsContainer.listingService,
  });
  // Phase 16 (Payment Infrastructure): depends on Bookings' public
  // Service interface only (`recordPaymentOutcome`, `getBooking`) — never
  // a second Repository over `bookings`, same cross-module rule every
  // other module above already follows.
  const paymentsContainer = createPaymentsContainer({
    bookingService: bookingsContainer.bookingService,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  // P0.2 (Master Roadmap): the reverse dependency Bookings' own
  // constructor can't take directly, since Payments is constructed AFTER
  // Bookings (it needs bookingService itself, just above) — same
  // "construct both, then wire the late half via a setter" pattern
  // `availability/module.container.js`'s `setAvailabilityService` already
  // establishes for an identical ordering constraint.
  bookingsContainer.bookingService.setPaymentService(
    paymentsContainer.paymentService,
  );
  const adminContainer = createAdminContainer({
    permissionResolver,
    auditLogger,
  });
  const cmsContainer = createCmsContainer({ permissionResolver, auditLogger });
  // Sprint G (public Contact form): no dependency on any other module's
  // Service — a contact inquiry is self-contained.
  const contactContainer = createContactContainer({
    permissionResolver,
    auditLogger,
    eventBus,
  });
  // Sprint H (Blog + Marketing/SMM CMS): depends on Users' public
  // Service interface only (Marketing role assignment, spec §17) —
  // never a second Repository over `users`.
  const blogContainer = createBlogContainer({
    permissionResolver,
    auditLogger,
    userService: usersContainer.userService,
  });

  router.use(
    '/auth',
    createAuthRoutes({ authController: authContainer.authController, guards }),
  );
  router.use(
    '/users',
    createUserRoutes({ userController: usersContainer.userController, guards }),
  );
  router.use(
    '/listings',
    createListingRoutes({
      listingController: listingsContainer.listingController,
      guards,
    }),
  );
  router.use(
    '/search',
    createSearchRoutes({ searchController: searchContainer.searchController }),
  );
  router.use(
    '/availability',
    createAvailabilityRoutes({
      availabilityController: availabilityContainer.availabilityController,
      guards,
    }),
  );
  router.use(
    '/inventory-connections',
    createInventoryConnectionRoutes({
      inventoryConnectionController:
        availabilityContainer.inventoryConnectionController,
      guards,
    }),
  );
  router.use(
    '/booking-holds',
    createBookingHoldRoutes({
      bookingHoldController: bookingHoldsContainer.bookingHoldController,
      guards,
    }),
  );
  router.use(
    '/bookings',
    createBookingRoutes({
      bookingController: bookingsContainer.bookingController,
      guards,
    }),
  );
  router.use(
    '/partners',
    createPartnerRoutes({
      partnerController: partnersContainer.partnerController,
      partnerStaffController: partnersContainer.partnerStaffController,
      guards,
    }),
  );
  router.use(
    '/admin',
    createAdminRoutes({
      adminController: adminContainer.adminController,
      marketplaceConfigController: adminContainer.marketplaceConfigController,
      auditLogController: adminContainer.auditLogController,
      systemHealthController: adminContainer.systemHealthController,
      settingsController: adminContainer.settingsController,
      guards,
    }),
  );
  router.use(
    '/cms',
    createCmsRoutes({ cmsController: cmsContainer.cmsController, guards }),
  );
  router.use(
    '/reviews',
    createReviewRoutes({
      reviewController: reviewsContainer.reviewController,
      guards,
    }),
  );
  router.use(
    '/favorites',
    createFavoriteRoutes({
      favoriteController: favoritesContainer.favoriteController,
      guards,
    }),
  );
  router.use(
    '/notifications',
    createNotificationRoutes({
      notificationController: notificationsContainer.notificationController,
      guards,
    }),
  );
  router.use(
    '/messaging',
    createMessagingRoutes({
      conversationController: messagingContainer.conversationController,
      messageController: messagingContainer.messageController,
      typingController: messagingContainer.typingController,
      guards,
    }),
  );
  router.use(
    '/payments',
    createPaymentRoutes({
      paymentController: paymentsContainer.paymentController,
      ledgerController: paymentsContainer.ledgerController,
      guards,
    }),
  );
  router.use(
    '/advertising',
    createAdvertisingRoutes({
      advertisementController: advertisingContainer.advertisementController,
      guards,
    }),
  );
  router.use(
    '/managers',
    createManagerRoutes({
      managerController: managersContainer.managerController,
      guards,
    }),
  );
  router.use(
    '/contact',
    createContactRoutes({
      contactController: contactContainer.contactController,
      guards,
    }),
  );
  router.use(
    '/blog',
    createBlogRoutes({
      blogController: blogContainer.blogController,
      guards,
    }),
  );
  router.use(
    '/ai',
    createAiRoutes({
      aiMemoryController: aiContainer.aiMemoryController,
      tripPlannerController: aiContainer.tripPlannerController,
      aiSearchController: aiContainer.aiSearchController,
      assistantController: aiContainer.assistantController,
      recommendationController: aiContainer.recommendationController,
      partnerAiController: aiContainer.partnerAiController,
      moderationController: aiContainer.moderationController,
      aiUsageController: aiContainer.aiUsageController,
      guards,
    }),
  );

  return {
    router,
    // Sprint 10: server.js (the composition root's process-entry
    // counterpart) needs these two Service instances to register the
    // hold-expiry/pending-vendor-SLA scheduled jobs — app.js/tests never
    // read this, they only use `router`.
    availabilityService: availabilityContainer.availabilityService,
    // Phase 17: server.js needs this to register the scheduled inventory
    // reconciliation sweep — same "app.js/tests never read this" rule.
    inventoryConnectionService:
      availabilityContainer.inventoryConnectionService,
    bookingService: bookingsContainer.bookingService,
    // Phase 13: server.js needs these to register the notification
    // delivery worker (and close its Queue/Worker on shutdown) — same
    // "app.js/tests never read this" rule as the two above.
    notificationDeliveryService:
      notificationsContainer.notificationDeliveryService,
    notificationDeliveryQueue: notificationsContainer.notificationDeliveryQueue,
    // Phase 16: server.js needs this to register the local-provider
    // settlement worker (and close its Queue/Worker on shutdown) — same
    // "app.js/tests never read this" rule as the others above.
    paymentService: paymentsContainer.paymentService,
    // Sprint E: server.js needs this to register the advertisement
    // lifecycle sweep — same "app.js/tests never read this" rule.
    advertisementService: advertisingContainer.advertisementService,
    // Sprint H: server.js needs this to register the scheduled-publish
    // sweep — same "app.js/tests never read this" rule.
    blogService: blogContainer.blogService,
  };
}
