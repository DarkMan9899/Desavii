/**
 * DestinationPageContent — `/:locale/destinations/:citySlug` (Phase 20,
 * SEO). Real, indexable per-city landing page — mirrors
 * `CategoryPageContent`'s exact structure and data-reuse discipline for
 * the destination equivalent (`useDestinationsQuery` instead of
 * `useCategoriesQuery`, `cityId` instead of `categoryId`), including the
 * 2026 public-frontend audit's editorial hero + `ListingGrid` fix — see
 * `CategoryPageContent`'s own file header for why the previous
 * `Grid columns="auto"` grid was wrong for a card layout.
 */

import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import {
  Skeleton,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import RouterLink from '../../../../components/RouterLink.jsx';
import ListingGrid from '../../../../components/ListingGrid/ListingGrid.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import {
  useDestinationsQuery,
  useSearchListingsQuery,
  SearchResultCard,
} from '../../../search/index.js';
import { PLACEMENTS } from '../../../../analytics/index.js';
import styles from './DestinationPageContent.module.scss';

export default function DestinationPageContent() {
  const { t } = useTranslation();
  const { locale, citySlug } = useParams();
  const navigate = useNavigate();

  const {
    data: destinations,
    isPending,
    isError,
    refetch,
  } = useDestinationsQuery({ locale });
  const destination = destinations?.find(
    (candidate) => candidate.slug === citySlug,
  );

  // 2026 SEO/performance audit: same confirmed waste as
  // CategoryPageContent.jsx's identical pattern — without `enabled`, this
  // fired once with `cityId: undefined` (an unfiltered fetch whose result
  // is never rendered, since the page is still showing its own pending
  // skeleton at that point) and again, correctly filtered, once
  // `destination.id` resolved. `!destination` already early-returns below
  // before any JSX reads `isListingsPending`.
  const { data: listingsData, isPending: isListingsPending } =
    useSearchListingsQuery(
      { cityId: destination?.id },
      { locale, enabled: Boolean(destination?.id) },
    );
  const listings = listingsData?.pages[0]?.results ?? [];

  const canonicalPath = `destinations/${citySlug}`;
  const breadcrumbItems = destination
    ? [
        { label: t('nav.home'), href: `/${locale}` },
        { label: destination.name, href: `/${locale}/${canonicalPath}` },
      ]
    : [];

  useSeo({
    title: destination
      ? t('seo.destination.title', { city: destination.name })
      : undefined,
    description: destination
      ? t('seo.destination.description', { city: destination.name })
      : undefined,
    locale,
    path: destination ? canonicalPath : undefined,
    noindex: !destination,
    skipHreflang: !destination,
    jsonLd: destination
      ? [buildBreadcrumbListSchema(breadcrumbItems)]
      : undefined,
  });

  if (isPending) {
    return (
      <div
        aria-busy="true"
        aria-label={t('discovery.destination.loading')}
        className={styles.page}
      >
        <Skeleton variant="text" width="30%" height={20} />
        <Skeleton variant="rect" height={220} className={styles.heroSkeleton} />
        <ListingGrid>
          {Array.from({ length: 8 }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key -- fixed-count skeleton placeholders, no stable identity to key by
            <Skeleton key={index} variant="rect" height={280} />
          ))}
        </ListingGrid>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t('discovery.destination.errorTitle')}
        retryLabel={t('discovery.destination.retry')}
        onRetry={refetch}
      />
    );
  }

  if (!destination) {
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
    <div className={styles.page}>
      <Breadcrumbs
        items={breadcrumbItems}
        linkComponent={RouterLink}
        className={styles.breadcrumbs}
      />

      <section className={styles.hero}>
        <DestinationArt seed={destination.id} className={styles.heroArt} />
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>{t('nav.explore')}</span>
          <span className={styles.heroIcon} aria-hidden="true">
            <MapPin size={28} />
          </span>
          <h1 className={styles.title}>{destination.name}</h1>
          <p className={styles.description}>
            {t('seo.destination.description', { city: destination.name })}
          </p>
          {destination.listing_count > 0 && (
            <span className={styles.count}>
              {t('home.categories.listingCount', {
                count: destination.listing_count,
              })}
            </span>
          )}
        </div>
      </section>

      {isListingsPending && (
        <ListingGrid>
          {Array.from({ length: 8 }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key -- fixed-count skeleton placeholders, no stable identity to key by
            <Skeleton key={index} variant="rect" height={280} />
          ))}
        </ListingGrid>
      )}

      {!isListingsPending && listings.length === 0 && (
        <EmptyState
          title={t('discovery.destination.emptyTitle')}
          description={t('discovery.destination.emptyDescription')}
        />
      )}

      {!isListingsPending && listings.length > 0 && (
        <ListingGrid>
          {listings.map((listing, index) => (
            <SearchResultCard
              key={listing.id}
              result={listing}
              // 2026 SEO/performance audit: same fix as CategoryPageContent's
              // identical grid — the first card's image is this page's real
              // LCP candidate too.
              priorityImage={index === 0}
              placement={PLACEMENTS.SEARCH_RESULTS}
              position={index}
            />
          ))}
        </ListingGrid>
      )}
    </div>
  );
}
