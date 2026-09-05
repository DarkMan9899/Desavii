/**
 * Availability module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 *
 * `toBookableUnitResponse` is `bookable_units` (owner/admin management —
 * `source_table`/`source_id` are internal bookkeeping for the polymorphic
 * inventory pointer and are deliberately not exposed here). `
 * toCalendarEntryResponse` is `availability_calendar` (the primary engine,
 * owner/admin management view). `toBlackoutManagementResponse` (owner/
 * admin, includes `id`/`reason`) and `toPublicRangeResponse` (public, no
 * `reason`/`id`) are both `blackout_dates` — the complementary veto layer.
 * `toCalendarDayResponse` is the public, merged day-by-day view.
 */

/** Owner/Partner-authoring media shape — mirrors `listingDto.js`'s own `toMediaResponse` minus alt-text/caption (not an authored field for room media in this sprint). */
export function toUnitMediaResponse(media) {
  return {
    id: media.id,
    media_type: media.mediaTypeCode,
    url: media.url,
    thumbnail_url: media.thumbnailUrl,
    position: media.position,
    is_cover: media.isCover,
    moderation_status: media.moderationStatusCode,
    mime_type: media.mimeType,
    file_size_bytes: media.fileSizeBytes,
    created_at: media.createdAt,
  };
}

export function toBookableUnitResponse(unit) {
  return {
    id: unit.id,
    listing_id: unit.listingId,
    bookable_unit_type: unit.bookableUnitTypeCode,
    capacity: unit.capacity,
    time_slot_start: unit.timeSlotStart,
    time_slot_end: unit.timeSlotEnd,
    unit_label: unit.unitLabel,
    max_guests: unit.maxGuests,
    bed_configuration: unit.bedConfiguration,
    base_price_amount: unit.basePriceAmount,
    base_price_currency: unit.basePriceCurrencyCode,
    // Sprint C-1 (Accommodation room-level product data) — structured,
    // owner-facing room fields; generic on `bookable_units` (see
    // migration 0040) but only ever populated by the Partner UI for a
    // HOTEL_ROOM unit.
    room_size_sqm: unit.roomSizeSqm ?? null,
    bathroom_type: unit.bathroomType ?? null,
    view_type: unit.viewType ?? null,
    smoking_policy: unit.smokingPolicy ?? null,
    // Present only when the caller went through `AvailabilityService`'s
    // `#enrichUnit` (every owner-facing register/update/list path) — a
    // bare `BookableUnitService` read (e.g. Sprint 10's internal
    // `getUnitById`) never attaches these, so they're omitted rather than
    // defaulted to an empty array in that case.
    ...(unit.translations !== undefined && {
      translations: unit.translations.map((t) => ({
        language_code: t.languageCode,
        description: t.description,
      })),
    }),
    ...(unit.amenityIds !== undefined && { amenity_ids: unit.amenityIds }),
    ...(unit.media !== undefined && {
      media: unit.media.map(toUnitMediaResponse),
    }),
    created_at: unit.createdAt,
    updated_at: unit.updatedAt,
  };
}

// Phase 17 §Listing Detail — below this count, the exact number is shown
// ("Only 2 rooms left"); at or above it, only a generic "Available" status
// is returned. Keeps the public summary honest about scarcity without
// exposing a partner's real total capacity for high-stock inventory.
const LOW_STOCK_THRESHOLD = 5;

/**
 * Public, customer-safe availability summary — one bucketed status per
 * unit, never the raw `remaining` count above `LOW_STOCK_THRESHOLD`. The
 * frontend composes the exact copy ("Only N left", "N seats available",
 * "Sold out", "Available") from `status` + `remaining_count` + the unit's
 * own `bookable_unit_type` (already public via `/units`), so no wording
 * decision is baked into the backend response.
 */
function resolveAvailabilityStatus(remaining) {
  if (remaining <= 0) return 'SOLD_OUT';
  if (remaining <= LOW_STOCK_THRESHOLD) return 'LOW';
  return 'AVAILABLE';
}

/**
 * Public: no `listing_id`/`created_at`/`updated_at` — a customer picking a
 * unit to book needs its identity, type, capacity, occupancy/bed
 * structure, base price, and (for a time-slot unit) its label/time
 * window.
 *
 * Sprint C-2 (Public Rooms / Choose Your Room) — adds the Sprint C-1
 * room-level fields a customer needs to actually compare/choose a real
 * HOTEL_ROOM: structured size/bathroom/view/smoking (generic on
 * `bookable_units`, so always present — null on any non-room unit type,
 * same as the owner-facing `toBookableUnitResponse`), plus the same
 * enriched-only translations/amenity_ids/media this file's owner DTO
 * already conditionally includes. No new fields invented: this mirrors
 * `toBookableUnitResponse` above minus the owner-only `listing_id`/
 * `created_at`/`updated_at`, never a parallel "public room" shape.
 * `getPublicUnits` (`availabilityService.js`) is what actually attaches
 * translations/amenityIds/media before this DTO runs — a caller that
 * still passes a bare, unenriched unit (there are none left after that
 * change, but the conditional spread costs nothing) simply omits them,
 * exactly like the owner DTO already does for Sprint 10's internal
 * `getUnitById`.
 */
