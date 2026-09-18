/**
 * SearchPageContent — the `search` module's page-level content.
 *
 * Phase 4 (Search & Discovery): real `GET /search` results, replacing
 * the earlier `UnderConstructionPage` placeholder. Filter state lives in
 * the URL (`useSearchFilters`) and results come from `GET /search`
 * directly (`useSearchListingsQuery`, `useInfiniteQuery` over the
 * backend's own cursor pagination) — no fake data, no endpoint that
 * doesn't already exist.
 *
 * Stage 15.2 (AI Search) wires `AiSearchBar` in as exactly the seam this
 * component was always meant to be: it parses free text into real
 * filters (`ai` module, `POST /ai/search/parse`) and applies them
 * through the same `updateFilters` write path `SearchFilters` already
 * uses — no parallel filter state, no change to `SearchFilters` or
 * `SearchResults` themselves. See `modules/search/README.md`'s Phase 4
 * section.
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Section } from '@desavii/ui/components/layout';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { useSearchFilters } from '../../hooks/useSearchFilters.js';
import { useSearchListingsQuery } from '../../queries/useSearchListingsQuery.js';
import { useCategoriesQuery } from '../../queries/useCategoriesQuery.js';
import SearchFilters from '../SearchFilters/SearchFilters.jsx';
import SearchResults from '../SearchResults/SearchResults.jsx';
import DynamicFilterPanel from '../DynamicFilterPanel/DynamicFilterPanel.jsx';
import { AiSearchBar } from '../../../ai/index.js';
import { trackSearchImpression } from '../../../../analytics/index.js';

export default function SearchPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const {
    filters,
    updateFilters,
    updateDynamicFilter,
    clearFilters,
    hasActiveFilters,
  } = useSearchFilters();

  // Phase 10: the primary nav's "Explore" menu links to categories it
  // only knows by slug (a stable, human-readable identifier), not the
  // numeric `categoryId` `searchParams.js` stores — category ids vary by
  // environment/DB state, so a static nav config can't hardcode them.
  // This one-time effect resolves an incoming `?category=<slug>` into
  // the real `categoryId` once categories have loaded, then clears the
  // slug param so the URL settles into `searchParams.js`'s normal
  // `categoryId`-only shape — nothing else in this file's filter model
  // changes.
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: categories } = useCategoriesQuery({ locale: i18n.language });
  useEffect(() => {
    const categorySlug = searchParams.get('category');
    if (!categorySlug || !categories) return;
    const matched = categories.find(
      (category) => category.slug === categorySlug,
    );
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    if (matched) next.set('categoryId', String(matched.id));
    setSearchParams(next, { replace: true });
  }, [searchParams, categories, setSearchParams]);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearchListingsQuery(filters, { locale: i18n.language });

  const results = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  // Step A3 (engagement analytics) — a code-shaped identifier for
  // `search_impression.categoryCode`, resolved from the already-loaded
  // `categories` list rather than the numeric `filters.categoryId` the
  // URL carries.
  const activeCategorySlug = categories?.find(
    (category) => category.id === filters.categoryId,
  )?.slug;

  // One `search_impression` per genuinely NEW resolved search state
  // (brief §24) — the dedup key is the exact same query-param
  // serialization `useSearchListingsQuery` already uses for its own
  // React Query cache key, so "Load more" (same filters, another page)
  // never re-fires this, but a real filter/query change does. The
  // client-side dedup inside `trackSearchImpression` (session_id +
  // this key) is also what makes this StrictMode-safe (brief §35) — the
  // effect may run twice, the second call is a silent no-op.
  useEffect(() => {
    if (isPending || isError) return;
    trackSearchImpression(
      {
        queryText: filters.destination || undefined,
        categoryCode: activeCategorySlug,
        resultCount: results.length,
        locale,
      },
      JSON.stringify({
        destination: filters.destination ?? null,
        categoryId: filters.categoryId ?? null,
        sort: filters.sort ?? null,
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
        guests: filters.guests ?? null,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the same filter fields serialized into the dedup key above, not on `results`/`activeCategorySlug` (recomputing the impression payload every "Load more" page would be wrong, not just redundant).
  }, [
    isPending,
    isError,
    filters.destination,
    filters.categoryId,
    filters.sort,
    filters.dateFrom,
    filters.dateTo,
    filters.guests,
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
    <Section spacing="default">
      <PageHeader
        title={t('pages.search.title')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('pages.search.title'), href: `/${locale}/search` },
        ]}
      />
      <AiSearchBar onApply={updateFilters} />
      <SearchFilters
        filters={filters}
        onUpdateFilters={updateFilters}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />
      <DynamicFilterPanel
        categoryId={filters.categoryId}
        dynamicFilters={filters.dynamicFilters}
        onChange={updateDynamicFilter}
      />
      <SearchResults
        results={results}
        isPending={isPending}
        isError={isError}
        onRetry={refetch}
        hasNextPage={Boolean(hasNextPage)}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={fetchNextPage}
        searchContext={{
          queryText: filters.destination || undefined,
          categoryCode: activeCategorySlug,
        }}
      />
    </Section>
  );
}
