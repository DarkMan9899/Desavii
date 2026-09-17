/**
 * Partners module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 */

export function toPartnershipResponse(membership) {
  return {
    partner_id: membership.partnerId,
    slug: membership.slug,
    display_name: membership.displayName,
    role: membership.roleCode,
    // P1.2 (Master Roadmap) — additive.
    verification_status: membership.verificationStatusCode,
  };
}

/** Companies directory row — Phase 10. */
export function toPartnerSummaryResponse(partner) {
  return {
    id: partner.id,
    slug: partner.slug,
    display_name: partner.displayName,
    description: partner.description,
    logo_url: partner.logoUrl,
    cover_url: partner.coverUrl,
    listing_count: partner.listingCount,
    is_verified: partner.isVerified,
    member_since: partner.memberSince,
    rating_average: partner.ratingAverage,
    review_count: partner.reviewCount,
  };
}

/**
 * Company Public Profile (Step A1) — one row of a partner's public
 * catalog. Same field names/shapes `searchDto.js`'s own
 * `toSearchResultResponse` uses for the equivalent fields (`category_slug`,
 * `cuisine`, `price_tier`, `star_rating`, `transmission`, `bedrooms`,
 * `duration_minutes`) — a parallel DTO, not a cross-module import (same
 * "each module keeps its own DTO function" convention `favoriteDto.js`'s
 * own `toFavoritedListingResponse` already established) — so the shared
 * frontend `buildCategoryCardMeta`/`resolveCardConfig` utilities work
 * against this response unchanged, once a future step wires the card UI
 * up. `partner_id`/`summary`/`media_count` are deliberately not included
 * this pass — not required to resolve `categoryVisualKey`/price unit/
 * metadata, matching the same "real field exists, out of scope this
 * pass" precedent `summary` already has on Favorites cards.
 */
export function toPartnerListingResponse(item) {
  return {
    id: item.id,
    slug: item.slug,
    listing_type: item.listingTypeCode,
    title: item.title,
    city_name: item.cityName,
    cover_image_url: item.coverImageUrl,
    price_amount: item.priceAmount ?? null,
    price_currency_code: item.priceCurrencyCode ?? null,
    rating_average: item.ratingAverage ?? null,
    review_count: item.reviewCount ?? 0,
    category_slug: item.categorySlug ?? null,
    cuisine: item.cuisineCodes ?? null,
    price_tier: item.priceTierCode ?? null,
    star_rating: item.starRatingCode ?? null,
    transmission: item.transmissionCode ?? null,
    bedrooms: item.bedroomsValue ?? null,
    duration_minutes: item.durationMinutesValue ?? null,
  };
}

/**
 * Localized-translation rows — shared shape between the public detail
 * response and the owner/admin detail response below, matching
 * `listingDto.js`'s `toTranslationResponse` field names exactly so the
 * frontend's one `getLocalizedTranslation` util works against either.
 */
function toTranslationResponse(translation) {
  return {
    language_id: translation.languageId,
    language_code: translation.languageCode,
    description: translation.description,
  };
}

/**
 * Company profile — Phase 10. Additive to the summary shape above.
 * P1.3 (Master Roadmap): `translations` is the real, locale-aware
 * source of truth for `description` — `description` itself (inherited
 * from `toPartnerSummaryResponse`) stays as the "any available"
 * fallback a directory card snippet is fine with; a reader on the
 * company's own page should resolve `translations` instead (see
 * `getLocalizedTranslation`, reused from the listings module).
 */
export function toPartnerDetailResponse(partner) {
  return {
    ...toPartnerSummaryResponse(partner),
    email: partner.email,
    phone: partner.phone,
    website: partner.website,
    social_links: partner.socialLinks,
    translations: (partner.translations ?? []).map(toTranslationResponse),
  };
}

/** Stage 11.2 admin list row — every partner, both status codes surfaced. */
export function toAdminPartnerSummaryResponse(partner) {
  return {
    id: partner.id,
    slug: partner.slug,
    display_name: partner.displayName,
    email: partner.email,
    logo_url: partner.logoUrl,
    verification_status: partner.verificationStatusCode,
    moderation_status: partner.moderationStatusCode,
    listing_count: partner.listingCount,
    created_at: partner.createdAt,
  };
}

/**
 * Stage 11.2 admin detail — additive to the admin summary shape above.
 * Also the shape returned by every P1.2 self-service application
 * endpoint AND P1.3's owner/staff company-profile endpoints (same
 * underlying repository read, owner/staff-gated or permission-gated
 * depending on the route). P1.3: `description` (flat) dropped in favor
 * of `translations`, `cover_url`/`social_links` added — an approved
 * partner's profile editor needs both, and the P1.2 admin review UI
 * never rendered `description` in the first place (nothing to break).
 */
export function toAdminPartnerDetailResponse(partner) {
  return {
    ...toAdminPartnerSummaryResponse(partner),
    legal_name: partner.legalName,
    phone: partner.phone,
    website: partner.website,
    cover_url: partner.coverUrl,
    social_links: partner.socialLinks,
    review_note: partner.reviewNote ?? null,
    total_listing_count: partner.totalListingCount,
    published_listing_count: partner.publishedListingCount,
    translations: (partner.translations ?? []).map(toTranslationResponse),
    owner: partner.ownerEmail
      ? {
          email: partner.ownerEmail,
          first_name: partner.ownerFirstName,
          last_name: partner.ownerLastName,
        }
      : null,
  };
}
