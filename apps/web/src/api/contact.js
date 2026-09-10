/**
 * Contact module — raw endpoint calls (FRONTEND_ARCHITECTURE.md §3.1's
 * `api/` contract). Mirrors `apps/api/src/modules/contact/module.routes.js`
 * (Sprint G).
 */

import apiClient from './client.js';

/**
 * `POST /contact` — public, no auth, rate-limited server-side.
 * `{ inquiryType, name, email, subject, message }`.
 */
export function submitContactInquiry(payload) {
  return apiClient.post('/contact', payload).then((response) => response.data);
}

/** `GET /contact/admin?limit=&status=` — the Admin inbox. Requires `contact.manage`. */
export function getAdminContactInquiries(params) {
  return apiClient
    .get('/contact/admin', { params })
    .then((response) => response.data);
}

/** `GET /contact/admin/:id`. Requires `contact.manage`. */
export function getAdminContactInquiryDetail(id) {
  return apiClient
    .get(`/contact/admin/${id}`)
    .then((response) => response.data);
}

/** `POST /contact/admin/:id/resolve`. Requires `contact.manage`. */
export function resolveContactInquiry(id) {
  return apiClient
    .post(`/contact/admin/${id}/resolve`)
    .then((response) => response.data);
}
