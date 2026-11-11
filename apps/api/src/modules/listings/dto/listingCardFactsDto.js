/**
 * The card-facts part of every public listing-card response (Search list
 * and map, the Home Featured / Category TOP feeds, Favorites, the Company
 * profile) — the response half of `listingCardMetadataSql.js`, shared for
 * the same reason: one fact set, one shape, on every card surface
 * (docs/LISTING_CARDS.md).
 *
 * Every value is the stored one or null; `amenities` is the listing's
 * card-worthy amenities (`CARD_AMENITY_CODES`), `[]` when it lists none;
 * `reservable` is true only when the listing has a real restaurant table.
 */
export function toCardFactsResponse(card) {
  return {
    category_slug: card.categorySlug ?? null,
    cuisine: card.cuisineCodes ?? null,
    price_tier: card.priceTierCode ?? null,
    star_rating: card.starRatingCode ?? null,
    transmission: card.transmissionCode ?? null,
    bedrooms: card.bedroomsValue ?? null,
    duration_minutes: card.durationMinutesValue ?? null,
    max_guests: card.maxGuestsValue ?? null,
    seats: card.seatsValue ?? null,
    min_age: card.minAgeValue ?? null,
    max_group_size: card.maxGroupSizeValue ?? null,
    tour_format: card.tourFormatCode ?? null,
    body_type: card.bodyTypeCode ?? null,
    fuel_type: card.fuelTypeCode ?? null,
    attraction_type: card.attractionTypeCode ?? null,
    visit_format: card.visitFormatCode ?? null,
    venue_type: card.venueTypeCode ?? null,
    languages_offered: card.languagesOfferedCodes ?? null,
    amenities: card.amenityCodes ?? [],
    reservable: card.isReservable === true,
    // Step L6.2H1: the price basis cards label `price_amount` with.
    pricing_model: card.pricingModelCode ?? null,
  };
}

export default toCardFactsResponse;
