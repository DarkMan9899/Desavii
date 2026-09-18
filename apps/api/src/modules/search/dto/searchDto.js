/**
 * Search module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 *
 * Search results are a list/card view, not the full listing detail —
 * matching `modules/listings/dto/listingDto.js`'s `toListingSummaryResponse`
 * precedent ("summary, not full detail" for list endpoints).
 */

export function toSearchResultResponse(result) {
  return {
    id: result.id,
    partner_id: result.partnerId,
    listing_type: result.listingTypeCode,
    slug: result.slug,
    status: result.statusCode,
    title: result.title,
    summary: result.summary,
    city_id: result.cityId,
    city_name: result.cityName,
    country_id: result.countryId,
    cover_image_url: result.coverImageUrl,
    // Phase 10 (redesign): additive — `listing_pricing` is a 1:1 table
    // (PRIMARY KEY(listing_id)) already joined safely; `null` for a
    // listing with no pricing row set yet, never fabricated.
    price_amount: result.priceAmount ?? null,
    price_currency_code: result.priceCurrencyCode ?? null,
    media_count: result.mediaCount,
    // Phase 12 (Product Polish): read-only aggregate from the Reviews
    // module, same "null/0 for none yet, never omitted" convention as
    // `listingDto.js`'s `toListingResponse`.
    rating_average: result.ratingAverage ?? null,
    review_count: result.reviewCount ?? 0,
    created_at: result.createdAt,
    // Pass 7 (category-specific visual identity): `listing_type` alone
    // can't distinguish e.g. Apartments/Villas/Guest Houses (all
    // PROPERTY) or Attractions/Entertainment (both ATTRACTION) — cards
    // resolve their category-precise presentation from this slug,
    // falling back to `listing_type` only if it's ever absent.
    category_slug: result.categorySlug ?? null,
    // Restaurant-only today (brief §9/§22's deferred card metadata) —
    // `null` for every other category and for a Restaurant not yet
    // authored with these attributes, never fabricated.
    cuisine: result.cuisineCodes ?? null,
    price_tier: result.priceTierCode ?? null,
    // Emergency premium card redesign — one real "headline" attribute
    // fact per remaining category (Hotels/Car Rentals/Apartments-Villas-
    // Guest Houses/Tours-Attractions-Entertainment), same "null when never
    // authored, never fabricated" rule as cuisine/price_tier above. The
    // frontend picks which single field its own category actually shows.
    star_rating: result.starRatingCode ?? null,
    transmission: result.transmissionCode ?? null,
    bedrooms: result.bedroomsValue ?? null,
    duration_minutes: result.durationMinutesValue ?? null,
    // Step A3.1 (Engagement Analytics): `promotion_id` — the opaque
    // advertisement id `promotion_impression`/`promotion_clicked` need —
    // is present ONLY when `result` genuinely came from
    // `AdvertisementService#hydrate` (Home Featured/Category TOP), which
    // is the only caller that ever sets `.promotionId` on the domain
    // object in the first place. An ordinary `GET /search` row never has
    // this property at all, so the key is truly absent from its JSON,
    // not merely `null` — never a fabricated/globally-added field on
    // organic results.
    ...(result.promotionId !== undefined
      ? { promotion_id: result.promotionId }
      : {}),
  };
}

/**
 * Listing Lifetime / Renewal, Step B5 — the Partner listing-management
 * table's (`PartnerListingsList.jsx`, via `useMyListingsQuery`) own row
 * shape: everything `toSearchResultResponse` already exposes, plus the 5
 * lifecycle fields the brief requires for the status badge/countdown/Renew
 * UI. `searchController.js` only ever calls this for the exact same
 * elevated population that can already see a non-PUBLISHED listing's card
 * through this endpoint (`searchService.js`'s own `isOwnerView`) — a
 * public/anonymous caller always gets `toSearchResultResponse` instead, so
 * these 5 fields can never reach a public Search/Category/Home response.
 * `expiry_reminder_sent_at` is deliberately NOT included (brief §14 — no
 * concrete Partner UX need for it).
 */
export function toOwnerSearchResultResponse(result) {
  return {
    ...toSearchResultResponse(result),
    publication_period_days: result.publicationPeriodDays ?? null,
    expires_at: result.expiresAt ?? null,
    frozen_at: result.frozenAt ?? null,
    purge_after: result.purgeAfter ?? null,
    renewed_at: result.renewedAt ?? null,
  };
}

export function toCategoryResultResponse(category) {
  return {
    id: category.id,
    parent_id: category.parentId,
    slug: category.slug,
    name: category.name,
    listing_count: category.listingCount,
  };
}

/** Phase 20 (SEO) — `GET /search/destinations`, mirrors `toCategoryResultResponse`'s shape for the city equivalent. */
export function toDestinationResultResponse(destination) {
  return {
    id: destination.id,
    slug: destination.slug,
    name: destination.name,
    latitude: destination.latitude,
    longitude: destination.longitude,
    listing_count: destination.listingCount,
  };
}

export function toSuggestionResponse(suggestion) {
  return {
    id: suggestion.id,
    title: suggestion.title,
    slug: suggestion.slug,
  };
}

/**
 * `GET /search/filters` response. `code` fields (group/filter/option) are
 * stable, backend-declared identifiers — the frontend resolves display
 * labels via its own i18n catalog (`search.filters.<code>`), not a DB
 * translation lookup: `filter_definition_translations`/`attribute_option_
 * translations` exist in the schema for a future CMS-driven catalog but
 * carry no seed data yet, so the label authority lives in i18n for now.
 */
export function toFilterGroupsResponse(groups) {
  return {
    groups: groups.map((group) => ({
      code: group.code,
      definitions: group.definitions.map((definition) => ({
        code: definition.code,
        input_type: definition.inputType,
        value_source: definition.valueSource,
        unit: definition.unit,
        min: definition.min,
        max: definition.max,
        is_multi_valued: definition.isMultiValued,
        options: definition.options.map((option) => ({
          value: option.value,
          code: option.code,
        })),
      })),
    })),
  };
}
