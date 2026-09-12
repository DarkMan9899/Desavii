/**
 * Bookings module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 */

function toBookingItemResponse(item) {
  return {
    id: item.id,
    bookable_unit_id: item.bookableUnitId,
    // P2.2B: live-joined from `bookable_units`/`bookable_unit_types`
    // (`mysqlBookingRepository.js#findItemsForBooking`) — lets customer,
    // partner, and admin consumers of this same shape all identify which
    // room/unit type was actually booked, without a second round-trip to
    // `GET /availability/:listingId/units`. No booking-time snapshot: a
    // unit later renamed by its partner will show its CURRENT label here,
    // not what it was called at booking time (see P2.2B implementation
    // report — deliberately deferred, no migration in this slice).
    unit_label: item.unitLabel ?? null,
    bookable_unit_type: item.bookableUnitTypeCode ?? null,
    date_from: item.dateFrom,
    date_to: item.dateTo,
    // Sprint A (Time-Aware Booking Foundation): snapshotted at
    // booking-creation time from the selected unit's `time_slot_start`/
    // `time_slot_end` (`bookingService.js#resolveItem`) — `null` for every
    // non-time-slot unit type and every booking created before this
    // capability existed. Same one shape read by customer, partner, and
    // admin (this DTO is shared across all three, see file header).
    start_time: item.startTime ?? null,
    end_time: item.endTime ?? null,
    // Sprint B (Car Rental Pickup/Return Interval): same shared shape,
    // present only for a VEHICLE booking. `null` everywhere else.
    pickup_location: item.pickupLocation ?? null,
    return_location: item.returnLocation ?? null,
    quantity: item.quantity,
    unit_price_amount: item.unitPriceAmount,
    guests: (item.guests ?? []).map((guest) => ({
      id: guest.id,
      full_name: guest.fullName,
      document_number: guest.documentNumber,
    })),
  };
}

export function toBookingResponse(booking) {
  return {
    id: booking.id,
    booking_reference: booking.bookingReference,
    customer_user_id: booking.customerUserId,
    partner_id: booking.partnerId,
    // Resolved via `partnerService.getOwnerUserId` (see
    // `bookingService.js`'s `#hydrate`) — the user id a customer's
    // "Message partner" entry point sends as `participantUserIds` to
    // `POST /messaging/conversations`. `null` for a partner with no
    // owner_user_id set (a real, if rare, data gap) rather than a
    // fabricated id. Additive to the single-booking shape only, never
    // the list summary (`toBookingSummaryResponse`) — no per-row N+1.
    partner_owner_user_id: booking.partnerOwnerUserId ?? null,
    listing_id: booking.listingId,
    booking_type: booking.bookingTypeCode,
    status: booking.statusCode,
    customer_notes: booking.customerNotes,
    guest_contact_snapshot: booking.guestContactSnapshot,
    currency: booking.currencyCode,
    subtotal_amount: booking.subtotalAmount,
    fees_amount: booking.feesAmount,
    discount_amount: booking.discountAmount,
    total_amount: booking.totalAmount,
    // Pass 8 (Multi-Currency / CBA FX Pricing) — the immutable FX display
    // snapshot taken at booking creation (see migration 0047). All five
    // are `null` for a booking with no display currency on record — the
    // frontend then shows `total_amount`/`currency` (AMD) as-is, the same
    // as it always has. Never recomputed after creation, regardless of
    // any later CBA rate change (brief §26).
    display_currency: booking.displayCurrencyCode ?? null,
    fx_amd_per_unit: booking.fxAmdPerUnit ?? null,
    fx_effective_at: booking.fxEffectiveAt ?? null,
    display_subtotal_amount: booking.displaySubtotalAmount ?? null,
    display_total_amount: booking.displayTotalAmount ?? null,
    payment_method: booking.paymentMethod,
    payment_status: booking.paymentStatusCode,
    requested_at: booking.requestedAt,
    confirmed_at: booking.confirmedAt,
    rejected_at: booking.rejectedAt,
    cancelled_at: booking.cancelledAt,
    completed_at: booking.completedAt,
    cancellation_reason: booking.cancellationReason,
    refund_status: booking.refundStatus,
    created_at: booking.createdAt,
    updated_at: booking.updatedAt,
    items: (booking.items ?? []).map(toBookingItemResponse),
  };
}

export function toBookingSummaryResponse(booking) {
  return {
    id: booking.id,
    booking_reference: booking.bookingReference,
    // Stage 11.4 (Admin Platform — Booking Operations): additive —
    // `toBookingResponse` (the single-booking shape) always had these;
    // the admin bookings list needs them too, to link each row to the
    // customer/partner's own admin detail page (Stages 11.1/11.2).
    customer_user_id: booking.customerUserId,
    partner_id: booking.partnerId,
    listing_id: booking.listingId,
    booking_type: booking.bookingTypeCode,
    status: booking.statusCode,
    currency: booking.currencyCode,
    total_amount: booking.totalAmount,
    // Pass 8 — same immutable FX display snapshot `toBookingResponse`
    // carries (see its own comment); the "My Trips"/admin list needs it
    // too, so a booking shows the same currency there as on its own
    // detail page.
    display_currency: booking.displayCurrencyCode ?? null,
    display_total_amount: booking.displayTotalAmount ?? null,
    requested_at: booking.requestedAt,
    // Admin Sprint 4: only present when the repository was asked for
    // `includeNames` (the admin-only browsing paths) — `undefined` on a
    // customer's/partner's own self-service list, same additive
    // reasoning as the rest of this function's Stage 11.4 fields.
    customer_display_name:
      booking.customerFirstName || booking.customerLastName
        ? [booking.customerFirstName, booking.customerLastName]
            .filter(Boolean)
            .join(' ')
        : undefined,
    partner_display_name: booking.partnerDisplayName ?? undefined,
    // Phase 8 (Auth / User Dashboard): earliest date_from / latest date_to
    // across the booking's items — added additively so the dashboard can
    // tell an upcoming trip apart from history without fetching each
    // booking's full item detail. Null for a booking with no items yet
    // (shouldn't happen post-creation, but the LEFT JOIN makes it possible
    // in principle).
    date_from: booking.tripDateFrom ?? null,
    date_to: booking.tripDateTo ?? null,
  };
}

/** Stage 11.4: one `booking_status_history` row. */
export function toBookingStatusHistoryResponse(entry) {
  return {
    id: entry.id,
    from_status: entry.from_status_code,
    to_status: entry.to_status_code,
    changed_by: entry.changed_by,
    changed_at: entry.created_at,
  };
}
