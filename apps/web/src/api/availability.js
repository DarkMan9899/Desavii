/**
 * Availability module — raw endpoint calls (FRONTEND_ARCHITECTURE.md
 * §3.1's `api/` contract). Mirrors `apps/api/src/modules/availability/
 * module.routes.js`. The partner-authenticated functions above were
 * scoped in Phase 5 to exactly what `AvailabilityStep` (Partner Listing
 * Wizard) needs: registering the >=1 bookable unit publish-readiness
 * requires, and blackout-date management. Phase 6 (Listing Details) adds
 * the two public, unauthenticated reads below for the customer-facing
 * detail page — still not the full `availability_calendar` write/owner
 * surface, which stays out of scope here same as before.
 */

import apiClient from './client.js';

/**
 * `POST /availability/units` — `{ listingId, bookableUnitType, capacity?,
 * unitLabel?, maxGuests?, bedConfiguration?, basePriceAmount?,
 * basePriceCurrency? }` (the last four are P2.2A additions — occupancy/
 * bed structure/base price, separate from `capacity`'s existing meaning
 * of "how many rooms of this type exist").
 */
export function registerBookableUnit(payload) {
  return apiClient
    .post('/availability/units', payload)
    .then((response) => response.data);
}

/**
 * `PATCH /availability/units/:id` (P2.2A) — partial edit of an
 * already-registered unit's label/capacity/occupancy/bed configuration/
 * base price. `bookableUnitType` is not editable post-creation.
 */
export function updateBookableUnit(id, payload) {
  return apiClient
    .patch(`/availability/units/${id}`, payload)
    .then((response) => response.data);
}

/** `GET /availability/units?listingId=X`. */
export function listBookableUnits(listingId) {
  return apiClient
    .get('/availability/units', { params: { listingId } })
    .then((response) => response.data);
}

/**
 * Sprint C-1 (Accommodation room-level product data) — room description,
 * genuinely multilingual, full-replace-per-locale, same shape as the
 * Listings module's own `replaceListingHighlights` family.
 *
 * `PATCH /availability/units/:id/description` — `{ languageCode?, description }`.
 */
export function updateBookableUnitDescription(id, description, languageCode) {
  return apiClient
    .patch(`/availability/units/${id}/description`, {
      languageCode,
      description,
    })
    .then((response) => response.data);
}

/** `PATCH /availability/units/:id/amenities` — `{ amenityIds: [...] }`, full replace. */
export function replaceBookableUnitAmenities(id, amenityIds) {
  return apiClient
    .patch(`/availability/units/${id}/amenities`, { amenityIds })
    .then((response) => response.data);
}

/** `GET /availability/units/:id/media`. */
export function listBookableUnitMedia(id) {
  return apiClient
    .get(`/availability/units/${id}/media`)
    .then((response) => response.data);
}

/**
 * `POST /availability/units/:id/media` — raw file body, `Content-Type`
 * resolved from the file itself. Mirrors `attachListingMedia` exactly.
 * @param {number} id
 * @param {File} file
 */
export function attachBookableUnitMedia(id, file) {
  return apiClient
    .post(`/availability/units/${id}/media`, file, {
      headers: { 'Content-Type': file.type },
    })
    .then((response) => response.data);
}

/** `DELETE /availability/units/:id/media/:mediaId`. */
export function removeBookableUnitMedia(id, mediaId) {
  return apiClient
    .delete(`/availability/units/${id}/media/${mediaId}`)
    .then((response) => response.data);
}

/** `POST /availability/blackouts` — `{ listingId, dateFrom, dateTo, reason? }`. */
export function createBlackout(payload) {
  return apiClient
    .post('/availability/blackouts', payload)
    .then((response) => response.data);
}

/** `GET /availability/blackouts?listingId=X`. */
export function listBlackouts(listingId) {
  return apiClient
    .get('/availability/blackouts', { params: { listingId } })
    .then((response) => response.data);
}

/** `DELETE /availability/blackouts/:id`. */
export function removeBlackout(id) {
  return apiClient
    .delete(`/availability/blackouts/${id}`)
    .then((response) => response.data);
}

// --- Phase 6 (Listing Details): the two genuinely public reads, no auth
// required — `GET /:listingId` (blackout ranges only, no id/reason) and
// `GET /:listingId/calendar` (merged day-by-day status). See
// `apps/api/src/modules/availability/module.routes.js`'s own "public
// views" section header for why these two alone skip `requireAuth`. ---

/** `GET /availability/:listingId` — blackout ranges, public shape. */
export function getListingPublicRanges(listingId) {
  return apiClient
    .get(`/availability/${listingId}`)
    .then((response) => response.data);
}

