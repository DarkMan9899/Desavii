/**
 * FavoritesPageContent — `/:locale/account/favorites` (Customer Account:
 * Favorites). Renders the shared `ListingCardBase` (`components/
 * ListingCardBase`) directly rather than reusing `search`'s
 * `SearchResultCard`: `search` already depends on `favorites` (every
 * `SearchResultCard` renders a `FavoriteButton`), so this page also
 * depending on `search` would close a real
 * `search -> favorites -> FavoritesPageContent -> search` import cycle.
 * `ListingCardBase` lives in module-agnostic shared `components/`, so
 * reusing it directly here has no such back-edge. `ListingCardBase`
 * already renders as an `elevated` premium surface (Phase 12), so this
 * page's own redesign work is entirely in the page-level composition,
 * not the card itself.
 *
 * 2026 Customer Account redesign: groups the same flat, already-paginated
 * `favorites` array by `city_name` (a real field the favorites DTO
 * already returns — no new query) instead of one flat grid (brief:
 * "destination grouping where existing data permits"). A favorite with
 * no city on record falls into one final ungrouped section rather than
 * being dropped.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Section, Stack } from '@desavii/ui/components/layout';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { Heart } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import ListingCardBase from '../../../../components/ListingCardBase/ListingCardBase.jsx';
import ListingGrid from '../../../../components/ListingGrid/ListingGrid.jsx';
import FavoriteButton from '../FavoriteButton/FavoriteButton.jsx';
import { useFavoritesQuery } from '../../queries/useFavoritesQuery.js';
import styles from './FavoritesPageContent.module.scss';

function FavoritesGridSkeleton() {
  return (
    <ListingGrid>
      {Array.from({ length: 6 }, (_, index) => (
        // eslint-disable-next-line react/no-array-index-key -- fixed skeleton count, no real data yet
        <Skeleton key={index} variant="rect" height={280} />
      ))}
    </ListingGrid>
  );
}

function groupByDestination(favorites, ungroupedLabel) {
  const groups = new Map();
  favorites.forEach((favorite) => {
    const key = favorite.city_name || ungroupedLabel;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(favorite);
  });
  return Array.from(groups.entries()).map(([city, items]) => ({ city, items }));
}

export default function FavoritesPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFavoritesQuery();

  const favorites = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );
  const groups = useMemo(
    () => groupByDestination(favorites, t('favorites.page.otherPlaces')),
    [favorites, t],
  );

  return (
    <Section spacing="default">
      <PageHeader
        title={t('favorites.page.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          {
            label: t('favorites.page.heading'),
            href: `/${locale}/account/favorites`,
          },
        ]}
      />

      {isError ? (
        <ErrorState
          title={t('favorites.page.errorTitle')}
          retryLabel={t('favorites.page.errorRetry')}
          onRetry={() => refetch()}
        />
      ) : (
        <Stack gap="8">
          {isPending && <FavoritesGridSkeleton />}
          {!isPending && favorites.length === 0 && (
            <EmptyState
              illustration={<Heart size={40} aria-hidden="true" />}
              title={t('favorites.page.emptyTitle')}
              description={t('favorites.page.emptyDescription')}
              actionLabel={t('favorites.page.emptyAction')}
              onAction={() => navigate(`/${locale}/search`)}
            />
          )}
          {!isPending &&
            groups.map(({ city, items }) => (
              <Stack key={city} gap="3" as="div">
                <h2 className={styles.groupHeading}>{city}</h2>
                <ListingGrid>
                  {items.map((favorite) => (
                    <ListingCardBase
                      key={favorite.favorite_id}
                      href={`/${locale}/listings/${favorite.listing_id}`}
                      imageUrl={favorite.cover_image_url}
                      typeLabel={t(`listings.type.${favorite.listing_type}`, {
                        defaultValue: favorite.listing_type,
                      })}
                      favoriteButton={
                        <FavoriteButton listingId={favorite.listing_id} />
                      }
                      title={favorite.title}
                      ratingAverage={favorite.rating_average}
                      reviewCount={favorite.review_count}
                      priceAmount={favorite.price_amount}
                      priceCurrencyCode={favorite.price_currency_code}
                      locale={locale}
                    />
                  ))}
                </ListingGrid>
              </Stack>
            ))}
          {hasNextPage && (
            <Button
              variant="ghost"
              onClick={() => fetchNextPage()}
              loading={isFetchingNextPage}
            >
              {t('favorites.page.loadMore')}
            </Button>
          )}
        </Stack>
      )}
    </Section>
  );
}
