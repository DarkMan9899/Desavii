/**
 * Listings module — raw endpoint calls (FRONTEND_ARCHITECTURE.md §3.1's
 * `api/` contract: the only place that constructs a Listings URL or calls
 * `apiClient` directly). Mirrors `apps/api/src/modules/listings/
 * module.routes.js` — no endpoint is called here that doesn't exist on
 * the backend.
 *
 * Every function resolves to the raw `{ success, data, meta, error }`
 * envelope; unwrapping into just `data` is a `queries/`-layer concern
 * (Ch. 14), not this layer's.
 */

import apiClient from './client.js';

/**
 * `GET /listings/:id` — the full listing resource, including
 * `translations`/`location`/`media` (`listingDto.js`'s `toListingResponse`).
 */
export function getListing(id) {
  return apiClient.get(`/listings/${id}`).then((response) => response.data);
}

// --- Phase 5 (Partner Listing Wizard) — write-side calls. Every body
// shape here mirrors `listingValidators.js`'s `createListingSchema`/
// `updateListingSchema` exactly (`attributeValues`/`policyValues`/
// `pricing`/`bookingRules` all keyed by `code`, never an internal id —
// same convention `GET /listings/metadata` and search's `attr_{code}`
// params already established). ---

/**
 * `POST /listings` — creates a listing in `DRAFT` status. The wizard
 * calls this once, on its Basic Information step, then every later step
 * PATCHes the same id (`updateListing`) — see `PartnerListingWizard`'s
 * own docs for why creation happens mid-flow, not at final submit.
 * @param {object} payload — `{ partnerId, listingType, translations, location?, categoryIds?, amenityIds?, attributeValues?, policyValues?, pricing?, bookingRules? }`
 */
export function createListing(payload) {
  return apiClient.post('/listings', payload).then((response) => response.data);
}

/**
 * `PATCH /listings/:id` — every field optional; only send what changed.
 * `ListingService` resolves `attributeValues`/`policyValues`/`pricing`
 * against the listing's already-stored category when `categoryIds` isn't
 * resent in this call.
 */
export function updateListing(id, payload) {
  return apiClient
    .patch(`/listings/${id}`, payload)
    .then((response) => response.data);
}

/**
 * `POST /listings/:id/publish` — rejects with 422 and an itemized
 * `details` array (`{ field, issue }[]`) until every publish-readiness
 * check passes (translation, image, location, required attributes/
 * policies, >=1 bookable unit) — see `ApiError.js` for how validation
 * details surface to callers.
 */
export function publishListing(id) {
  return apiClient
    .post(`/listings/${id}/publish`)
    .then((response) => response.data);
}

/** `POST /listings/:id/unpublish`. */
export function unpublishListing(id) {
  return apiClient
    .post(`/listings/${id}/unpublish`)
    .then((response) => response.data);
}

/**
 * `POST /listings/:id/archive` (Phase 9: Partner Dashboard). Exercises
 * the pre-existing PUBLISHED|UNPUBLISHED -> ARCHIVED transition. Terminal
 * — there is no `unarchiveListing`, matching the backend's domain state
 * machine (`listingStatusTransitions.js`: `ARCHIVED` has no outgoing
 * transitions).
 */
export function archiveListing(id) {
  return apiClient
    .post(`/listings/${id}/archive`)
    .then((response) => response.data);
}

/** `DELETE /listings/:id` (Phase 9). Soft-delete — see `listingService.js`. */
export function deleteListing(id) {
  return apiClient.delete(`/listings/${id}`).then((response) => response.data);
}

/**
 * `POST /listings/:id/media` — raw binary body, one request per file
 * (the backend has no multi-file/multipart endpoint — see
 * `module.routes.js`'s `express.raw()` scoping). `file.type` becomes the
 * request's `Content-Type`, exactly like the backend's own integration
 * tests exercise this route.
 * @param {number} id
 * @param {File} file
 */
export function attachListingMedia(id, file) {
  return apiClient
    .post(`/listings/${id}/media`, file, {
      headers: { 'Content-Type': file.type },
    })
    .then((response) => response.data);
}

/** `PATCH /listings/:id/media/:mediaId` — `{ position?, isCover? }`. */
export function updateListingMedia(id, mediaId, payload) {
  return apiClient
    .patch(`/listings/${id}/media/${mediaId}`, payload)
    .then((response) => response.data);
}

/** `DELETE /listings/:id/media/:mediaId`. */
export function removeListingMedia(id, mediaId) {
  return apiClient
    .delete(`/listings/${id}/media/${mediaId}`)
    .then((response) => response.data);
}

/**
 * `GET /listings/metadata?categoryId=X` — the category-scoped
 * attributes/amenity groups/pricing models/policies the Dynamic
 * Attributes, Amenities, Pricing, and Policies wizard steps all render
 * from (`listingDto.js`'s `toListingMetadataResponse` — every attribute/
 * policy/pricing-model label is a stable `code`, translated by the
 * frontend's i18n. Amenity names are the one exception — free-text DB
 * rows with no stable code — so `locale` is forwarded here the same way
 * `getCategories` forwards it, letting the backend resolve them via
 * `listing_amenity_translations`).
 */
export function getListingMetadata(categoryId, locale) {
  return apiClient
    .get('/listings/metadata', { params: { categoryId, locale } })
    .then((response) => response.data);
}

