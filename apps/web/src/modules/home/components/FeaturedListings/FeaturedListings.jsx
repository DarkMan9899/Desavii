/**
 * FeaturedListings — the `home` module's real Featured/TOP section
 * (FRONTEND_ARCHITECTURE.md §6). Sprint E (Promotion Engine): now sourced
 * from `GET /advertising/public/home-featured` — genuinely, currently
 * ACTIVE Home-placement promotions — never a generic "most recent
 * listings" query wearing a "Featured" label. Reuses `SearchResultCard`
 * unmodified (the endpoint returns the exact same card DTO shape
 * `search` already produces, hydrated via `SearchService#getListingsByIds`
 * server-side — see `AdvertisementService`'s own header) with its new
 * `topBadgeLabel` prop, so this section needs no bespoke card component.
 *
 * Renders all three required states (§1.4) — loading, empty (no active
 * promotion right now — never fake/placeholder cards), error — before
 * content. Presented as a premium showcase carousel (`Showcase`) rather
 * than a static grid, same visual treatment this section already had.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container, Section } from '@desavii/ui/components/layout';
import {
  Skeleton,
  EmptyState,
  Alert,
} from '@desavii/ui/components/feedback-overlays';
import { SearchResultCard } from '../../../search/index.js';
import { usePublicHomeFeaturedQuery } from '../../../advertising/index.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import Showcase from '../Showcase/Showcase.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import styles from './FeaturedListings.module.scss';

const HEADING_ID = 'featured-listings-heading';

export default function FeaturedListings() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { data, isPending, isError } = usePublicHomeFeaturedQuery({ locale });
  const listings = data ?? [];

  return (
    <Section aria-labelledby={HEADING_ID} className={styles.section}>
      <Container size="wide">
        <ScrollReveal variant="depth">
          <SectionHeader
            id={HEADING_ID}
            eyebrow={t('home.featured.eyebrow')}
            title={t('home.featured.title')}
            subtitle={t('home.featured.subtitle')}
            viewAllHref={`/${locale}/search`}
            viewAllLabel={t('home.showcase.viewAll')}
          />
        </ScrollReveal>
      </Container>

      {isPending && (
        <Container size="wide">
          <div className={styles.skeletonRow}>
            {Array.from({ length: 4 }, (_, index) => (
              // eslint-disable-next-line react/no-array-index-key -- skeleton
              // placeholders are positionally static, non-reorderable.
              <Skeleton
                key={index}
                variant="rect"
                height={280}
                className={styles.slide}
              />
            ))}
          </div>
        </Container>
      )}

      {isError && (
        <Container size="wide">
          <Alert variant="danger" title={t('home.featured.error.title')}>
            {t('home.featured.error.description')}
          </Alert>
        </Container>
      )}

      {!isPending && !isError && listings.length === 0 && (
        <Container size="wide">
          <EmptyState
            title={t('home.featured.empty.title')}
            description={t('home.featured.empty.description')}
          />
        </Container>
      )}

      {!isPending && !isError && listings.length > 0 && (
        <ScrollReveal delay={0.1} variant="depth" className={styles.bleedRow}>
          <Showcase
            ariaLabel={t('home.featured.title')}
            slideClassName={styles.slide}
          >
            {listings.map((listing) => (
              <SearchResultCard
                key={listing.id}
                result={listing}
                topBadgeLabel={t('advertising.topBadge')}
              />
            ))}
          </Showcase>
        </ScrollReveal>
      )}
    </Section>
  );
}
