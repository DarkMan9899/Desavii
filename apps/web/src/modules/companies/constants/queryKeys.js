/**
 * Companies query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `companies` React Query hook builds its key through this, mirroring
 * `modules/search/constants/queryKeys.js`.
 */

const companyKeys = {
  all: ['companies'],
  list: () => [...companyKeys.all, 'list'],
  detail: (slug) => [...companyKeys.all, 'detail', slug],
  // Company Public Profile (Step A2) — a company's own public listings.
  listings: (slug) => [...companyKeys.all, 'listings', slug],
};

export default companyKeys;