export function toPublicBookableUnitResponse(unit) {
  return {
    id: unit.id,
    bookable_unit_type: unit.bookableUnitTypeCode,
    capacity: unit.capacity,
    time_slot_start: unit.timeSlotStart,
    time_slot_end: unit.timeSlotEnd,
    unit_label: unit.unitLabel,
    max_guests: unit.maxGuests,
    bed_configuration: unit.bedConfiguration,
    base_price_amount: unit.basePriceAmount,
    base_price_currency: unit.basePriceCurrencyCode,
    room_size_sqm: unit.roomSizeSqm ?? null,
    bathroom_type: unit.bathroomType ?? null,
    view_type: unit.viewType ?? null,
    smoking_policy: unit.smokingPolicy ?? null,
    ...(unit.translations !== undefined && {
      translations: unit.translations.map((t) => ({
        language_code: t.languageCode,
        description: t.description,
      })),
    }),
    ...(unit.amenityIds !== undefined && { amenity_ids: unit.amenityIds }),
    ...(unit.media !== undefined && {
      media: unit.media.map(toUnitMediaResponse),
    }),
    // Sprint A (Time-Aware Booking Foundation) — only present when
    // `GET /:listingId/units` was called with `?date=`
    // (`availabilityService.js#getPublicUnits`). Same customer-safe
    // bucketing/never-leak-raw-count-above-threshold convention as
    // `toPublicDailyAvailabilityResponse` below — reused via
    // `resolveAvailabilityStatus`, not reimplemented.
    ...(unit.remainingForDate !== undefined
      ? {
          availability_status_for_date: resolveAvailabilityStatus(
            unit.remainingForDate,
          ),
          remaining_count_for_date:
            resolveAvailabilityStatus(unit.remainingForDate) === 'AVAILABLE'
              ? null
              : unit.remainingForDate,
          price_amount_for_date: unit.priceForDateAmount ?? null,
          price_currency_for_date: unit.priceForDateCurrencyCode ?? null,
        }
      : {}),
  };
}

export function toCalendarEntryResponse(entry) {
  return {
    id: entry.id,
    bookable_unit_id: entry.bookableUnitId,
    date: entry.date,
    status: entry.statusCode,
    quantity_available: entry.quantityAvailable,
    price_override_amount: entry.priceOverrideAmount,
    price_override_currency: entry.priceOverrideCurrencyCode,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export function toBlackoutManagementResponse(block) {
  return {
    id: block.id,
    listing_id: block.listingId,
    date_from: block.dateFrom,
    date_to: block.dateTo,
    reason: block.reason,
    created_at: block.createdAt,
    updated_at: block.updatedAt,
  };
}

export function toPublicRangeResponse(block) {
  return {
    date_from: block.dateFrom,
    date_to: block.dateTo,
  };
}

export function toCalendarDayResponse(day) {
  return {
    date: day.date,
    status: day.status,
    price_amount: day.priceAmount ?? null,
    price_currency: day.priceCurrencyCode ?? null,
  };
}

/**
 * Phase 18 — per-day counterpart to `toPublicAvailabilitySummaryResponse`
 * (see `availabilityService.js#getPublicDailyAvailabilityStatus`'s own
 * comment for why the range-level summary alone isn't enough for a date
 * picker). Same customer-safe bucketing — never leaks the raw remaining
 * count once it's comfortably above `LOW_STOCK_THRESHOLD`.
 */
export function toPublicDailyAvailabilityResponse(day) {
  const status = resolveAvailabilityStatus(day.remaining);
  return {
    date: day.date,
    availability_status: status,
    remaining_count: status === 'AVAILABLE' ? null : day.remaining,
  };
}

export function toPublicAvailabilitySummaryResponse(summary) {
  const status = resolveAvailabilityStatus(summary.remaining);
  return {
    unit_id: summary.unitId,
    bookable_unit_type: summary.bookableUnitTypeCode,
    availability_status: status,
    remaining_count: status === 'AVAILABLE' ? null : summary.remaining,
  };
}

// --- Phase 17: manual blocks, external reservations, ledger/breakdown ---

export function toInventoryBlockResponse(block) {
  return {
    id: block.id,
    bookable_unit_id: block.bookableUnitId,
    date_from: block.dateFrom,
    date_to: block.dateTo,
    quantity: block.quantity,
    reason_code: block.reasonCode,
    notes: block.notes,
    released_at: block.releasedAt,
    created_by: block.createdBy,
    created_at: block.createdAt,
  };
}

export function toExternalReservationResponse(reservation) {
  return {
    id: reservation.id,
    bookable_unit_id: reservation.bookableUnitId,
    date_from: reservation.dateFrom,
    date_to: reservation.dateTo,
    quantity: reservation.quantity,
    source_code: reservation.sourceCode,
    external_reference: reservation.externalReference,
    guest_name: reservation.guestName,
    guest_phone: reservation.guestPhone,
    guest_email: reservation.guestEmail,
    notes: reservation.notes,
    connection_id: reservation.connectionId,
    cancelled_at: reservation.cancelledAt,
    created_at: reservation.createdAt,
  };
}

export function toLedgerEntryResponse(entry) {
  return {
    id: entry.id,
    date: entry.date,
    source_type: entry.sourceType,
    source_id: entry.sourceId,
    delta: entry.delta,
    quantity_before: entry.quantityBefore,
    quantity_after: entry.quantityAfter,
    actor_user_id: entry.actorUserId,
    reason: entry.reason,
    created_at: entry.createdAt,
  };
}

export function toAvailabilityBreakdownResponse(day) {
  return {
    date: day.date,
    total: day.total,
    available: day.available,
    confirmed: day.confirmed,
    held: day.held,
    external: day.external,
    manual: day.manual,
  };
}

/** Phase 17 §Admin Inventory — owner/admin view of one active `reservation_holds` row. */
export function toReservationHoldResponse(hold) {
  return {
    id: hold.id,
    bookable_unit_id: hold.bookableUnitId,
    user_id: hold.userId,
    date_from: hold.dateFrom,
    date_to: hold.dateTo,
    expires_at: hold.expiresAt,
    created_at: hold.createdAt,
  };
}
