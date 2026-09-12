/**
 * Seeds every fixed-vocabulary lookup table, including ones whose table
 * was added by a much later migration (e.g. `advertisement_statuses`,
 * `contact_inquiry_types`/`contact_inquiry_statuses`) — this file is
 * where lookup rows live regardless of which migration created the
 * table. These are not optional/example data — the schema has no
 * native ENUMs (DATABASE_ARCHITECTURE.md §1), so the platform cannot
 * function until these rows exist (e.g. nothing can be booked until
 * `booking_statuses` has a "DRAFT" row to reference).
 */

import { upsertByCode } from './helpers.js';

export default async function seedLookups(connection) {
  await upsertByCode(connection, 'user_statuses', [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'SUSPENDED', name: 'Suspended' },
    { code: 'BANNED', name: 'Banned' },
    { code: 'PENDING_DELETION', name: 'Pending Deletion' },
  ]);

  await upsertByCode(connection, 'moderation_statuses', [
    { code: 'PENDING', name: 'Pending' },
    { code: 'APPROVED', name: 'Approved' },
    { code: 'REJECTED', name: 'Rejected' },
    { code: 'FLAGGED', name: 'Flagged' },
    // P1.2 (Master Roadmap): partner self-service onboarding reuses this
    // one shared lookup rather than a second near-identical table (same
    // "one lookup instead of four" rule migration 0003's own header
    // comment already establishes) — these two codes are only ever valid
    // for partners.verification_status_id, never moderation_status_id
    // (partnerService.js's own VERIFICATION_STATUSES/MODERATION_STATUSES
    // arrays enforce that scoping at the application layer).
    { code: 'DRAFT', name: 'Draft' },
    { code: 'NEEDS_CHANGES', name: 'Needs Changes' },
  ]);

  await upsertByCode(connection, 'partner_employee_roles', [
    { code: 'OWNER', name: 'Owner' },
    { code: 'MANAGER', name: 'Manager' },
    { code: 'EDITOR', name: 'Editor' },
    { code: 'BOOKING_MANAGER', name: 'Booking Manager' },
    { code: 'ANALYTICS_VIEWER', name: 'Analytics Viewer' },
  ]);

  await upsertByCode(connection, 'listing_statuses', [
    { code: 'DRAFT', name: 'Draft' },
    { code: 'PENDING_REVIEW', name: 'Pending Review' },
    { code: 'PUBLISHED', name: 'Published' },
    { code: 'UNPUBLISHED', name: 'Unpublished' },
    { code: 'ARCHIVED', name: 'Archived' },
  ]);

  await upsertByCode(connection, 'listing_types', [
    { code: 'HOTEL', name: 'Hotel' },
    { code: 'PROPERTY', name: 'Property' },
    { code: 'RESTAURANT', name: 'Restaurant' },
    { code: 'TOUR', name: 'Tour' },
    { code: 'CAR_RENTAL', name: 'Car Rental' },
    { code: 'ATTRACTION', name: 'Attraction' },
  ]);

  await upsertByCode(connection, 'media_types', [
    { code: 'IMAGE', name: 'Image' },
    { code: 'VIDEO', name: 'Video' },
    { code: 'DOCUMENT', name: 'Document' },
  ]);

  await upsertByCode(connection, 'media_upload_statuses', [
    { code: 'PENDING', name: 'Pending' },
    { code: 'UPLOADING', name: 'Uploading' },
    { code: 'COMPLETED', name: 'Completed' },
    { code: 'FAILED', name: 'Failed' },
  ]);

  await upsertByCode(connection, 'bookable_unit_types', [
    { code: 'HOTEL_ROOM', name: 'Hotel Room' },
    { code: 'PROPERTY_UNIT', name: 'Property Unit' },
    { code: 'RESTAURANT_TABLE', name: 'Restaurant Table' },
    { code: 'TOUR_DEPARTURE', name: 'Tour Departure' },
    { code: 'VEHICLE', name: 'Vehicle' },
  ]);

  await upsertByCode(connection, 'availability_statuses', [
    { code: 'AVAILABLE', name: 'Available' },
    { code: 'BOOKED', name: 'Booked' },
    { code: 'BLOCKED', name: 'Blocked' },
    { code: 'HELD', name: 'Held' },
  ]);

  await upsertByCode(connection, 'booking_types', [
    { code: 'HOTEL_ROOM_BOOKING', name: 'Hotel Room Booking' },
    { code: 'PROPERTY_BOOKING', name: 'Property Booking' },
    { code: 'RESTAURANT_RESERVATION', name: 'Restaurant Reservation' },
    { code: 'TOUR_BOOKING', name: 'Tour Booking' },
    { code: 'CAR_RENTAL_BOOKING', name: 'Car Rental Booking' },
  ]);

  // MVP, no-payment-gateway vocabulary (Sprint 5 §9) — see migration
  // 0008's header comment for the amendment rationale.
  await upsertByCode(connection, 'booking_statuses', [
    { code: 'DRAFT', name: 'Draft' },
    { code: 'PENDING_VENDOR', name: 'Pending Vendor' },
    { code: 'CONFIRMED', name: 'Confirmed' },
    { code: 'REJECTED', name: 'Rejected' },
    { code: 'CANCELLED_BY_CUSTOMER', name: 'Cancelled by Customer' },
    { code: 'CANCELLED_BY_VENDOR', name: 'Cancelled by Vendor' },
    { code: 'COMPLETED', name: 'Completed' },
    { code: 'NO_SHOW', name: 'No Show' },
    { code: 'EXPIRED', name: 'Expired' },
  ]);

  await upsertByCode(connection, 'payment_statuses', [
    { code: 'NOT_REQUIRED_ON_PLATFORM', name: 'Not Required on Platform' },
    { code: 'PAY_AT_PROPERTY', name: 'Pay at Property' },
    { code: 'PAID_OFFLINE', name: 'Paid Offline' },
    { code: 'REFUNDED_OFFLINE', name: 'Refunded Offline' },
  ]);

  await upsertByCode(
    connection,
    'ad_placement_types',
    [
      { code: 'HOMEPAGE_HERO', name: 'Homepage Hero', max_concurrent_slots: 3 },
      {
        code: 'HOMEPAGE_SECTION',
        name: 'Homepage Section',
        max_concurrent_slots: 6,
      },
      { code: 'CATEGORY_TOP', name: 'Category Top', max_concurrent_slots: 3 },
      { code: 'CITY_TOP', name: 'City Top', max_concurrent_slots: 3 },
      {
        code: 'SEARCH_SPONSORED',
        name: 'Search Sponsored',
        max_concurrent_slots: 5,
      },
      {
        code: 'LISTING_BADGE',
        name: 'Listing Badge',
        max_concurrent_slots: null,
      },
      { code: 'BANNER', name: 'Banner', max_concurrent_slots: 4 },
    ],
    { extraColumns: ['max_concurrent_slots'] },
  );

  await upsertByCode(connection, 'advertisement_statuses', [
    { code: 'REQUEST_SUBMITTED', name: 'Request Submitted' },
    { code: 'AWAITING_OFFLINE_PAYMENT', name: 'Awaiting Offline Payment' },
    { code: 'PAID_MANUAL', name: 'Manually Marked Paid' },
    { code: 'APPROVED', name: 'Approved' },
    { code: 'SCHEDULED', name: 'Scheduled' },
    { code: 'ACTIVE', name: 'Active' },
    { code: 'EXPIRED', name: 'Expired' },
    { code: 'REJECTED', name: 'Rejected' },
    { code: 'CANCELLED', name: 'Cancelled' },
    // Pass 7B (brief §13/§14): a reversible admin-toggled "temporarily
    // off" state, distinct from CANCELLED (terminal, never reactivated).
    // Never in `VISIBLE_STATUS_CODES` (mysqlAdvertisementRepository.js),
    // so a paused promotion disappears from every public placement the
    // instant it's set, and reappears exactly where it left off on resume.
    { code: 'PAUSED', name: 'Paused' },
  ]);

  // P1.5 (Master Roadmap) — a customer's reason for reporting a review.
  await upsertByCode(connection, 'review_report_reasons', [
    { code: 'SPAM', name: 'Spam or advertising' },
    { code: 'ABUSIVE', name: 'Abusive or offensive language' },
    { code: 'OFF_TOPIC', name: 'Not about this listing/stay' },
    { code: 'FAKE', name: 'Suspected fake review' },
    { code: 'OTHER', name: 'Other' },
  ]);

  // Sprint G — public Contact form (migration 0043).
  await upsertByCode(connection, 'contact_inquiry_types', [
    { code: 'GENERAL', name: 'General' },
    { code: 'BOOKING_SUPPORT', name: 'Booking / Customer Support' },
    { code: 'PARTNER_BUSINESS', name: 'Partner / Business' },
    { code: 'TECHNICAL', name: 'Technical Issue' },
  ]);

  await upsertByCode(connection, 'contact_inquiry_statuses', [
    { code: 'NEW', name: 'New' },
    { code: 'RESOLVED', name: 'Resolved' },
  ]);

  // Sprint H — Blog (migration 0044). Mirrors `listing_statuses`' own
  // shape. SCHEDULED/ARCHIVED both round-trip back to DRAFT or forward
  // to PUBLISHED — see `blogService.js`'s transition guards for the
  // real state machine; this is just the vocabulary.
  await upsertByCode(connection, 'blog_post_statuses', [
    { code: 'DRAFT', name: 'Draft' },
    { code: 'SCHEDULED', name: 'Scheduled' },
    { code: 'PUBLISHED', name: 'Published' },
    { code: 'ARCHIVED', name: 'Archived' },
  ]);
}
