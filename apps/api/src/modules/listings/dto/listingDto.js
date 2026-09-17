/**
 * Listings module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 *
 * Listings' domain shape (nested translations/location/categories/
 * amenities/media) is richer than Users', so — like `modules/auth/dto/
 * authDto.js` — the mapping lives in its own file rather than inlined in
 * the Controller.
 */

export function toTranslationResponse(translation) {
  return {
    language_id: translation.languageId,
    language_code: translation.languageCode,
    title: translation.title,
    summary: translation.summary,
    description: translation.description,
    seo_title: translation.seoTitle,
    seo_description: translation.seoDescription,
  };
}

export function toLocationResponse(location) {
  if (!location) return null;
  return {
    address_id: location.addressId,
    city_id: location.cityId,
    city_name: location.cityName,
    country_name: location.countryName,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export function toMediaResponse(media) {
  return {
    id: media.id,
    media_type: media.mediaTypeCode,
    url: media.url,
    thumbnail_url: media.thumbnailUrl,
    position: media.position,
    is_cover: media.isCover,
    moderation_status: media.moderationStatusCode,
    mime_type: media.mimeType,
    file_size_bytes: media.fileSizeBytes,
    created_at: media.createdAt,
    alt_text: media.altText ?? null,
    caption: media.caption ?? null,
  };
}

function toAttributeValueResponse(entry) {
  if (entry.optionCodes) {
    return { code: entry.code, option_codes: entry.optionCodes };
  }
  return { code: entry.code, value: entry.value };
}

function toPolicyValueResponse(entry) {
  return { code: entry.code, value: entry.value };
}

function toPricingResponse(pricing) {
  if (!pricing) return null;
  return {
    pricing_model: pricing.pricingModelCode,
    amount: pricing.amount,
    currency: pricing.currencyCode,
  };
}

function toBookingRulesResponse(bookingRules) {
  if (!bookingRules) return null;
  return {
    minimum_stay_nights: bookingRules.minimumStayNights,
    maximum_stay_nights: bookingRules.maximumStayNights,
    advance_booking_min_hours: bookingRules.advanceBookingMinHours,
    advance_booking_max_days: bookingRules.advanceBookingMaxDays,
  };
}

export function toHighlightResponse(highlight) {
  return {
    id: highlight.id,
    language_code: highlight.languageCode,
    icon_code: highlight.iconCode,
    text: highlight.text,
  };
}

export function toItineraryStepResponse(step) {
  return {
    id: step.id,
    language_code: step.languageCode,
    title: step.title,
    description: step.description,
    duration_minutes: step.durationMinutes,
  };
}

export function toIncludedItemResponse(item) {
  return {
    id: item.id,
    language_code: item.languageCode,
    item_text: item.itemText,
    is_included: item.isIncluded,
  };
}

export function toFaqResponse(faq) {
  return {
    id: faq.id,
    language_code: faq.languageCode,
    question: faq.question,
    answer: faq.answer,
  };
}

/**
 * Step A3 (Listing → Company Linking) — the listing detail page's company
 * attribution block. `null` when the owning partner isn't currently
 * publicly eligible (see `mysqlListingRepository.js#getPublicCompanySummary`)
 * — the listing itself still renders, it just loses its attribution.
 * Deliberately excludes anything not already public elsewhere (no
 * `email`/`phone`/`owner_user_id`/`legal_name`).
 */
export function toCompanyAttributionResponse(company) {
  if (!company) return null;
  return {
    slug: company.slug,
    display_name: company.displayName,
    logo_url: company.logoUrl,
    is_verified: company.isVerified,
  };
}

export function toListingResponse(listing) {
  return {
    id: listing.id,
    partner_id: listing.partnerId,
    listing_type: listing.listingTypeCode,
    slug: listing.slug,
    status: listing.statusCode,
    moderation_status: listing.moderationStatusCode,
    is_contact_visible: listing.isContactVisible,
    is_featured: listing.isFeatured,
    published_at: listing.publishedAt,
    unpublished_at: listing.unpublishedAt,
    archived_at: listing.archivedAt,
    canonical_url: listing.canonicalUrl,
    og_image_media_id: listing.ogImageMediaId,
    is_indexable: listing.isIndexable,
    is_sitemap_included: listing.isSitemapIncluded,
    translations: listing.translations.map(toTranslationResponse),
    location: toLocationResponse(listing.location),
    category_ids: listing.categoryIds,
    amenity_ids: listing.amenityIds,
    media: listing.media.map(toMediaResponse),
    attribute_values: listing.attributeValues.map(toAttributeValueResponse),
    policy_values: listing.policyValues.map(toPolicyValueResponse),
    pricing: toPricingResponse(listing.pricing),
    booking_rules: toBookingRulesResponse(listing.bookingRules),
    // Phase 12 (Product Polish): read-only aggregate from the Reviews
    // module — `null`/`0` for a listing with no approved reviews yet,
    // never omitted (a consistent shape is easier for the frontend to
    // render than an optional field).
    rating_average: listing.ratingAverage ?? null,
    review_count: listing.reviewCount ?? 0,
    // Phase 18 (Premium Listing Detail): partner-authored structured
    // content the Generic Attribute Engine can't express (ordered lists
    // of free text) — see migration 0026_listing_rich_content.
    highlights: (listing.highlights ?? []).map(toHighlightResponse),
    itinerary_steps: (listing.itinerarySteps ?? []).map(
      toItineraryStepResponse,
    ),
    included_items: (listing.includedItems ?? []).map(toIncludedItemResponse),
    faqs: (listing.faqs ?? []).map(toFaqResponse),
    // Step A3 (Listing → Company Linking): `undefined` (not fetched by a
    // caller that never asked, e.g. some other DTO reusing `listing`'s
    // shape) stays `undefined`-safe via `?? null`; a real, resolved
    // lookup is either a company object or `null`.
    company: toCompanyAttributionResponse(listing.company ?? null),
    created_at: listing.createdAt,
    updated_at: listing.updatedAt,
  };
}

/**
 * P2.1: admin-only variant of `toListingResponse` — adds
 * `moderation_notes` (already fetched by the repository, but never
 * exposed by the shared response, since that DTO also serves the public
 * `GET /listings/:id` route and a rejection/moderation note is internal
 * admin-facing content, not something to leak to a public visitor).
 */
export function toListingAdminDetailResponse(listing) {
  return {
    ...toListingResponse(listing),
    moderation_notes: listing.moderationNotes ?? null,
  };
}

export function toListingSummaryResponse(listing) {
  return {
    id: listing.id,
    partner_id: listing.partnerId,
    listing_type: listing.listingTypeCode,
    slug: listing.slug,
    status: listing.statusCode,
    is_featured: listing.isFeatured,
    created_at: listing.createdAt,
    updated_at: listing.updatedAt,
  };
}

/** Stage 11.3 admin queue row — additive to the public summary shape, plus both status dimensions and the fields the moderation table needs. */
export function toAdminListingSummaryResponse(listing) {
  return {
    id: listing.id,
    partner_id: listing.partnerId,
    partner_display_name: listing.partnerDisplayName,
    title: listing.title,
    listing_type: listing.listingTypeCode,
    slug: listing.slug,
    status: listing.statusCode,
    moderation_status: listing.moderationStatusCode,
    created_at: listing.createdAt,
  };
}

function toMetadataOptionResponse(option) {
  return { value: option.value, code: option.code };
}

/**
 * `GET /listings/metadata` response. Like `search.dynamicFilters.*`'s DTO,
 * every label-bearing field is a stable `code` — the frontend's own i18n
 * (`partner.listingWizard.*`) owns display labels, not this response
 * (Phase 4.2's established convention, reused here).
 */
export function toListingMetadataResponse({
  attributes,
  amenityGroups,
  pricingModels,
  policies,
}) {
  return {
    attributes: attributes.map((attribute) => ({
      code: attribute.code,
      data_type: attribute.dataTypeCode,
      unit: attribute.unit,
      min: attribute.validationMin,
      max: attribute.validationMax,
      is_multi_valued: attribute.isMultiValued,
      is_required: attribute.isRequired,
      options: attribute.options.map(toMetadataOptionResponse),
    })),
    amenity_groups: amenityGroups.map((group) => ({
      code: group.code,
      amenities: group.amenities.map(toMetadataOptionResponse),
    })),
    pricing_models: pricingModels.map((model) => ({
      code: model.code,
    })),
    policies: policies.map((policy) => ({
      code: policy.code,
      data_type: policy.dataTypeCode,
      unit: policy.unit,
      is_multi_valued: policy.isMultiValued,
      is_required: policy.isRequired,
      options: policy.options.map(toMetadataOptionResponse),
    })),
  };
}
