/** AI Search response DTO (Stage 15.2). */

export function toParsedSearchResponse(parsed) {
  return {
    keyword: parsed.keyword,
    category_id: parsed.categoryId,
    category_name: parsed.categoryName,
    city_id: parsed.cityId,
    city_name: parsed.cityName,
    amenity_ids: parsed.amenityIds,
  };
}

/** Only whether AI search is available — never which provider or model. */
export function toAiSearchAvailabilityResponse({ available }) {
  return { available };
}

export default toParsedSearchResponse;
