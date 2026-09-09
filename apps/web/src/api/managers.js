/**
 * Managers module — raw endpoint calls (FRONTEND_ARCHITECTURE.md §3.1's
 * `api/` contract). Mirrors `apps/api/src/modules/managers/module.routes.js`
 * exactly.
 */

import apiClient from './client.js';

// --- Admin-side ---

/** `POST /managers/admin/promote` — grants the global MANAGER role to an existing user. */
export function promoteToManager(userId) {
  return apiClient
    .post('/managers/admin/promote', { userId })
    .then((response) => response.data);
}

/** `GET /managers/admin` — the full Manager roster with live assignment counts. */
export function listManagers(params) {
  return apiClient
    .get('/managers/admin', { params })
    .then((response) => response.data);
}

/** `GET /managers/admin/:userId` — one Manager's assignments + cross-company dashboard. */
export function getManagerDetail(userId) {
  return apiClient
    .get(`/managers/admin/${userId}`)
    .then((response) => response.data);
}

/** `GET /managers/admin/:userId/analytics` — Admin reviewing one Manager's performance. */
export function getAdminManagerAnalytics(userId, params) {
  return apiClient
    .get(`/managers/admin/${userId}/analytics`, { params })
    .then((response) => response.data);
}

/** `POST /managers/admin/:userId/companies` — assigns a company to a Manager. */
export function assignCompanyToManager(userId, partnerId) {
  return apiClient
    .post(`/managers/admin/${userId}/companies`, { partnerId })
    .then((response) => response.data);
}

/** `DELETE /managers/admin/:userId/companies/:partnerId` — unassigns a company from a Manager. */
export function unassignCompanyFromManager(userId, partnerId) {
  return apiClient
    .delete(`/managers/admin/${userId}/companies/${partnerId}`)
    .then((response) => response.data);
}

// --- Manager self-service ---

/** `GET /managers/mine/companies` — the caller's own assigned companies. */
export function getMyManagedCompanies() {
  return apiClient
    .get('/managers/mine/companies')
    .then((response) => response.data);
}

/** `GET /managers/mine/dashboard` — the caller's cross-company summary. */
export function getMyManagerDashboard() {
  return apiClient
    .get('/managers/mine/dashboard')
    .then((response) => response.data);
}

/** `GET /managers/mine/analytics` — the caller's filtered breakdown. */
export function getMyManagerAnalytics(params) {
  return apiClient
    .get('/managers/mine/analytics', { params })
    .then((response) => response.data);
}
