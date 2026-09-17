/**
 * CompanyProfilePageContent — `/:locale/companies/:slug` (Phase 10
 * redesign; editorial hero + `ListingGrid` in the 2026 public-frontend
 * audit's Company Profile pass). Real `GET /partners/:slug` data (logo/
 * cover/description/contact — Sprint 5 columns no UI had ever surfaced)
 * plus a "Listings" section. `rating_average`/`review_count` ARE real,
 * already-returned `GET /partners/:slug` fields (an aggregate across the
 * partner's own reviews, computed server-side — see
 * `mysqlPartnerRepository.js`'s `PUBLIC_SELECT_COLUMNS`) and surface in
 * the hero; there is still no per-review listing UI at the company
 * level (no `GET /partners/:slug/reviews` endpoint exists) — only the
 * aggregate metric, not fabricated further.
 *
 * Company Public Profile (Step A2) — the Listings section now calls the
 * dedicated, properly-paginated `usePartnerListingsQuery` (wrapping the
 * new `GET /partners/:slug/listings`) instead of the previous
 * `useSearchListingsQuery({ partnerId })` workaround (single-page-only,
 * no "load more" for a company's own catalog). Both endpoints return the
 * identical flat card-field shape `searchDto.js`'s `toSearchResultResponse`
 * does, so `SearchResultCard` keeps rendering every card unchanged — no
 * new card component, no category branching here: `categoryVisualKey`/
 * `buildCategoryCardMeta`/`resolveCardConfig`/Money-FX all keep working
 * exactly as they do on Search/Category/Home, so a company's Hotel still
 * looks like a Hotel card, a company's Tour like a Tour card, etc.
 * Pagination UX mirrors `CompaniesDirectoryPageContent`'s own "Load
 * more" button pattern exactly (manual button, not scroll-triggered —
 * the established convention for every cursor-paginated list in this
 * codebase).
 *
 * Same two-distinct-error-states convention as
 * `ListingDetailPageContent`: a genuine 404 (unapproved/deleted/
 * nonexistent slug) renders the shared `errors.notFound.*` `EmptyState`;
 * any other failure gets the generic retryable `ErrorState`. The
 * Listings section gets its own, separate loading/error/empty states
 * (never conflated with the company-profile fetch's own) — a valid
 * company with zero public listings is a valid, non-error profile.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Globe, Mail, Phone, ShieldCheck } from 'lucide-react';
import {
  Skeleton,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import { RatingStars } from '@desavii/ui/components/data-display';
import { Icon, Button } from '@desavii/ui/components/primitives';
import RouterLink from '../../../../components/RouterLink.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import CompanyAvatar from '../../../../components/CompanyAvatar/CompanyAvatar.jsx';
import ListingGrid from '../../../../components/ListingGrid/ListingGrid.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import getLocalizedTranslation from '../../../listings/utils/getLocalizedTranslation.js';
import { useCompanyQuery } from '../../queries/useCompanyQuery.js';
import { usePartnerListingsQuery } from '../../queries/usePartnerListingsQuery.js';
import { SearchResultCard } from '../../../search/index.js';
import styles from './CompanyProfilePageContent.module.scss';

const LISTINGS_SKELETON_COUNT = 3;

// Brand names, not translated content — same convention as leaving
// "Facebook"/"Instagram" untranslated on `PartnerProfilePageContent`'s
// own edit form (`partner.profile.social.*`'s own strings are the
// identical brand names in every locale, for the same reason).
const SOCIAL_PLATFORM_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

export default function CompanyProfilePageContent() {
  const { t } = useTranslation();
  const { locale, slug } = useParams();
  const navigate = useNavigate();

  const {
    data: company,
    isPending,
    isError,
    error,
    refetch,
  } = useCompanyQuery(slug);

  const {
    data: listingsData,
    isPending: isListingsPending,
    isError: isListingsError,
    refetch: refetchListings,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePartnerListingsQuery(slug);
  const listings = useMemo(
    () => listingsData?.pages.flatMap((page) => page.results) ?? [],
    [listingsData],
  );

  // P1.3 (Master Roadmap): `description` moved from a flat column to
  // `partner_translations` — resolved for the current locale via the
  // same `getLocalizedTranslation` util listings use, falling back to
  // the "any available" flat `description` (Companies-directory-card
  // fallback — see `mysqlPartnerRepository.js`'s own comment) only if
  // no translation matched at all.
  const description =
    getLocalizedTranslation(company?.translations, locale)?.description ||
    company?.description ||
    '';
  const socialLinks = Object.entries(company?.social_links ?? {}).filter(
    ([, url]) => url,
  );

  const canonicalPath = `companies/${slug}`;
  const breadcrumbItems = company
    ? [
        { label: t('nav.home'), href: `/${locale}` },
        { label: t('companies.directory.title'), href: `/${locale}/companies` },
        { label: company.display_name, href: `/${locale}/${canonicalPath}` },
      ]
    : [];

  useSeo({
    title: company ? `${company.display_name} | ${t('app.name')}` : undefined,
    description: description || t('seo.companies.description'),
    locale,
    path: company ? canonicalPath : undefined,
    noindex: !company,
    skipHreflang: !company,
    image: company?.logo_url || undefined,
    jsonLd: company ? [buildBreadcrumbListSchema(breadcrumbItems)] : undefined,
  });

  if (isPending) {
    return (
      <div
        className={styles.page}
        aria-busy="true"
        aria-label={t('companies.profile.loading')}
      >
        <Skeleton variant="text" width="30%" height={20} />
        <Skeleton variant="rect" height={280} className={styles.heroSkeleton} />
        <Skeleton variant="rect" height={120} />
      </div>
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
        title={t('companies.profile.errorTitle')}
        retryLabel={t('companies.profile.retry')}
        onRetry={refetch}
      />
    );
  }

  const memberSinceYear = company.member_since
    ? new Date(company.member_since).getFullYear()
    : null;

  return (
    <div className={styles.page}>
      <Breadcrumbs
        items={breadcrumbItems}
        linkComponent={RouterLink}
        className={styles.breadcrumbs}
      />

      <section className={styles.hero}>
        {company.cover_url ? (
          <img
            src={company.cover_url}
            alt=""
            className={styles.coverImage}
            loading="lazy"
          />
        ) : (
          <DestinationArt seed={company.id} className={styles.coverArt} />
        )}
        <div className={styles.heroContent}>
          <span className={styles.logo}>
            <CompanyAvatar
              name={company.display_name}
              logoUrl={company.logo_url}
              seed={company.id}
              size={96}
            />
          </span>
          <div className={styles.heroText}>
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{company.display_name}</h1>
              {company.is_verified && (
                <span className={styles.verifiedBadge}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  {t('companies.card.verified')}
                </span>
              )}
            </div>
            <div className={styles.metaRow}>
              {company.review_count > 0 && (
                <span className={styles.rating}>
                  <RatingStars
                    value={company.rating_average}
                    reviewCount={company.review_count}
                    size="sm"
                    showCount={false}
                  />
                  {t('pages.listingDetail.hero.reviewsLink', {
                    count: company.review_count,
                  })}
                </span>
              )}
              {memberSinceYear && (
                <span className={styles.memberSince}>
                  {t('companies.card.memberSince', { year: memberSinceYear })}
                </span>
              )}
            </div>
            {description && <p className={styles.description}>{description}</p>}
          </div>
        </div>
      </section>

      {(company.email ||
        company.phone ||
        company.website ||
        socialLinks.length > 0) && (
        <div className={styles.contactRow}>
          {company.email && (
            <a href={`mailto:${company.email}`} className={styles.contactChip}>
              <Icon icon={Mail} size="sm" />
              {company.email}
            </a>
          )}
          {company.phone && (
            <a href={`tel:${company.phone}`} className={styles.contactChip}>
              <Icon icon={Phone} size="sm" />
              {company.phone}
            </a>
          )}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className={styles.contactChip}
            >
              <Icon icon={Globe} size="sm" />
              {company.website}
            </a>
          )}
          {socialLinks.map(([platform, url]) => (
            <a
              key={platform}
              href={url}
              target="_blank"
              rel="noreferrer"
              className={styles.contactChip}
            >
              <Icon icon={Globe} size="sm" />
              {SOCIAL_PLATFORM_LABELS[platform] ?? platform}
            </a>
          ))}
        </div>
      )}

      <section aria-label={t('companies.profile.listingsHeading')}>
        <h2 className={styles.listingsHeading}>
          {t('companies.profile.listingsHeading')}
        </h2>

        {isListingsPending && (
          <ListingGrid>
            {Array.from({ length: LISTINGS_SKELETON_COUNT }, (_, index) => (
              // eslint-disable-next-line react/no-array-index-key -- fixed skeleton count, no real data yet
              <Skeleton key={index} variant="rect" height={280} />
            ))}
          </ListingGrid>
        )}

        {isListingsError && (
          <ErrorState
            title={t('companies.profile.listingsErrorTitle')}
            retryLabel={t('companies.profile.retry')}
            onRetry={refetchListings}
          />
        )}

        {!isListingsPending && !isListingsError && listings.length === 0 && (
          <EmptyState
            title={t('companies.profile.listingsEmptyTitle')}
            description={t('companies.profile.listingsEmptyDescription')}
          />
        )}

        {!isListingsPending && !isListingsError && listings.length > 0 && (
          <div>
            <ListingGrid>
              {listings.map((listing) => (
                <SearchResultCard key={listing.id} result={listing} />
              ))}
            </ListingGrid>
            {hasNextPage && (
              <div className={styles.loadMore}>
                <Button
                  variant="secondary"
                  onClick={fetchNextPage}
                  loading={isFetchingNextPage}
                >
                  {t('companies.profile.loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