/**
 * Phase 18 (Premium Listing Detail) — full-replace PATCH endpoints for
 * the partner-authored rich-content collections (`ContentStep`). Each
 * call sends the *entire* desired collection; the backend deletes and
 * re-inserts, exactly like `updateListingMedia`'s sibling endpoints have
 * no partial/per-item write variant.
 */

/**
 * `PATCH /listings/:id/highlights` — `{ languageCode?, highlights: [{
 * iconCode, text }] }`. `languageCode` ('en'/'hy'/'ru') is optional —
 * omitted, the backend falls back to the platform default locale, same
 * as before Sprint 3 (2026 Partner Workspace redesign) made it a real,
 * request-driven parameter.
 */
export function replaceListingHighlights(id, highlights, languageCode) {
  return apiClient
    .patch(`/listings/${id}/highlights`, { languageCode, highlights })
    .then((response) => response.data);
}

/** `PATCH /listings/:id/itinerary` — `{ languageCode?, steps: [{ title, description?, durationMinutes? }] }`. */
export function replaceListingItinerarySteps(id, steps, languageCode) {
  return apiClient
    .patch(`/listings/${id}/itinerary`, { languageCode, steps })
    .then((response) => response.data);
}

/** `PATCH /listings/:id/included-items` — `{ languageCode?, items: [{ itemText, isIncluded }] }`. */
export function replaceListingIncludedItems(id, items, languageCode) {
  return apiClient
    .patch(`/listings/${id}/included-items`, { languageCode, items })
    .then((response) => response.data);
}

/** `PATCH /listings/:id/faqs` — `{ languageCode?, faqs: [{ question, answer }] }`. */
export function replaceListingFaqs(id, faqs, languageCode) {
  return apiClient
    .patch(`/listings/${id}/faqs`, { languageCode, faqs })
    .then((response) => response.data);
}

/**
 * `GET /listings/:id/completeness` — owner-or-`listing.update` gated
 * scoring used by the wizard's completeness widget (Review step).
 */
export function getListingCompleteness(id) {
  return apiClient
    .get(`/listings/${id}/completeness`)
    .then((response) => response.data);
}

/**
 * Stage 11.3 (Admin Platform — Listing Moderation) — admin-scoped
 * endpoints, all under `/listings/admin/*`. Every route requires
 * `listing.moderate` (see `module.routes.js`/`listingService.js`).
 */

/**
 * `GET /listings/admin` — every listing regardless of owner or publish
 * status, cursor-paginated.
 * @param {{ keyword?: string, moderationStatus?: string, status?: string, cursor?: string, limit?: number }} params
 */
export function getAdminListings(params) {
  return apiClient
    .get('/listings/admin', { params })
    .then((response) => response.data);
}

/** `GET /listings/admin/:id` — admin-only full listing detail, bypassing the publish-visibility rule. */
export function getAdminListingDetail(id) {
  return apiClient
    .get(`/listings/admin/${id}`)
    .then((response) => response.data);
}

/**
 * `PATCH /listings/admin/:id/moderation-status` — approve/reject/flag,
 * with an optional free-text `notes` (e.g. a rejection reason).
 */
export function updateListingModerationStatus(id, status, notes) {
  return apiClient
    .patch(`/listings/admin/${id}/moderation-status`, { status, notes })
    .then((response) => response.data);
}

/** `GET /listings/:id/menu` — public, no auth required. Pass 3 remediation (Restaurant vertical). */
export function getListingMenu(id, { locale } = {}) {
  return apiClient
    .get(`/listings/${id}/menu`, { params: { locale } })
    .then((response) => response.data);
}

/** `POST /listings/:id/menu` — owner-or-`listing.update`, RESTAURANT listings only. */
export function createListingMenu(id, body) {
  return apiClient
    .post(`/listings/${id}/menu`, body)
    .then((response) => response.data);
}

export function updateListingMenu(menuId, body) {
  return apiClient
    .patch(`/listings/menu/${menuId}`, body)
    .then((response) => response.data);
}

export function deleteListingMenu(menuId) {
  return apiClient
    .delete(`/listings/menu/${menuId}`)
    .then((response) => response.data);
}

export function createListingMenuSection(menuId, body) {
  return apiClient
    .post(`/listings/menu/${menuId}/sections`, body)
    .then((response) => response.data);
}

export function updateListingMenuSection(sectionId, body) {
  return apiClient
    .patch(`/listings/menu/sections/${sectionId}`, body)
    .then((response) => response.data);
}

export function deleteListingMenuSection(sectionId) {
  return apiClient
    .delete(`/listings/menu/sections/${sectionId}`)
    .then((response) => response.data);
}

export function createListingMenuItem(sectionId, body) {
  return apiClient
    .post(`/listings/menu/sections/${sectionId}/items`, body)
    .then((response) => response.data);
}

export function updateListingMenuItem(itemId, body) {
  return apiClient
    .patch(`/listings/menu/items/${itemId}`, body)
    .then((response) => response.data);
}

export function deleteListingMenuItem(itemId) {
  return apiClient
    .delete(`/listings/menu/items/${itemId}`)
    .then((response) => response.data);
}

/** `GET /listings/:id/opening-hours` — public, no auth required. Pass 6 (Restaurant vertical). */
export function getListingOpeningHours(id) {
  return apiClient
    .get(`/listings/${id}/opening-hours`)
    .then((response) => response.data);
}

/** `PUT /listings/:id/opening-hours` — owner-or-`listing.update`, full-replace. */
export function replaceListingOpeningHours(id, days) {
  return apiClient
    .put(`/listings/${id}/opening-hours`, { days })
    .then((response) => response.data);
}
