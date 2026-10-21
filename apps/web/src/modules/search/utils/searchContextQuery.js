/**
 * The booking context a Search result link carries to its listing page:
 * the visitor's own `dateFrom` / `dateTo` / `guests`, the exact keys
 * `ListingReservationWidget` prefills from (`listings/utils/
 * reservationSearchContext.js`), which re-validates them and asks for
 * fresh availability and price — Search never vouches for either. Shared
 * by the result cards and the map preview's "Learn more", so both open
 * the listing with the same context. A key that is absent is omitted (a
 * keyword-only search links to a bare listing URL, never "?dateFrom=null").
 */

export const SEARCH_CONTEXT_KEYS = Object.freeze([
  'dateFrom',
  'dateTo',
  'guests',
]);

/** @param {URLSearchParams} searchParams - the Search page's own URL */
export function buildSearchContextQuery(searchParams) {
  const query = new URLSearchParams();
  SEARCH_CONTEXT_KEYS.forEach((key) => {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

/** The listing page for a result, with the Search's booking context. */
export function buildListingHref(locale, result, searchParams) {
  return `/${locale}/listings/${result.slug ?? result.id}${buildSearchContextQuery(searchParams)}`;
}

export default buildSearchContextQuery;
