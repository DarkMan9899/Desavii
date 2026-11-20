/**
 * detailCardDto — the Listing Detail response re-expressed in the flat
 * card-DTO fields (`listingCardFactsDto.js` on the API), so the page's
 * rating and features come from the very same rules every listing card
 * uses (`listingCardModel.js`, `listingCardFacts.js`) — one rule set, never
 * a second interpretation.
 *
 * - amenities: the listing's amenities as stable codes, from the category
 *   metadata (which only lists amenities that apply to the category).
 */

function amenityCodes(amenityIds, metadata) {
  const ids = new Set(amenityIds ?? []);
  return (metadata?.amenity_groups ?? [])
    .flatMap((group) => group.amenities)
    .filter((amenity) => ids.has(amenity.value) && amenity.key)
    .map((amenity) => amenity.key);
}

/**
 * @param {object} listing - the Listing Detail response.
 * @param {object|undefined} metadata - the category metadata.
 */
export function toDetailCardDto(listing, metadata) {
  return {
    rating_average: listing.rating_average,
    review_count: listing.review_count,
    amenities: amenityCodes(listing.amenity_ids, metadata),
  };
}

export default toDetailCardDto;
