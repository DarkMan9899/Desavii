/**
 * `search` module public export surface (FRONTEND_ARCHITECTURE.md
 * §6.2) — the ONLY entry point other modules/pages may import from
 * (§6.3).
 */

export { default as SearchPageContent } from './components/SearchPageContent/SearchPageContent.jsx';
export { default as useCategoriesQuery } from './queries/useCategoriesQuery.js';
export { default as useDestinationsQuery } from './queries/useDestinationsQuery.js';
export { default as useSuggestionsQuery } from './queries/useSuggestionsQuery.js';

// Phase 6 (Listing Details): `RelatedListings` reuses these directly
// rather than reinventing a same-category listing fetch/card — `GET
// /search`'s flat DTO is exactly what a "more like this" strip needs.
export { default as useSearchListingsQuery } from './queries/useSearchListingsQuery.js';
export { default as SearchResultCard } from './components/SearchResultCard/SearchResultCard.jsx';

// Pass 6 (Restaurant vertical, owner issue #13/#15): `CategoryPageContent`
// (the `discovery` module) reuses this directly — the exact same
// category-scoped attribute filtering `SearchPageContent` already has,
// on the real indexable category landing page it was otherwise entirely
// missing from.
export { default as DynamicFilterPanel } from './components/DynamicFilterPanel/DynamicFilterPanel.jsx';