/**
 * `GET /availability/:listingId/calendar?from&to&unitId?` — merged
 * day-by-day status (plus Phase 7's additive `price_amount`/
 * `price_currency` per day). `unitId` is optional: the backend
 * auto-resolves it for a single-bookable-unit listing and throws a 422
 * `AMBIGUOUS_UNIT` for a multi-unit one — `useListingAvailabilityQuery.js`
 * catches that and falls back to the ranges-only view;
 * `ListingReservationWidget` (Phase 7) instead resolves the ambiguity
 * up front via `getListingBookableUnits` below and always passes an
 * explicit `unitId` once a unit is selected.
 */
export function getListingCalendar(listingId, { from, to, unitId } = {}) {
  return apiClient
    .get(`/availability/${listingId}/calendar`, {
      params: { from, to, unitId },
    })
    .then((response) => response.data);
}

/**
 * `GET /availability/:listingId/units` (Phase 7, Booking Flow) — public,
 * unauthenticated read of a listing's bookable units (`{id,
 * bookable_unit_type, capacity}[]`, no owner-facing fields). Lets the
 * customer-facing reservation widget resolve which unit(s) can be
 * selected before requesting a hold, without needing `requireAuth`'s
 * owner-scoped `GET /availability/units?listingId=` above.
 *
 * Sprint A (Time-Aware Booking Foundation): an optional `date` augments
 * each unit with a real per-date availability/price snapshot
 * (`available_status_for_date`/`remaining_count_for_date`/
 * `price_amount_for_date`/`price_currency_for_date`) — the customer-facing
 * time-slot picker's own read, once a date is chosen, of which sibling
 * departure/session units actually have capacity that day. Omitting it
 * (every other caller) returns the exact same shape this always has.
 *
 * Sprint C-3 (Date-Range Room Availability): `checkIn`+`checkOut` (given
 * together, mutually exclusive with `date`) instead augment each unit
 * with a whole-stay snapshot — `availability_status_for_stay`/
 * `remaining_count_for_stay`/`night_count_for_stay`/`stay_total_amount`/
 * `stay_total_currency` — the true minimum across every occupied night,
 * never a per-day figure. This is what the Rooms section/Reservation
 * widget use once the customer has picked a check-in and check-out date.
 */
export function getListingBookableUnits(
  listingId,
  { date, checkIn, checkOut } = {},
) {
  return apiClient
    .get(`/availability/${listingId}/units`, {
      params: { date, checkIn, checkOut },
    })
    .then((response) => response.data);
}

/**
 * `GET /availability/:listingId/availability-summary?from&to&unitId?`
 * (Phase 17, Listing Detail) — public, customer-safe bucketed summary
 * (`AVAILABLE`/`LOW`/`SOLD_OUT` + a `remaining_count` only when not
 * `AVAILABLE`), one entry per bookable unit. Never exposes raw capacity
 * for high-stock inventory — see `availabilityDto.js#toPublicAvailabilitySummaryResponse`.
 */
export function getListingAvailabilitySummary(
  listingId,
  { from, to, unitId } = {},
) {
  return apiClient
    .get(`/availability/${listingId}/availability-summary`, {
      params: { from, to, unitId },
    })
    .then((response) => response.data);
}

/**
 * `GET /availability/:listingId/day-status?from&to&unitId?` (Phase 18 —
 * Premium Listing Detail, Availability UX fix). Unlike `getListingCalendar`
 * above (whose day status comes ONLY from `availability_calendar.status_id`
 * — `AVAILABLE`/`BLOCKED` — plus the blackout veto, and is therefore blind
 * to a day whose `quantity_available` has been fully consumed by a manual
 * block or an external reservation without anyone flipping `status_id`),
 * this is the authoritative per-day read: it reuses the exact same
 * `quantity_available` COALESCE-to-capacity + blackout-veto logic
 * `getPublicAvailabilitySummary` already uses, just at day granularity
 * instead of collapsed to one range-wide minimum. `ListingReservationWidget`
 * uses this — not `getListingCalendar` — to decide which `DatePicker` days
 * are actually selectable.
 */
export function getListingDayStatus(listingId, { from, to, unitId } = {}) {
  return apiClient
    .get(`/availability/${listingId}/day-status`, {
      params: { from, to, unitId },
    })
    .then((response) => response.data);
}

/**
 * `POST /availability` (Phase 9: Partner Dashboard) — owner-authenticated
 * day-range write: `{ unitId, dateFrom, dateTo, status, quantityAvailable?,
 * priceOverrideAmount?, priceOverrideCurrency? }` (`availabilityValidators.
 * js`'s `setAvailabilitySchema`; price fields must be supplied together).
 * This is the calendar-editing counterpart to the read-only
 * `getListingCalendar` above — the Partner Calendar editor's writes go
 * through this, never a client-side merge of blackouts/units.
 */
export function setAvailability(payload) {
  return apiClient
    .post('/availability', payload)
    .then((response) => response.data);
}

// --- Phase 17: manual blocks, external reservations, ledger/breakdown ---

