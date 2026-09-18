/**
 * EngagementAnalyticsListener — Step A2. Registers this module's
 * `DomainEventBus` subscriptions — the ONLY place `engagementAnalytics`
 * reacts to another module's events (mirroring `notificationListener
 * .js`'s own established rule; business Services never call
 * `engagementAnalyticsService` directly).
 *
 * Translates FROM the internal, dot-separated, past-tense `EVENT_TYPES`
 * vocabulary TO the external, snake_case `ANALYTICS_EVENTS` vocabulary —
 * the two are never merged/aliased. Every handler here only reads
 * `event.payload` fields the publishing Service already put there at
 * publish time — never a fresh repository read of its own.
 *
 * `vendor_registered`/`listing_created` are deliberately NOT subscribed
 * here — A2 leaves both reserved/unwired (per the brief's own "do not
 * broaden scope" instruction).
 */

import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import { ANALYTICS_EVENTS } from '../constants/engagementAnalyticsConstants.js';

export function registerEngagementAnalyticsListeners({
  eventBus,
  engagementAnalyticsService,
}) {
  eventBus.subscribe(EVENT_TYPES.FAVORITE_ADDED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.FAVORITE_ADDED,
      userId: event.actorId,
      listingId: event.payload.listingId,
      partnerId: event.payload.partnerId,
    }),
  );

  eventBus.subscribe(EVENT_TYPES.FAVORITE_REMOVED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.FAVORITE_REMOVED,
      userId: event.actorId,
      listingId: event.payload.listingId,
      partnerId: event.payload.partnerId,
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_HOLD_CREATED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.BOOKING_STARTED,
      userId: event.actorId,
      listingId: event.payload.listingId,
      partnerId: event.payload.partnerId,
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_CREATED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.BOOKING_REQUEST_SUBMITTED,
      userId: event.payload.customerUserId,
      listingId: event.payload.listingId,
      partnerId: event.payload.partnerId,
      bookingId: event.resourceId,
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_CONFIRMED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.BOOKING_CONFIRMED,
      userId: event.payload.customerUserId,
      partnerId: event.payload.partnerId,
      bookingId: event.resourceId,
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_REJECTED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.BOOKING_REJECTED,
      userId: event.payload.customerUserId,
      partnerId: event.payload.partnerId,
      bookingId: event.resourceId,
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_CANCELLED, (event) =>
    engagementAnalyticsService.recordServerEvent({
      eventName: ANALYTICS_EVENTS.BOOKING_CANCELLED,
      userId: event.payload.customerUserId,
      partnerId: event.payload.partnerId,
      bookingId: event.resourceId,
    }),
  );
}

export default registerEngagementAnalyticsListeners;
