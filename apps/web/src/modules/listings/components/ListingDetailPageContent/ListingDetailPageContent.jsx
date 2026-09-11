/**
 * ListingDetailPageContent — the `listings` module's page-level content
 * for `/:locale/listings/:id`. Phase 18 (Premium Listing Detail):
 * replaces the old flat `PageHeader` + grid-only gallery with a real
 * hero (`ListingHero` — mosaic gallery, title, location, rating,
 * partner-authored highlights, Ask AI / Favorite / Share actions), a new
 * `ListingAboutSection` (the listing's description, previously rendered
 * nowhere on this page despite existing on every translation), and a
 * sticky `ListingSectionNav` for jumping around the now-longer page.
 * Every other section (Attributes/Amenities/Policies/Availability/
 * Location/Reviews/Related) is unchanged this stage — their own visual
 * redesign is a later Phase 18 stage — only gaining an `id` anchor for
 * the new section nav to target.
 *
 * Two distinct error states: a genuine 404 (an unpublished/deleted/
 * nonexistent listing — `ListingService.getListing`'s visibility rule
 * never leaks draft existence to the public) renders the same
 * `errors.notFound.*` `EmptyState` `NotFoundPage` itself uses, since
 * that's what this functionally is; any other failure (network, 500)
 * gets the generic retryable `ErrorState`.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Skeleton,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import RouterLink from '../../../../components/RouterLink.jsx';
import ShareButton from '../../../../components/ShareButton/ShareButton.jsx';
import useSeo from '../../../../seo/useSeo.js';
import {
  buildBreadcrumbListSchema,
  buildListingSchema,
  buildFaqPageSchema,
} from '../../../../seo/structuredData.js';
import { useListingQuery } from '../../queries/useListingQuery.js';
import { useListingMetadataQuery } from '../../queries/useListingMetadataQuery.js';
import { useListingCategoriesQuery } from '../../queries/useListingCategoriesQuery.js';
import { useListingBookableUnitsQuery } from '../../queries/useListingBookableUnitsQuery.js';
import { useListingMenuQuery } from '../../queries/useListingMenuQuery.js';
import getLocalizedTranslation from '../../utils/getLocalizedTranslation.js';
import getLocalizedItems from '../../utils/getLocalizedItems.js';
import { resolveInitialReservationState } from '../../utils/reservationSearchContext.js';
import { toISODate } from '../../utils/reservationEstimate.js';
import ListingHero from './ListingHero/ListingHero.jsx';
import ListingSectionNav from './ListingSectionNav/ListingSectionNav.jsx';
import ListingAboutSection from './ListingAboutSection/ListingAboutSection.jsx';
import ListingRoomsSection from './ListingRoomsSection/ListingRoomsSection.jsx';
import ListingReservationWidget from './ListingReservationWidget/ListingReservationWidget.jsx';
import MobileBookingBar from './MobileBookingBar/MobileBookingBar.jsx';
import ListingAttributesSection from './ListingAttributesSection/ListingAttributesSection.jsx';
import ListingItinerarySection from './ListingItinerarySection/ListingItinerarySection.jsx';
import ListingIncludedSection from './ListingIncludedSection/ListingIncludedSection.jsx';
import ListingAmenitiesSection from './ListingAmenitiesSection/ListingAmenitiesSection.jsx';
import ListingPoliciesSection from './ListingPoliciesSection/ListingPoliciesSection.jsx';
import ListingAvailabilitySection from './ListingAvailabilitySection/ListingAvailabilitySection.jsx';
import ListingLocationSection from './ListingLocationSection/ListingLocationSection.jsx';
import ListingReviewsSection from './ListingReviewsSection/ListingReviewsSection.jsx';
import ListingFaqSection from './ListingFaqSection/ListingFaqSection.jsx';
import ListingMenuSection from './ListingMenuSection/ListingMenuSection.jsx';
import RelatedListings from './RelatedListings/RelatedListings.jsx';
import { FavoriteButton } from '../../../favorites/index.js';
import { AskAiButton } from '../../../ai/index.js';
import {
  resolvePresentationGroup,
  reorderSections,
  resolveBookingCtaKey,
} from '../../utils/categoryPresentation.js';
import styles from './ListingDetailPageContent.module.scss';

const SECTION_ABOUT = 'about';
const SECTION_ROOMS = 'rooms';
const SECTION_ITINERARY = 'itinerary';
const SECTION_INCLUDED = 'included';
const SECTION_ATTRIBUTES = 'attributes';
const SECTION_AMENITIES = 'amenities';
const SECTION_POLICIES = 'policies';
const SECTION_AVAILABILITY = 'availability';
const SECTION_LOCATION = 'location';
const SECTION_REVIEWS = 'reviews';
const SECTION_FAQ = 'faq';
const SECTION_MENU = 'menu';

// 2026 stabilization audit — the lower page previously read as a long
// stack of identical giant white cards (every section shared one blanket
// `.main > section` treatment). Structured, browsable content —
// Amenities/Included/Policies/FAQ, each already its own tight list or
// accordion — reads better with editorial rhythm (typography + a subtle
// rule, no card chrome) than boxed in yet another elevated card; the
// remaining sections (About, Attributes, Availability, Location,
// Reviews) genuinely are prose/dense-data blocks that still benefit from
// a card's visual grouping.
const EDITORIAL_SECTION_IDS = new Set([
  SECTION_INCLUDED,
  SECTION_AMENITIES,
  SECTION_POLICIES,
  SECTION_FAQ,
  SECTION_MENU,
]);

export default function ListingDetailPageContent() {
  const { t } = useTranslation();
  // `id` is the raw path segment — Phase 20 (SEO) route accepts either the
  // numeric id (legacy/still-shared links) or the listing's slug (the
  // canonical, indexable form); the backend resolves either the same way
  // (see `listingService.getListing`). Never coerced to Number here, since
  // a slug isn't numeric.
  const { locale, id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    data: listing,
    isPending,
    isError,
    error,
    refetch,
  } = useListingQuery(id);

  const categoryId = listing?.category_ids?.[0];
  const {
    data: metadata,
    isPending: isMetadataPending,
    isError: isMetadataError,
    refetch: refetchMetadata,
  } = useListingMetadataQuery(categoryId, locale);
  const { data: categories } = useListingCategoriesQuery(locale);
  const category = (categories ?? []).find(
    (candidate) => candidate.id === categoryId,
  );

  // Sprint C-2 (Public Rooms / Choose Your Room): the SAME cache entry
  // `ListingReservationWidget`/`ListingRoomsSection` each independently
  // subscribe to via their own `useListingBookableUnitsQuery(listing.id)`
  // call — one real network fetch, shared by every subscriber. Read here
  // only to decide whether a Rooms section belongs in `sections` at all
  // (a HOTEL with zero registered HOTEL_ROOM units gets none — never a
  // fabricated section). `selectedUnitId` is the ONE canonical selection
  // both components render against; lifting it here is what keeps
  // picking a room in one from ever disagreeing with the other.
  const { data: units } = useListingBookableUnitsQuery(listing?.id);
  const hasHotelRooms = (units ?? []).some(
    (unit) => unit.bookable_unit_type === 'HOTEL_ROOM',
  );

  // Pass 3 remediation (Restaurant vertical) — only fetched for a
  // RESTAURANT listing, never a wasted request on every other type.
  const { data: menus } = useListingMenuQuery(
    listing?.listing_type === 'RESTAURANT' ? listing.id : undefined,
    locale,
  );
  const [selectedUnitId, setSelectedUnitId] = useState(null);

  // Sprint C-3 (Date-Range Room Availability): the SAME canonical
  // check-in/check-out state `ListingReservationWidget`'s own date picker
  // writes to (via its dual controlled/uncontrolled `dateRange`/
  // `onChangeDateRange` prop pair, mirroring `selectedUnitId` above)
  // — lifted here so `ListingRoomsSection`'s cards can react to a stay
  // range picked in the widget/mobile drawer without a second, parallel
  // date state. Seeded from the search page's own dateFrom/dateTo hand-off
  // exactly as the widget always seeded itself internally (see
  // `resolveInitialReservationState`'s own header) — moved up here rather
  // than duplicated, since the widget now takes this as a controlled prop.
  const [dateRange, setDateRange] = useState(
    () =>
      resolveInitialReservationState(searchParams, toISODate(new Date()))
        .dateRange,
  );

  const translation = listing
    ? getLocalizedTranslation(listing.translations, locale)
    : null;

  // Phase 18's highlights/itinerary/included-items/FAQs are now per-locale
  // rows (migration 0037, 2026 stabilization audit) — the API returns
  // every language's rows in one flat array (tagged with `language_code`,
  // exactly like `listing.translations` already is), and this is the one
  // place that picks the current locale's subset for the whole page.
  // Computed unconditionally (not after the loading/error early-returns
  // below) since `faqJsonLd`, built from `faqs`, feeds the `useSeo` hook
  // call, which itself must run before any early return.
  const highlights = listing
    ? getLocalizedItems(listing.highlights, locale)
    : [];
  const itinerarySteps = listing
    ? getLocalizedItems(listing.itinerary_steps, locale)
    : [];
  const includedItems = listing
    ? getLocalizedItems(listing.included_items, locale)
    : [];
  const faqs = listing ? getLocalizedItems(listing.faqs, locale) : [];

  // Canonicalizes on the slug: a visit via the legacy numeric-id URL (or
  // any URL that no longer matches the listing's current slug, e.g. after
  // a partner renames it) is swapped to the slug URL once it's known —
  // `replace` so the numeric URL never lingers in browser history and a
  // shared old link converges on the one canonical URL, matching the
  // `<link rel="canonical">` this same page emits below.
  useEffect(() => {
    if (listing?.slug && listing.slug !== id) {
      navigate(`/${locale}/listings/${listing.slug}`, { replace: true });
    }
  }, [listing?.slug, id, locale, navigate]);

  const seoTitle = translation?.seo_title || translation?.title;
  const seoDescription =
    translation?.seo_description ??
    translation?.summary ??
    translation?.description;
  const canonicalPath = listing
    ? `listings/${listing.slug ?? listing.id}`
    : undefined;
  const listingJsonLd =
    listing && translation
      ? buildListingSchema({
          listing: {
            ...listing,
            title: translation.title,
            description: translation.summary ?? translation.description,
          },
          categoryCode: category?.slug,
          locale,
          path: canonicalPath,
        })
      : null;
  const faqJsonLd = listing ? buildFaqPageSchema(faqs) : null;
  const breadcrumbItems = listing
    ? [
        { label: t('nav.home'), href: `/${locale}` },
        {
          label: translation?.title ?? listing.slug,
          href: `/${locale}/listings/${listing.slug ?? listing.id}`,
        },
      ]
    : [];

  // 2026 SEO audit: every listing has real photos, but OG/Twitter cards
  // were falling back to the link-only "summary" card with no image —
  // the lowest-`position` real photo, same source `ListingGallery`'s own
  // hero tile uses, never a stock/placeholder image.
  const seoImage = (listing?.media ?? [])
    .filter((item) => item.media_type === 'IMAGE')
    .slice()
    .sort((a, b) => a.position - b.position)[0]?.url;

  const cityName = listing?.location?.city_name;
  let seoPageTitle;
  if (listing) {
    seoPageTitle = cityName
      ? t('seo.listingDetail.titleWithLocation', {
          title: seoTitle,
          location: cityName,
        })
      : t('seo.listingDetail.titleNoLocation', { title: seoTitle });
  }
  useSeo({
    title: seoPageTitle,
    description: seoDescription,
    locale,
    path: canonicalPath,
    image: seoImage,
    noindex: listing
      ? !listing.is_indexable || listing.status !== 'PUBLISHED'
      : true,
    skipHreflang: !listing,
    jsonLd: listing
      ? [
          listingJsonLd,
          buildBreadcrumbListSchema(breadcrumbItems),
          faqJsonLd,
        ].filter(Boolean)
      : undefined,
  });

  if (isPending) {
    return (
      <Stack
        gap="6"
        role="status"
        aria-busy="true"
        aria-label={t('pages.listingDetail.loading')}
      >
        <Skeleton variant="text" width="30%" height={20} />
        <Skeleton variant="rect" height={420} />
        <Skeleton variant="text" width="50%" height={32} />
        <div className={styles.layout}>
          <div className={styles.main}>
            <Skeleton variant="text" width="30%" height={24} />
            <Skeleton variant="rect" height={160} />
            <Skeleton variant="rect" height={160} />
          </div>
          <div className={styles.sidebar}>
            <Skeleton variant="rect" height={280} />
          </div>
        </div>
      </Stack>
    );
  }

  if (isError) {
    if (error.status === 404) {
      return (
        <EmptyState
          title={t('errors.notFound.title')}
          description={t('errors.notFound.description')}
          actionLabel={t('errors.notFound.action')}
          onAction={() => navigate(`/${locale}`)}
        />
      );
    }
    return (
      <ErrorState
        title={t('pages.listingDetail.errorTitle')}
        retryLabel={t('pages.listingDetail.retry')}
        onRetry={refetch}
      />
    );
  }

  const title = translation?.title ?? listing.slug;
  const description = translation?.summary ?? translation?.description;

  const sections = [
    description && {
      id: SECTION_ABOUT,
      label: t('pages.listingDetail.about.heading'),
    },
    hasHotelRooms && {
      id: SECTION_ROOMS,
      label: t('pages.listingDetail.rooms.heading'),
    },
    itinerarySteps.length > 0 && {
      id: SECTION_ITINERARY,
      label: t('pages.listingDetail.itinerary.heading'),
    },
    (menus ?? []).some((menu) => menu.is_active) && {
      id: SECTION_MENU,
      label: t('pages.listingDetail.menu.heading'),
    },
    includedItems.length > 0 && {
      id: SECTION_INCLUDED,
      label: t('pages.listingDetail.included.heading'),
    },
    metadata?.attributes?.length > 0 && {
      id: SECTION_ATTRIBUTES,
      label: t('pages.listingDetail.attributes.heading'),
    },
    metadata?.amenity_groups?.length > 0 &&
      listing.amenity_ids?.length > 0 && {
        id: SECTION_AMENITIES,
        label: t('pages.listingDetail.amenities.heading'),
      },
    metadata?.policies?.length > 0 && {
      id: SECTION_POLICIES,
      label: t('pages.listingDetail.policies.heading'),
    },
    {
      id: SECTION_AVAILABILITY,
      label: t('pages.listingDetail.availability.heading'),
    },
    listing.location && {
      id: SECTION_LOCATION,
      label: t('pages.listingDetail.location.heading'),
    },
    { id: SECTION_REVIEWS, label: t('pages.listingDetail.reviews.heading') },
    faqs.length > 0 && {
      id: SECTION_FAQ,
      label: t('pages.listingDetail.faq.heading'),
    },
  ].filter(Boolean);

  // Phase 18.7 (Category-Specific Detail Experiences) — same sections,
  // same components, no per-category markup fork: only the reading order
  // (and the reservation panel's CTA copy, see `bookingCtaKey` below)
  // adapts to what actually matters first for this listing's type.
  const presentationGroup = resolvePresentationGroup(listing.listing_type);
  const orderedSections = reorderSections(sections, presentationGroup);
  const bookingCtaKey = resolveBookingCtaKey(presentationGroup);

  const sectionElements = {
    [SECTION_ABOUT]: (
      <ListingAboutSection
        description={description}
        sectionId={SECTION_ABOUT}
      />
    ),
    [SECTION_ROOMS]: (
      <ListingRoomsSection
        listingId={listing.id}
        amenityGroups={metadata?.amenity_groups}
        pricing={listing.pricing}
        locale={locale}
        selectedUnitId={selectedUnitId}
        onSelectUnit={setSelectedUnitId}
        dateRange={dateRange}
        sectionId={SECTION_ROOMS}
      />
    ),
    [SECTION_ITINERARY]: (
      <ListingItinerarySection
        steps={itinerarySteps}
        sectionId={SECTION_ITINERARY}
      />
    ),
    [SECTION_INCLUDED]: (
      <ListingIncludedSection
        items={includedItems}
        sectionId={SECTION_INCLUDED}
      />
    ),
    [SECTION_ATTRIBUTES]: metadata && (
      <ListingAttributesSection
        attributes={metadata.attributes}
        listing={listing}
        sectionId={SECTION_ATTRIBUTES}
      />
    ),
    [SECTION_AMENITIES]: metadata && (
      <ListingAmenitiesSection
        amenityGroups={metadata.amenity_groups}
        amenityIds={listing.amenity_ids}
        sectionId={SECTION_AMENITIES}
      />
    ),
    [SECTION_POLICIES]: metadata && (
      <ListingPoliciesSection
        policies={metadata.policies}
        listing={listing}
        sectionId={SECTION_POLICIES}
      />
    ),
    [SECTION_AVAILABILITY]: (
      <ListingAvailabilitySection
        listingId={listing.id}
        sectionId={SECTION_AVAILABILITY}
      />
    ),
    [SECTION_LOCATION]: (
      <ListingLocationSection
        location={listing.location}
        title={title}
        sectionId={SECTION_LOCATION}
      />
    ),
    [SECTION_REVIEWS]: (
      <ListingReviewsSection
        listingId={listing.id}
        partnerId={listing.partner_id}
        ratingAverage={listing.rating_average}
        reviewCount={listing.review_count}
        sectionId={SECTION_REVIEWS}
      />
    ),
    [SECTION_FAQ]: <ListingFaqSection faqs={faqs} sectionId={SECTION_FAQ} />,
    [SECTION_MENU]: (
      <ListingMenuSection
        menus={menus ?? []}
        locale={locale}
        sectionId={SECTION_MENU}
      />
    ),
  };

  return (
    <Stack gap="6">
      <Breadcrumbs items={breadcrumbItems} linkComponent={RouterLink} />

      <ListingHero
        media={listing.media}
        title={title}
        categoryLabel={category?.name ?? null}
        cityName={listing.location?.city_name ?? null}
        countryName={listing.location?.country_name ?? null}
        ratingAverage={listing.rating_average}
        reviewCount={listing.review_count}
        highlights={highlights}
        reviewsAnchorId={SECTION_REVIEWS}
        actions={
          <Inline gap="2" align="center">
            <AskAiButton
              label={t('ai.contextButtons.askAboutListing')}
              contextType="listing"
              contextId={listing.id}
              initialMessage={t('ai.contextButtons.listingInitialMessage')}
              variant="ghost"
              size="sm"
            />
            <ShareButton title={title} />
            <FavoriteButton listingId={listing.id} />
          </Inline>
        }
      />

      <ListingSectionNav sections={orderedSections} />

      <div className={styles.layout}>
        <div className={styles.main}>
          {isMetadataPending && (
            <div className={styles.sectionCard}>
              <Section
                spacing="none"
                aria-label={t('pages.listingDetail.loading')}
              >
                <Skeleton variant="rect" height={160} />
              </Section>
            </div>
          )}
          {isMetadataError && (
            <ErrorState
              title={t('pages.listingDetail.errorTitle')}
              retryLabel={t('pages.listingDetail.retry')}
              onRetry={refetchMetadata}
            />
          )}

          {orderedSections.map(({ id: sectionId }) => (
            <div
              key={sectionId}
              className={
                EDITORIAL_SECTION_IDS.has(sectionId)
                  ? styles.sectionEditorial
                  : styles.sectionCard
              }
            >
              {sectionElements[sectionId]}
            </div>
          ))}

          <RelatedListings
            categoryId={categoryId}
            excludeListingId={listing.id}
          />
        </div>

        <aside className={styles.sidebar}>
          <ListingReservationWidget
            listingId={listing.id}
            pricing={listing.pricing}
            bookingCtaKey={bookingCtaKey}
            location={listing.location}
            selectedUnitId={selectedUnitId}
            onSelectUnit={setSelectedUnitId}
            dateRange={dateRange}
            onChangeDateRange={setDateRange}
          />
        </aside>
      </div>

      <div className={styles.mobileBarSpacer} aria-hidden="true" />
      <MobileBookingBar
        listingId={listing.id}
        pricing={listing.pricing}
        bookingCtaKey={bookingCtaKey}
        location={listing.location}
        selectedUnitId={selectedUnitId}
        onSelectUnit={setSelectedUnitId}
        dateRange={dateRange}
        onChangeDateRange={setDateRange}
      />
    </Stack>
  );
}
