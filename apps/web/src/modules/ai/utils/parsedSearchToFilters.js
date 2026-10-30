/**
 * parsedSearchToFilters — a parsed AI search (`POST /ai/search/parse`)
 * as a canonical Search filter patch: the keyword phrase, and the real
 * category, destination and amenity ids the server resolved from the
 * catalog. One mapping for every AI search surface (the Search page's
 * `AiSearchBar` and Home's Ask Desavii), so they can never disagree about
 * what an interpretation means for `/search`.
 */

export default function parsedSearchToFilters(parsed) {
  const amenityIds = parsed.amenity_ids ?? [];
  return {
    destination: parsed.keyword ?? '',
    categoryId: parsed.category_id ?? undefined,
    cityId: parsed.city_id ?? undefined,
    dynamicFilters:
      amenityIds.length > 0 ? { amenityIds: amenityIds.join(',') } : {},
  };
}
