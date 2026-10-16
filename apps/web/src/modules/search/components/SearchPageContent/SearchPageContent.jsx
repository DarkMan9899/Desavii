/**
 * SearchPageContent — the `search` module's page-level content.
 *
 * Reading order, top to bottom: title → the search panel
 * (`SearchFilters`: primary fields inline on Tablet+, a one-line summary
 * plus the filters drawer on phones, AI search behind a toggle) → active
 * filter chips → result count and sort (`SearchToolbar`) → results.
 * The page uses compact spacing (not a marketing `Section`'s 64–96px
 * band) so the first results start on the first screen at every width —
 * the old stack of section padding, an always-open AI panel and five
 * stacked fields pushed them below the fold on phones.
 *
 * Filter state lives only in the URL (`useSearchFilters`); the
 * categories and destinations catalogs it needs are loaded here, and the
 * search waits until they have resolved what the URL means
 * (`isResolved`), so a deep link sends exactly one request. Results come
 * from `GET /search` (`useSearchListingsQuery`, cursor pagination via
 * "Load more"), keeping the previous cards on screen while a changed
 * search loads.
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section } from '@desavii/ui/components/layout';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { useSearchFilters } from '../../hooks/useSearchFilters.js';
import { useRenderableFilterGroups } from '../../hooks/useRenderableFilterGroups.js';
import { useSearchListingsQuery } from '../../queries/useSearchListingsQuery.js';
import { useCategoriesQuery } from '../../queries/useCategoriesQuery.js';
import { useDestinationsQuery } from '../../queries/useDestinationsQuery.js';
import { getSearchCapabilities } from '../../utils/categoryFilterCapabilities.js';
import { buildActiveSearchChips } from '../../utils/activeSearchChips.js';
import SearchFilters from '../SearchFilters/SearchFilters.jsx';
import ActiveFilters from '../ActiveFilters/ActiveFilters.jsx';
import SearchToolbar from '../SearchToolbar/SearchToolbar.jsx';
import SearchResults from '../SearchResults/SearchResults.jsx';
import { trackSearchImpression } from '../../../../analytics/index.js';
import styles from './SearchPageContent.module.scss';

const NO_ITEMS = [];

export default function SearchPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { data: categories } = useCategoriesQuery({ locale: i18n.language });
  const { data: destinations } = useDestinationsQuery({
    locale: i18n.language,
  });
  const {
    filters,
    categorySlug,
    isResolved,
    updateFilters,
    updateDynamicFilter,
    clearFilters,
    hasActiveFilters,
  } = useSearchFilters({ categories, destinations });
  const groups = useRenderableFilterGroups(filters.categoryId);
  const { party } = getSearchCapabilities(categorySlug);

  const {
    data,
    isPending,
    isError,
    isPlaceholderData,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearchListingsQuery(filters, {
    locale: i18n.language,
    enabled: isResolved,
    keepPreviousResults: true,
  });

  const results = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );
  const total = data?.pages[0]?.meta?.total;
  const isLoading = !isResolved || isPending;

  const chips = buildActiveSearchChips({
    filters,
    categories: categories ?? NO_ITEMS,
    destinations: destinations ?? NO_ITEMS,
    groups,
    party,
    t,
    locale: i18n.language,
  });

  const removeChip = (chip) => {
    if (chip.dynamicKeys) {
      updateDynamicFilter(
        Object.fromEntries(chip.dynamicKeys.map((key) => [key, ''])),
      );
      return;
    }
    updateFilters(chip.patch);
  };

  // One `search_impression` per genuinely NEW resolved search state
  // (brief §24) — never for the previous results still shown while a
  // changed search loads, and never again for "Load more" (same filters,
  // another page). The client-side dedup inside `trackSearchImpression`
  // (session_id + this key) also makes this StrictMode-safe (brief §35).
  useEffect(() => {
    if (isLoading || isError || isPlaceholderData) return;
    trackSearchImpression(
      {
        queryText: filters.destination || undefined,
        categoryCode: categorySlug,
        resultCount: total ?? results.length,
        locale,
      },
      JSON.stringify({
        destination: filters.destination ?? null,
        categoryId: filters.categoryId ?? null,
        cityId: filters.cityId ?? null,
        sort: filters.sort ?? null,
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
        guests: filters.guests ?? null,
        priceMin: filters.priceMin ?? null,
        priceMax: filters.priceMax ?? null,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the same filter fields serialized into the dedup key above, not on `results`/`total` (recomputing the impression payload every "Load more" page would be wrong, not just redundant).
  }, [
    isLoading,
    isError,
    isPlaceholderData,
    filters.destination,
    filters.categoryId,
    filters.cityId,
    filters.sort,
    filters.dateFrom,
    filters.dateTo,
    filters.guests,
    filters.priceMin,
    filters.priceMax,
    locale,
  ]);

  // Phase 20 (SEO) §9: arbitrary filter-param combinations are a crawl
  // trap — Search is deliberately `noindex`. Category/Destination landing
  // pages (`/categories/:slug`, `/destinations/:slug`) are the real
  // indexable entry points into inventory.
  useSeo({
    title: t('seo.search.title'),
    locale,
    path: 'search',
    noindex: true,
    skipHreflang: true,
  });

  return (
    <Section spacing="none" className={styles.page}>
      <PageHeader
        title={t('pages.search.title')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('pages.search.title'), href: `/${locale}/search` },
        ]}
      />
      <div className={styles.layout}>
        <SearchFilters
          filters={filters}
          categories={categories ?? NO_ITEMS}
          destinations={destinations ?? NO_ITEMS}
          onApply={updateFilters}
          onAiApply={updateFilters}
        />
        <ActiveFilters
          chips={chips}
          onRemoveChip={removeChip}
          onClearAll={clearFilters}
        />
        <SearchToolbar
          total={total}
          isLoading={isLoading}
          isUpdating={isPlaceholderData}
          sort={filters.sort}
          hasKeyword={Boolean(filters.destination)}
          onSortChange={(sort) => updateFilters({ sort })}
        />
        <SearchResults
          results={results}
          isPending={isLoading}
          isError={isError}
          onRetry={refetch}
          hasNextPage={Boolean(hasNextPage)}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          isUpdating={isPlaceholderData}
          emptyDescription={
            filters.dateFrom ? t('search.results.empty.withDates') : undefined
          }
          emptyActionLabel={
            hasActiveFilters ? t('search.filters.clearAll') : undefined
          }
          onEmptyAction={hasActiveFilters ? clearFilters : undefined}
          searchContext={{
            queryText: filters.destination || undefined,
            categoryCode: categorySlug,
          }}
        />
      </div>
    </Section>
  );
}
