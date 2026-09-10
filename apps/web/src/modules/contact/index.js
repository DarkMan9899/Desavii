/**
 * `contact` module public export surface (FRONTEND_ARCHITECTURE.md §6.2)
 * — the ONLY entry point other modules/pages may import from.
 */

export { default as contactKeys } from './constants/queryKeys.js';
export { default as useSubmitContactInquiryMutation } from './mutations/useSubmitContactInquiryMutation.js';
export { default as useAdminContactInquiriesQuery } from './queries/useAdminContactInquiriesQuery.js';
export { default as useAdminContactInquiryDetailQuery } from './queries/useAdminContactInquiryDetailQuery.js';
export { default as useResolveContactInquiryMutation } from './mutations/useResolveContactInquiryMutation.js';
