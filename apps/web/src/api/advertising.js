/**
 * Advertising module — raw endpoint calls (FRONTEND_ARCHITECTURE.md
 * §3.1's `api/` contract). Mirrors `apps/api/src/modules/advertising/
 * module.routes.js` exactly — no endpoint is called here that doesn't
 * exist on the backend.
 */

import apiClient from './client.js';

/** `GET /advertising/public/home-featured` — active Home-placement promoted listings, in `search`'s own card DTO shape. */
export function getPublicHomeFeatured(params) {
  return apiClient
    .get('/advertising/public/home-featured', { params })
    .then((response) => response.data);
}

/** `GET /advertising/public/category-top` — active Category-placement promoted listings for one category. */
export function getPublicCategoryTop(params) {
  return apiClient
    .get('/advertising/public/category-top', { params })
    .then((response) => response.data);
}

/** `GET /advertising/admin/catalog` — the two in-scope placements + their seeded product/pricing catalog. */
export function getPlacementCatalog() {
  return apiClient
    .get('/advertising/admin/catalog')
    .then((response) => response.data);
}

/** `GET /advertising/admin` — admin promotion management list. */
export function listAdvertisements(params) {
  return apiClient
    .get('/advertising/admin', { params })
    .then((response) => response.data);
}

/** `GET /advertising/admin/:id`. */
export function getAdvertisement(id) {
  return apiClient
    .get(`/advertising/admin/${id}`)
    .then((response) => response.data);
}

/** `POST /advertising/admin` — Admin creates (and optionally immediately activates) a promotion. */
export function createAdvertisement(body) {
  return apiClient
    .post('/advertising/admin', body)
    .then((response) => response.data);
}

/** `POST /advertising/admin/:id/mark-paid`. */
export function markAdvertisementPaid(id) {
  return apiClient
    .post(`/advertising/admin/${id}/mark-paid`)
    .then((response) => response.data);
}

/** `POST /advertising/admin/:id/approve`. */
export function approveAdvertisement(id) {
  return apiClient
    .post(`/advertising/admin/${id}/approve`)
    .then((response) => response.data);
}

/** `POST /advertising/admin/:id/reject`. */
export function rejectAdvertisement(id) {
  return apiClient
    .post(`/advertising/admin/${id}/reject`)
    .then((response) => response.data);
}

/** `POST /advertising/admin/:id/cancel`. */
export function cancelAdvertisement(id) {
  return apiClient
    .post(`/advertising/admin/${id}/cancel`)
    .then((response) => response.data);
}

/** `POST /advertising/admin/:id/extend`. */
export function extendAdvertisement(id, body) {
  return apiClient
    .post(`/advertising/admin/${id}/extend`, body)
    .then((response) => response.data);
}
