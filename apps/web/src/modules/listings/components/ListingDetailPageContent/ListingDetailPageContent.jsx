/**
 * ListingDetailPageContent — `/:locale/listings/:idOrSlug`
 * (docs/LISTING_DETAIL_REDESIGN.md). Layout only: what the page shows is
 * resolved by `useListingDetail`, its head by `useListingDetailSeo`.
 *
 * Reading order, at every width:
 * 1. the photos (`ListingGallery` — mosaic from tablet, a swipeable strip
 *    on a phone, an honest panel when there are none);
 * 2. the header — what and where, the title, the rating, highlights, key
 *    facts and top features (`ListingHeader`);
 * 3. the in-page navigation, then the category's own sections in its own
 *    order (`listingDetailSections.js`): a hotel's rooms, a tour's
 *    itinerary, a restaurant's menu and hours, a car's specifications…
 *    then reviews, the place, the company and the FAQ;
 * 4. related listings (the shared listing card).
 *
 * From laptop the reservation panel is pinned beside the content from the
 * first screen; below it, `MobileBookingBar` is the entry point. The panel
 * itself is unchanged here (its category-aware rebuild is the next phase).
 *
 * A 404 (unpublished, deleted or unknown — never revealing which) shows the
 * not-found state; any other failure is retryable.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Skeleton,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Section, Stack } from '@desavii/ui/components/layout';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import RouterLink from '../../../../components/RouterLink.jsx';
import ScrollReveal from '../../../../components/ScrollRevealLite/ScrollRevealLite.jsx';
import useListingDetail from '../../hooks/useListingDetail.js';
import useListingDetailSeo from '../../hooks/useListingDetailSeo.js';
import { SECTION_IDS } from '../../utils/listingDetailSections.js';
import { resolveDetailEmphasisSectionId } from '../../../../utils/categoryMotionConfig.js';
import { trackListingViewed } from '../../../../analytics/index.js';
import ListingDetailSkeleton from './ListingDetailSkeleton.jsx';
import ListingDetailActions from './ListingDetailActions.jsx';
import ListingGallery from './ListingGallery/ListingGallery.jsx';
import ListingHeader from './ListingHeader/ListingHeader.jsx';
import ListingSectionNav from './ListingSectionNav/ListingSectionNav.jsx';
import ListingDetailSection from './ListingDetailSection.jsx';
import ListingReservationWidget from './ListingReservationWidget/ListingReservationWidget.jsx';
import MobileBookingBar from './MobileBookingBar/MobileBookingBar.jsx';
import RelatedListings from './RelatedListings/RelatedListings.jsx';
import styles from './ListingDetailPageContent.module.scss';

export default function ListingDetailPageContent() {
  const { t } = useTranslation();
  const { locale, id } = useParams();
  const navigate = useNavigate();
  const model = useListingDetail(id, locale);
  const breadcrumbs = useListingDetailSeo(model, locale);
  const { listing, listingQuery, metadataQuery } = model;

  // Engagement analytics: once per genuinely public render — never for an
  // owner previewing a non-published listing.
  useEffect(() => {
    if (listing?.status === 'PUBLISHED') {
      trackListingViewed({ listingId: listing.id });
    }
  }, [listing?.id, listing?.status]);

  // Canonical slug URL: a legacy numeric-id link (or a renamed slug) is
  // replaced, never pushed, so it never lingers in history.
  useEffect(() => {
    if (listing?.slug && listing.slug !== id) {
      navigate(`/${locale}/listings/${listing.slug}`, { replace: true });
    }
  }, [listing?.slug, id, locale, navigate]);

  if (listingQuery.isPending) return <ListingDetailSkeleton />;

  if (listingQuery.isError) {
    if (listingQuery.error.status === 404) {
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
        onRetry={listingQuery.refetch}
      />
    );
  }

  const { categoryVisualKey, sections, reservation } = model;
  const emphasisSectionId = resolveDetailEmphasisSectionId(categoryVisualKey);
  const reservationProps = {
    listingId: listing.id,
    pricing: listing.pricing,
    location: model.location,
    selectedUnitId: reservation.selectedUnitId,
    onSelectUnit: reservation.onSelectUnit,
    dateRange: reservation.dateRange,
    onChangeDateRange: reservation.onChangeDateRange,
    listingType: listing.listing_type,
    bookingRules: listing.booking_rules,
    categorySlug: model.category?.slug ?? null,
    // A restaurant's menus and hours: its pre-order and reservation times.
    menus: model.menus,
    weeklyHours: model.weeklyHours,
  };

  return (
    <Stack gap="6">
      <Breadcrumbs items={breadcrumbs} linkComponent={RouterLink} />

      <ListingGallery
        media={listing.media}
        title={model.title}
        variant="hero"
        artSeed={listing.id}
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <ListingHeader
            title={model.title}
            typeLabel={model.header.typeLabel}
            cityName={model.header.cityName}
            countryName={model.header.countryName}
            isApproximate={model.header.isApproximate}
            rating={model.header.rating}
            reviewsAnchorId={SECTION_IDS.REVIEWS}
            highlights={model.content.highlights}
            keyFacts={model.keyFacts.facts}
            features={model.header.features}
            actions={
              <ListingDetailActions
                listingId={listing.id}
                title={model.title}
              />
            }
          />

          <ListingSectionNav sections={sections.navigable} />

          {metadataQuery.isPending && (
            <Section
              spacing="none"
              aria-label={t('pages.listingDetail.loading')}
            >
              <Skeleton variant="rect" height={160} />
            </Section>
          )}
          {metadataQuery.isError && (
            <ErrorState
              title={t('pages.listingDetail.errorTitle')}
              retryLabel={t('pages.listingDetail.retry')}
              onRetry={metadataQuery.refetch}
            />
          )}

          <div className={styles.sections}>
            {sections.ordered.map(({ id: sectionId }) => (
              <ScrollReveal
                key={sectionId}
                variant={sectionId === emphasisSectionId ? 'depth' : 'fade'}
                className={styles.section}
              >
                <ListingDetailSection
                  sectionId={sectionId}
                  model={model}
                  locale={locale}
                />
              </ScrollReveal>
            ))}
          </div>

          <RelatedListings
            categoryId={model.categoryId}
            excludeListingId={listing.id}
          />
        </div>

        <aside className={styles.sidebar}>
          {/* eslint-disable-next-line react/jsx-props-no-spreading -- one prop set shared with MobileBookingBar */}
          <ListingReservationWidget {...reservationProps} />
        </aside>
      </div>

      <div className={styles.mobileBarSpacer} aria-hidden="true" />
      {/* eslint-disable-next-line react/jsx-props-no-spreading -- one prop set shared with the reservation panel */}
      <MobileBookingBar {...reservationProps} />
    </Stack>
  );
}
