/**
 * CategoryPageContent — `/:locale/categories/:categorySlug` (Phase 20,
 * SEO). A real, indexable landing page per marketplace category (Hotels,
 * Apartments, Tours, etc.) — the Search page's crawl-trap query params
 * (§9) mean Search itself is `noindex`, so category pages are the actual
 * crawlable entry point into each category's inventory, discoverable via
 * the sitemap and internal links (Home, Header nav, Footer).
 *
 * Reuses exactly the same real data sources every other public page
 * already uses — `useCategoriesQuery` (already returns `slug`/`name`/
 * `listing_count`, Phase 4's real taxonomy) and `useSearchListingsQuery`
 * + `SearchResultCard` (the same listing-grid `RelatedListings`/
 * `CompanyProfilePageContent` already reuse) — no new listing-fetch path,
 * no fabricated content.
 *
 * Public-frontend audit (2026): previously a bare breadcrumb/title/
 * description/grid stack, and the grid used the generic `Grid`
 * primitive's `columns="auto"` mode — a raw 4/8/12-column layout grid,
 * not a card grid, which put 8+ narrow `SearchResultCard`s in one row on
 * desktop with heavily truncated titles. Now: a compact breadcrumb, a
 * restrained editorial hero (`DestinationArt` + the category's own icon,
 * matching `CategoryCard`'s identity so Home -> category feels
 * continuous), then `ListingGrid` (the same 1/2/3/4 card grid `Search`
 * already uses). The per-card category badge is hidden here — every card
 * on this page already IS that category, so repeating the label 8+ times
 * only added visual noise (and, in a cramped grid, read as if the page
 * title itself were duplicating).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Skeleton,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import ListingGrid from '../../../../components/ListingGrid/ListingGrid.jsx';
import EditorialPageHero from '../../../../components/EditorialPageHero/EditorialPageHero.jsx';
import Showcase from '../../../home/components/Showcase/Showcase.jsx';
import { getCategoryIcon } from '../../../../utils/categoryIcons.js';
import { resolveCategoryHeroArt } from '../../../../utils/categoryHeroArt.js';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import {
  useCategoriesQuery,
  useSearchListingsQuery,
  SearchResultCard,
  DynamicFilterPanel,
} from '../../../search/index.js';
import { usePublicCategoryTopQuery } from '../../../advertising/index.js';
import styles from './CategoryPageContent.module.scss';

export default function CategoryPageContent() {
  const { t } = useTranslation();
  const { locale, categorySlug } = useParams();
  const navigate = useNavigate();

  const {
    data: categories,
    isPending,
    isError,
    refetch,
  } = useCategoriesQuery({
    locale,
  });
  const category = categories?.find(
    (candidate) => candidate.slug === categorySlug,
  );

  // Pass 6 (Restaurant vertical, owner issue #13/#15): the same
  // category-scoped attribute filtering (`GET /search/filters` +
  // `DynamicFilterPanel`) `SearchPageContent` already has, on the real
  // indexable category landing page — this page had NO filter UI at all
  // despite the backend already fully supporting it (Restaurants'
  // cuisine/price-tier being the concrete gap that surfaced this).
  // Deliberately local component state, never synced to this page's own
  // URL the way `/search` syncs its filters: `/search` is `noindex`
  // specifically because arbitrary filter-param combinations are a crawl
  // trap (see that page's own header comment) — persisting filters into
  // this page's URL would recreate exactly that risk on a page that's
  // meant to stay indexable. Reset whenever the category itself changes,
  // so a filter chosen under one category's catalog never silently
  // carries over and narrows a different category's results.
  const [dynamicFilters, setDynamicFilters] = useState({});
  useEffect(() => {
    setDynamicFilters({});
  }, [categorySlug]);

  const updateDynamicFilter = useCallback((patch) => {
    setDynamicFilters((current) => {
      const next = { ...current };
      Object.entries(patch).forEach(([key, value]) => {
        if (value) {
          next[key] = value;
        } else {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  // 2026 SEO/performance audit: real, confirmed waste, caught via a live
  // network capture — without `enabled`, this fired once with
  // `categoryId: undefined` (an unfiltered "all listings" fetch, whose
  // result is never rendered — the component is still showing the
  // categories-pending skeleton at that point) and again, correctly
  // filtered, the instant `category.id` resolved. `!category` already
  // early-returns above before any JSX reads `isListingsPending`, so
  // gating on `Boolean(category?.id)` never leaves the page stuck
  // showing a listings skeleton.
  const { data: listingsData, isPending: isListingsPending } =
    useSearchListingsQuery(
      { categoryId: category?.id, dynamicFilters },
      { locale, enabled: Boolean(category?.id) },
    );
  const listings = listingsData?.pages[0]?.results ?? [];
  // Sprint E (Promotion Engine, spec §19): active CATEGORY_TOP listings
  // for this category, shown in their own section before the normal
  // grid above. The backend already excludes any listing shown here from
  // `listings` (see `mysqlSearchRepository.js`'s CATEGORY_TOP exclusion)
  // — never duplicated between the two sections.
  const { data: topListings, isPending: isTopPending } =
    usePublicCategoryTopQuery(category?.id, {
      locale,
      enabled: Boolean(category?.id),
    });

  const canonicalPath = `categories/${categorySlug}`;
  const breadcrumbItems = category
    ? [
        { label: t('nav.home'), href: `/${locale}` },
        { label: category.name, href: `/${locale}/${canonicalPath}` },
      ]
    : [];

  useSeo({
    title: category
      ? t('seo.category.title', { category: category.name })
      : undefined,
    description: category
      ? t('seo.category.description', { category: category.name })
      : undefined,
    locale,
    path: category ? canonicalPath : undefined,
    noindex: !category,
    skipHreflang: !category,
    jsonLd: category ? [buildBreadcrumbListSchema(breadcrumbItems)] : undefined,
  });

  if (isPending) {
    return (
      <div
        aria-busy="true"
        aria-label={t('discovery.category.loading')}
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
        title={t('discovery.category.errorTitle')}
        retryLabel={t('discovery.category.retry')}
        onRetry={refetch}
      />
    );
  }

  if (!category) {
    return (
      <EmptyState
        title={t('errors.notFound.title')}
        description={t('errors.notFound.description')}
        actionLabel={t('errors.notFound.action')}
        onAction={() => navigate(`/${locale}`)}
      />
    );
  }

  const Icon = getCategoryIcon(category.slug);
  // Pass 7B (category visual closure, brief §2/§3) — each of the 9 real
  // categories now gets its OWN unique motif (not just a combo shared
  // with another category, Pass 7's limitation) — see `categoryHeroArt.js`.
  // Falls back to the previous accidental-but-stable `category.id` seed
  // hash for a category outside the known 9.
  const heroArt = resolveCategoryHeroArt(category.slug, category.id);

  return (
    <div className={styles.page}>
      <EditorialPageHero
        breadcrumbItems={breadcrumbItems}
        heroSeed={heroArt.seed}
        heroMotif={heroArt.motif}
        heroMeshVariant={heroArt.meshVariant}
        icon={Icon}
        eyebrow={t('nav.explore')}
        title={category.name}
        lead={t('seo.category.description', { category: category.name })}
      >
        {category.listing_count > 0 && (
          <span className={styles.count}>
            {t('home.categories.listingCount', {
              count: category.listing_count,
            })}
          </span>
        )}
      </EditorialPageHero>

      <DynamicFilterPanel
        categoryId={category.id}
        dynamicFilters={dynamicFilters}
        onChange={updateDynamicFilter}
      />

      {!isTopPending && topListings?.length > 0 && (
        <section
          className={styles.topSection}
          aria-labelledby="category-top-heading"
        >
          <h2 id="category-top-heading" className={styles.topSectionHeading}>
            {t('discovery.category.topHeading', { category: category.name })}
          </h2>
          {/* Pass 7B (brief §11/§17) — the same premium carousel engine
              Home's Featured section uses, not a plain grid: Category TOP
              is a paid placement and must visibly feel more premium than
              the ordinary inventory grid below it. Every card already
              carries this category's own visual identity (aspect ratio,
              price unit, real metadata chips) via `SearchResultCard` —
              nothing category-specific to add here beyond the carousel
              shell itself. */}
          <Showcase
            ariaLabel={t('discovery.category.topHeading', {
              category: category.name,
            })}
            slideClassName={styles.topSlide}
          >
            {topListings.map((listing) => (
              <SearchResultCard
                key={listing.id}
                result={listing}
                hideTypeBadge
                topBadgeLabel={t('advertising.topBadge')}
              />
            ))}
          </Showcase>
        </section>
      )}

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
          title={t('discovery.category.emptyTitle')}
          description={t('discovery.category.emptyDescription')}
        />
      )}

      {!isListingsPending && listings.length > 0 && (
        <ListingGrid>
          {listings.map((listing, index) => (
            <SearchResultCard
              key={listing.id}
              result={listing}
              hideTypeBadge
              // 2026 SEO/performance audit: real Lighthouse trace evidence
              // identified this grid's first card image as the page's
              // actual LCP element, unconditionally lazy-loaded (Load
              // Delay alone was 70% of a 4.7s LCP) — only the first card
              // opts out of the default lazy behavior.
              priorityImage={index === 0}
            />
          ))}
        </ListingGrid>
      )}
    </div>
  );
}
