/**
 * useListingDetail — everything the Listing Detail page shows, resolved
 * from its queries in one place, so the page component only lays it out
 * (docs/LISTING_DETAIL_REDESIGN.md).
 *
 * Fetches: the listing (`GET /listings/:idOrSlug`, the minimal public DTO
 * for a visitor), its category metadata, the category list (shared cache),
 * its bookable units (shared with the rooms section and the reservation
 * panel — one request), its opening hours and, for a restaurant only, its
 * menu. Nothing else is fetched here; sections that need more (reviews,
 * availability, related listings) fetch their own data when they render.
 *
 * Truthfulness: the rating and the top features use the exact rules every
 * listing card uses (`listingCardModel.js`, `listingCardFacts.js`), so a
 * listing never reads differently on its card and its page.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useListingQuery } from '../queries/useListingQuery.js';
import { useListingMetadataQuery } from '../queries/useListingMetadataQuery.js';
import { useListingCategoriesQuery } from '../queries/useListingCategoriesQuery.js';
import { useListingBookableUnitsQuery } from '../queries/useListingBookableUnitsQuery.js';
import { useListingMenuQuery } from '../queries/useListingMenuQuery.js';
import { useListingOpeningHoursQuery } from '../queries/useListingOpeningHoursQuery.js';
import getLocalizedTranslation from '../utils/getLocalizedTranslation.js';
import getLocalizedItems from '../utils/getLocalizedItems.js';
import { resolveInitialReservationState } from '../utils/reservationSearchContext.js';
import { resolveCategoryVisualKey } from '../utils/categoryPresentation.js';
import { resolveListingKeyFacts } from '../utils/listingKeyFacts.js';
import { resolveListingFactGroups } from '../utils/listingFactGroups.js';
import { resolveListingRules } from '../utils/listingRules.js';
import { buildListingDetailSections } from '../utils/listingDetailSections.js';
import { toDetailCardDto } from '../utils/detailCardDto.js';
import { localizeLocation } from '../utils/localizeLocation.js';
import { getBusinessToday } from '../../../utils/businessDate.js';
import { resolveCardRating } from '../../../utils/listingCardModel.js';
import { resolveDetailFeatures } from '../../../utils/listingCardFacts.js';

export default function useListingDetail(idOrSlug, locale) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const listingQuery = useListingQuery(idOrSlug);
  const listing = listingQuery.data;

  const categoryId = listing?.category_ids?.[0];
  const metadataQuery = useListingMetadataQuery(categoryId, locale);
  const metadata = metadataQuery.data;
  const { data: categories } = useListingCategoriesQuery(locale);
  const category = (categories ?? []).find(
    (candidate) => candidate.id === categoryId,
  );
  const { data: units } = useListingBookableUnitsQuery(listing?.id);
  const { data: menus } = useListingMenuQuery(
    listing?.listing_type === 'RESTAURANT' ? listing.id : undefined,
    locale,
  );
  const { data: weeklyHours } = useListingOpeningHoursQuery(listing?.id);

  // The ONE room selection and stay range the rooms section, the
  // reservation panel and the mobile bar render against — seeded from the
  // Search hand-off (`resolveInitialReservationState`).
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [dateRange, setDateRange] = useState(
    () =>
      resolveInitialReservationState(searchParams, getBusinessToday())
        .dateRange,
  );

  if (!listing) {
    return { listingQuery, metadataQuery, listing: null };
  }

  const translation = getLocalizedTranslation(listing.translations, locale);
  // The place in the visitor's language, used everywhere the page names it.
  const location = localizeLocation(listing.location, locale);
  const content = {
    highlights: getLocalizedItems(listing.highlights, locale),
    itinerarySteps: getLocalizedItems(listing.itinerary_steps, locale),
    includedItems: getLocalizedItems(listing.included_items, locale),
    faqs: getLocalizedItems(listing.faqs, locale),
    guestNotes: getLocalizedItems(listing.guest_notes, locale),
  };
  const title = translation?.title || listing.slug;
  const description = translation?.description || translation?.summary;

  const categoryVisualKey = resolveCategoryVisualKey({
    listingType: listing.listing_type,
    categorySlug: category?.slug,
  });
  const cardDto = toDetailCardDto(listing, metadata);
  const keyFacts = resolveListingKeyFacts(
    { categoryVisualKey, metadata, listing, locale, units, weeklyHours },
    t,
  );

  // Grouped category facts and the rules list — computed once, read by the
  // navigation and by the sections themselves.
  const factGroups = resolveListingFactGroups(
    {
      categoryVisualKey,
      metadata,
      listing,
      location,
      locale,
      units,
      consumedCodes: keyFacts.consumedAttributeCodes,
    },
    t,
  );
  const rules = resolveListingRules(
    { policies: metadata?.policies, listing, locale },
    t,
  );

  const sections = buildListingDetailSections({
    listing,
    metadata,
    content,
    description,
    units,
    menus,
    weeklyHours,
    factGroups,
    rules,
    categoryVisualKey,
    t,
  });

  return {
    listingQuery,
    metadataQuery,
    listing,
    translation,
    location,
    title,
    description,
    content,
    category,
    categoryId,
    categoryVisualKey,
    metadata,
    menus: menus ?? [],
    weeklyHours: weeklyHours ?? [],
    keyFacts,
    factGroups,
    sections,
    header: {
      typeLabel: t(`listingCard.category.${categoryVisualKey}`, {
        defaultValue: category?.name ?? '',
      }),
      cityName: location?.city_name ?? null,
      countryName: location?.country_name ?? null,
      isApproximate: location?.location_precision === 'approximate',
      rating: resolveCardRating(cardDto),
      features: resolveDetailFeatures(cardDto, categoryVisualKey, t),
    },
    reservation: {
      selectedUnitId,
      onSelectUnit: setSelectedUnitId,
      dateRange,
      onChangeDateRange: setDateRange,
    },
  };
}
