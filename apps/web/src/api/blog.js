/**
 * Blog module — raw endpoint calls (FRONTEND_ARCHITECTURE.md §3.1's
 * `api/` contract). Mirrors `apps/api/src/modules/blog/module.routes.js`
 * (Sprint H).
 */

import apiClient from './client.js';

// --- Public ---

export function listPublicPosts(params) {
  return apiClient
    .get('/blog/posts', { params })
    .then((response) => response.data);
}

export function getPublicPost(slug, locale) {
  return apiClient
    .get(`/blog/posts/${slug}`, { params: { locale } })
    .then((response) => response.data);
}

export function listPublicCategories(locale) {
  return apiClient
    .get('/blog/categories', { params: { locale } })
    .then((response) => response.data);
}

export function listPublicTags(locale) {
  return apiClient
    .get('/blog/tags', { params: { locale } })
    .then((response) => response.data);
}

// --- Admin/Marketing (`blog.manage` / `blog.publish`) ---

export function createDraft(payload) {
  return apiClient
    .post('/blog/admin/posts', payload)
    .then((response) => response.data);
}

export function getAdminPosts(params) {
  return apiClient
    .get('/blog/admin/posts', { params })
    .then((response) => response.data);
}

export function getAdminPostDetail(id) {
  return apiClient
    .get(`/blog/admin/posts/${id}`)
    .then((response) => response.data);
}

export function updatePostSettings(id, payload) {
  return apiClient
    .patch(`/blog/admin/posts/${id}`, payload)
    .then((response) => response.data);
}

export function upsertPostTranslation(id, languageCode, payload) {
  return apiClient
    .put(`/blog/admin/posts/${id}/translations/${languageCode}`, payload)
    .then((response) => response.data);
}

/** `POST /blog/admin/posts/:id/cover` — raw binary body, matching `module.routes.js`'s `express.raw()` scoping. */
export function attachCoverImage(id, file, altText) {
  return apiClient
    .post(`/blog/admin/posts/${id}/cover`, file, {
      headers: { 'Content-Type': file.type },
      params: altText ? { altText } : undefined,
    })
    .then((response) => response.data);
}

export function removeCoverImage(id) {
  return apiClient
    .delete(`/blog/admin/posts/${id}/cover`)
    .then((response) => response.data);
}

export function publishPost(id) {
  return apiClient
    .post(`/blog/admin/posts/${id}/publish`)
    .then((response) => response.data);
}

export function unpublishPost(id) {
  return apiClient
    .post(`/blog/admin/posts/${id}/unpublish`)
    .then((response) => response.data);
}

export function schedulePost(id, scheduledAt) {
  return apiClient
    .post(`/blog/admin/posts/${id}/schedule`, { scheduledAt })
    .then((response) => response.data);
}

export function unschedulePost(id) {
  return apiClient
    .post(`/blog/admin/posts/${id}/unschedule`)
    .then((response) => response.data);
}

// --- Marketing role assignment (`marketing.assign`, Admin-only) ---

export function promoteToMarketing(userId) {
  return apiClient
    .post('/blog/admin/marketing-role/promote', { userId })
    .then((response) => response.data);
}

export function demoteFromMarketing(userId) {
  return apiClient
    .post('/blog/admin/marketing-role/demote', { userId })
    .then((response) => response.data);
}
