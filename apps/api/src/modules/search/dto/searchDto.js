import { toCardFactsResponse } from '../../listings/dto/listingCardFactsDto.js';

/**
 * Search module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 *
 * Search results are a list/card view, not the full listing detail —
 * matching `modules/listings/dto/listingDto.js`'s `toListingSummaryResponse`
 * precedent ("summary, not full detail" for list endpoints).
 */

/**
 * A Map Search marker: the point plus exactly what its preview shows —
 * a subset of the card (same field names, so the card's own fact and
 * price helpers apply unchanged), never the listing detail. No partner,
 * status, summary or lifecycle fields: the preview links to the listing
 * page for everything else.
 */
export function toSearchMapResultResponse(result) {
  return {
    id: result.id,
    slug: result.slug,
    title: result.title,
    listing_type: result.listingTypeCode,
    city_name: result.cityName ?? null,
    // The public map point: exact for venues, a grid-cell centre for
    // private stays (`location_precision: 'approximate'`) — see
    // `core/domain/searchMap.js`. Never the stored point of a private stay.
    latitude: result.latitude,
    longitude: result.longitude,
    location_precision: result.locationPrecision,
    cover_image_url: result.coverImageUrl ?? null,
    price_amount: result.priceAmount ?? null,
    price_currency_code: result.priceCurrencyCode ?? null,
    rating_average: result.ratingAverage ?? null,
    review_count: result.reviewCount ?? 0,
    // The same card facts every card shows (category, attributes,
    // amenities, reservations, price basis).
    ...toCardFactsResponse(result),
  };
}

/**
 * The public listing card (`GET /search`, the Home Featured / Category TOP
 * feeds): exactly what a card and the sitemap use (docs/LISTING_CARDS.md),
 * nothing else. Deliberately absent — no public consumer needs them, so
 * they are not sent: `partner_id` (which company owns which listings),
 * `status` (always PUBLISHED here), `summary`, `city_id`, `country_id`.
 * `created_at` stays: the sitemap's `lastmod`
 * (`apps/web/scripts/lib/fetchRouteManifest.mjs`), already public there.
 */
export function toSearchResultResponse(result) {
  return {
    id: result.id,
    listing_type: result.listingTypeCode,
    slug: result.slug,
    title: result.title,
    city_name: result.cityName,
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
    // The card facts — category, the category's real attributes, its
    // card-worthy amenities, restaurant reservations and the price basis
    // (`listings/dto/listingCardFactsDto.js`, shared by every card DTO).
    ...toCardFactsResponse(result),
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
 * shape: everything `toSearchResultResponse` already exposes, plus `status`
 * (the status badge, row actions and dashboard counts) and the 5
 * lifecycle fields the brief requires for the status badge/countdown/Renew
 * UI. `searchController.js` only ever calls this for the exact same
 * elevated population that can already see a non-PUBLISHED listing's card
 * through this endpoint (`searchService.js`'s own `isOwnerView`) — a
 * public/anonymous caller always gets `toSearchResultResponse` instead, so
 * `status` and these 5 fields can never reach a public Search/Category/Home
 * response.
 * `expiry_reminder_sent_at` is deliberately NOT included (brief §14 — no
 * concrete Partner UX need for it).
 */
export function toOwnerSearchResultResponse(result) {
  return {
    ...toSearchResultResponse(result),
    status: result.statusCode,
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
        // The exact `GET /search` param this filter writes (a RANGE/STEPPER
        // appends `_min`/`_max`).
        param: definition.param,
        // `false` = one of the category's quick filters, shown above the
        // results as well as in the full filter panel.
        is_advanced: definition.isAdvanced,
        unit: definition.unit,
        min: definition.min,
        max: definition.max,
        listing_count: definition.listingCount,
        options: definition.options.map((option) => ({
          value: option.value,
          code: option.code,
          // Localized display name — amenities only (attribute and policy
          // options are stable codes the web app labels itself).
          label: option.label ?? null,
          group: option.group ?? null,
          count: option.count,
        })),
      })),
    })),
  };
}
