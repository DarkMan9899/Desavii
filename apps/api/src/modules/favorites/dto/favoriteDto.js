/**
 * Favorites module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 */

export function toFavoritedListingResponse(item) {
  return {
    favorite_id: item.favoriteId,
    favorited_at: item.favoritedAt,
    listing_id: item.id,
    listing_type: item.listingTypeCode,
    status: item.statusCode,
    slug: item.slug,
    title: item.title,
    city_name: item.cityName,
    cover_image_url: item.coverImageUrl,
    price_amount: item.priceAmount ?? null,
    price_currency_code: item.priceCurrencyCode ?? null,
    rating_average: item.ratingAverage ?? null,
    review_count: item.reviewCount ?? 0,
    // Card-composition-closure fix — same fields/shape as
    // `searchDto.js`'s own `toSearchResultResponse`, so the shared
    // frontend card-metadata helper (`buildCategoryCardMeta.js`) works
    // identically for both DTOs. Real value or `null`, never guessed.
    category_slug: item.categorySlug ?? null,
    cuisine: item.cuisineCodes ?? null,
    price_tier: item.priceTierCode ?? null,
    star_rating: item.starRatingCode ?? null,
    transmission: item.transmissionCode ?? null,
    bedrooms: item.bedroomsValue ?? null,
    duration_minutes: item.durationMinutesValue ?? null,
  };
}
