/**
 * AI Platform module — raw endpoint calls (FRONTEND_ARCHITECTURE.md
 * §3.1's `api/` contract). Mirrors `apps/api/src/modules/ai/module.routes.js`.
 * Every route requires authentication.
 */

import apiClient from './client.js';

/** `GET /ai/memory`. */
export function getAiMemory() {
  return apiClient.get('/ai/memory').then((response) => response.data);
}

/** `DELETE /ai/memory/:key`. */
export function deleteAiMemoryKey(key) {
  return apiClient
    .delete(`/ai/memory/${key}`)
    .then((response) => response.data);
}

/** `POST /ai/trip-planner` — `{destination, days, budget, currency?, interests?}`. */
export function planTrip({ destination, days, budget, currency, interests }) {
  return apiClient
    .post('/ai/trip-planner', {
      destination,
      days,
      budget,
      currency,
      interests,
    })
    .then((response) => response.data);
}

/** `GET /ai/trip-planner/:id`. */
export function getTripPlan(id) {
  return apiClient
    .get(`/ai/trip-planner/${id}`)
    .then((response) => response.data);
}

/** `GET /ai/search/availability` — public: `{available}`, true only when a real model answers. */
export function getAiSearchAvailability() {
  return apiClient
    .get('/ai/search/availability')
    .then((response) => response.data);
}

/** `POST /ai/search/parse` — `{query, locale?}`; the locale grounds destination/category names. */
export function parseSearchQuery(query, locale) {
  return apiClient
    .post('/ai/search/parse', { query, locale })
    .then((response) => response.data);
}

/** `POST /ai/assistant` — `{message, contextType?, contextId?, conversationId?}` (synchronous fallback for the streaming route). */
export function askAssistant(input) {
  return apiClient
    .post('/ai/assistant', input)
    .then((response) => response.data);
}

/** `GET /ai/assistant/conversations`. */
export function listAssistantConversations() {
  return apiClient
    .get('/ai/assistant/conversations')
    .then((response) => response.data);
}

/** `GET /ai/assistant/conversations/:id`. */
export function getAssistantConversation(id) {
  return apiClient
    .get(`/ai/assistant/conversations/${id}`)
    .then((response) => response.data);
}

/** `DELETE /ai/assistant/conversations/:id`. */
export function deleteAssistantConversation(id) {
  return apiClient
    .delete(`/ai/assistant/conversations/${id}`)
    .then((response) => response.data);
}

/** `GET /ai/recommendations`. */
export function getRecommendations() {
  return apiClient.get('/ai/recommendations').then((response) => response.data);
}

/** `POST /ai/partner/listings/:listingId/description`. */
export function generateListingDescription(listingId) {
  return apiClient
    .post(`/ai/partner/listings/${listingId}/description`)
    .then((response) => response.data);
}

/** `POST /ai/partner/listings/:listingId/seo`. */
export function generateListingSeo(listingId) {
  return apiClient
    .post(`/ai/partner/listings/${listingId}/seo`)
    .then((response) => response.data);
}

/** `POST /ai/partner/listings/:listingId/title` — `{keyFeature?}`. */
export function generateListingTitle(listingId, keyFeature) {
  return apiClient
    .post(`/ai/partner/listings/${listingId}/title`, { keyFeature })
    .then((response) => response.data);
}

/** `POST /ai/partner/listings/:listingId/amenities`. */
export function generateListingAmenities(listingId) {
  return apiClient
    .post(`/ai/partner/listings/${listingId}/amenities`)
    .then((response) => response.data);
}

/** `POST /ai/partner/listings/:listingId/translate` — `{targetLanguageCode}`. */
export function translateListing(listingId, targetLanguageCode) {
  return apiClient
    .post(`/ai/partner/listings/${listingId}/translate`, {
      targetLanguageCode,
    })
    .then((response) => response.data);
}

/** `POST /ai/partner/listings/:listingId/faqs`. */
export function generateListingFaqs(listingId) {
  return apiClient
    .post(`/ai/partner/listings/${listingId}/faqs`)
    .then((response) => response.data);
}

/** `GET /ai/admin/moderation-queue` — admin-only (`ai.admin_tools`). */
export function getModerationQueue(limit) {
  return apiClient
    .get('/ai/admin/moderation-queue', { params: { limit } })
    .then((response) => response.data);
}

/** `POST /ai/admin/moderation/:listingId/score` — admin-only (`ai.admin_tools`). */
export function scoreListing(listingId) {
  return apiClient
    .post(`/ai/admin/moderation/${listingId}/score`)
    .then((response) => response.data);
}

/** `GET /ai/admin/usage` — admin-only (`ai.usage_view`). */
export function getAiUsage(since) {
  return apiClient
    .get('/ai/admin/usage', { params: { since } })
    .then((response) => response.data);
}

/** `GET /ai/partner/usage` — the caller must be an OWNER of `partnerId`. */
export function getPartnerAiUsage(partnerId, since) {
  return apiClient
    .get('/ai/partner/usage', { params: { partnerId, since } })
    .then((response) => response.data);
}