/** `POST /availability/blocks` — `{ unitId, dateFrom, dateTo, quantity, reasonCode, notes? }`. */
export function createInventoryBlock(payload) {
  return apiClient
    .post('/availability/blocks', payload)
    .then((response) => response.data);
}

/** `GET /availability/blocks?listingId=X`. */
export function listInventoryBlocks(listingId) {
  return apiClient
    .get('/availability/blocks', { params: { listingId } })
    .then((response) => response.data);
}

/** `DELETE /availability/blocks/:id`. */
export function releaseInventoryBlock(id) {
  return apiClient
    .delete(`/availability/blocks/${id}`)
    .then((response) => response.data);
}

/** `POST /availability/external-reservations`. */
export function createExternalReservation(payload) {
  return apiClient
    .post('/availability/external-reservations', payload)
    .then((response) => response.data);
}

/** `GET /availability/external-reservations?listingId=X`. */
export function listExternalReservations(listingId) {
  return apiClient
    .get('/availability/external-reservations', { params: { listingId } })
    .then((response) => response.data);
}

/** `DELETE /availability/external-reservations/:id`. */
export function cancelExternalReservation(id) {
  return apiClient
    .delete(`/availability/external-reservations/${id}`)
    .then((response) => response.data);
}

/** `GET /availability/units/:id/ledger?from&to` — the append-only audit trail. */
export function getUnitLedger(unitId, { from, to }) {
  return apiClient
    .get(`/availability/units/${unitId}/ledger`, { params: { from, to } })
    .then((response) => response.data);
}

/** `GET /availability/units/:id/breakdown?from&to` — per-day total/available/confirmed/held/external/manual. */
export function getUnitBreakdown(unitId, { from, to }) {
  return apiClient
    .get(`/availability/units/${unitId}/breakdown`, { params: { from, to } })
    .then((response) => response.data);
}

/** `GET /availability/units/:id/holds?from&to` — the raw active `reservation_holds` rows overlapping the span (Phase 17 Admin Inventory "Holds" tab). */
export function getUnitHolds(unitId, { from, to }) {
  return apiClient
    .get(`/availability/units/${unitId}/holds`, { params: { from, to } })
    .then((response) => response.data);
}

// --- Phase 17: Connectivity Platform (`/inventory-connections`) ---

export function createInventoryConnection(payload) {
  return apiClient
    .post('/inventory-connections', payload)
    .then((response) => response.data);
}

export function listInventoryConnections(partnerId) {
  return apiClient
    .get('/inventory-connections', { params: { partnerId } })
    .then((response) => response.data);
}

export function getInventoryConnection(id) {
  return apiClient
    .get(`/inventory-connections/${id}`)
    .then((response) => response.data);
}

export function updateInventoryConnection(id, payload) {
  return apiClient
    .patch(`/inventory-connections/${id}`, payload)
    .then((response) => response.data);
}

export function disconnectInventoryConnection(id) {
  return apiClient
    .delete(`/inventory-connections/${id}`)
    .then((response) => response.data);
}

export function setInventoryConnectionMapping(id, payload) {
  return apiClient
    .post(`/inventory-connections/${id}/mapping`, payload)
    .then((response) => response.data);
}

export function testInventoryConnection(id) {
  return apiClient
    .post(`/inventory-connections/${id}/test`)
    .then((response) => response.data);
}

export function syncInventoryConnectionNow(id) {
  return apiClient
    .post(`/inventory-connections/${id}/sync`)
    .then((response) => response.data);
}

export function listInventoryConnectionSyncRuns(id) {
  return apiClient
    .get(`/inventory-connections/${id}/sync-runs`)
    .then((response) => response.data);
}

export function listInventoryConnectionConflicts(id) {
  return apiClient
    .get(`/inventory-connections/${id}/conflicts`)
    .then((response) => response.data);
}

export function resolveInventoryConnectionConflict(id, conflictId, payload) {
  return apiClient
    .post(
      `/inventory-connections/${id}/conflicts/${conflictId}/resolve`,
      payload,
    )
    .then((response) => response.data);
}

// --- Admin Sprint 5: the two genuinely admin-wide, no-scoping-id-
// required reads — every function above this point requires a
// `partnerId`/`connectionId` the caller must already know. ---

/** `GET /inventory-connections/admin/overview` — `inventory.view_all`-gated, every active connection across every partner. */
export function getAdminInventoryConnectionsOverview() {
  return apiClient
    .get('/inventory-connections/admin/overview')
    .then((response) => response.data);
}

/** `GET /inventory-connections/admin/conflicts` — `inventory.view_all`-gated, every unresolved sync conflict across every connection. */
export function getAdminInventoryConflictsOverview() {
  return apiClient
    .get('/inventory-connections/admin/conflicts')
    .then((response) => response.data);
}
