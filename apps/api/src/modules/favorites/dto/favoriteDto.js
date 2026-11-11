import { toCardFactsResponse } from '../../listings/dto/listingCardFactsDto.js';

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
    // The shared card facts (`listings/dto/listingCardFactsDto.js`).
    ...toCardFactsResponse(item),
  };
}
