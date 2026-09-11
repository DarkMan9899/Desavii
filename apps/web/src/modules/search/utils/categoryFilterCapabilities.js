/**
 * Category slug -> which of SearchFilters' fixed fields apply to it.
 * Mirrors `utils/categoryIcons.js`'s slug-keyed lookup pattern, so every
 * category-aware concern (icon, filter visibility, ...) is resolved the
 * same way rather than each growing its own ad-hoc switch.
 *
 * Guests only fails to apply for Car Rentals today (confirmed via live
 * QA: a vehicle rental has no "guests" concept — only pickup/return and
 * seat count, which the listing's own booking widget already gets right;
 * the global Search filter bar was the one surface still showing it
 * unconditionally). Every other category defaults to showing it rather
 * than inventing new per-vertical filter fields Search doesn't support
 * yet (e.g. tour participants) or fields not shown yet on the site.
 */
const SEARCH_FILTER_CAPABILITIES_BY_SLUG = {
  'car-rentals': { showGuests: false },
};

export function shouldShowGuestsFilter(categorySlug) {
  return SEARCH_FILTER_CAPABILITIES_BY_SLUG[categorySlug]?.showGuests ?? true;
}
