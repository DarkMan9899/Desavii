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
  // `locale` (Step A4) is part of the key — listing titles are now
  // locale-aware, so switching locale must fetch a fresh page, not reuse
  // a cached one rendered in a different language.
  listings: (slug, locale) => [...companyKeys.all, 'listings', slug, locale],
};

export default companyKeys;
