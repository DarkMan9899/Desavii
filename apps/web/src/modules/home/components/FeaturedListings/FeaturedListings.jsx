/**
 * FeaturedListings — Home's promoted listings (`GET /advertising/home-
 * featured`): paid placements, each marked with the TOP badge so a
 * promotion never reads as an editorial pick, and each impression/click
 * reported under `PLACEMENTS.HOME_FEATURED`.
 *
 * Home rebuild (docs/HOME_REBUILD.md): same data and card
 * (`SearchResultCard`); the row is now `HomeCarousel` (no autoplay, no
 * loop). With no active promotion the section says so instead of leaving
 * an empty band.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container, Section } from '@desavii/ui/components/layout';
import { EmptyState, Alert } from '@desavii/ui/components/feedback-overlays';
import { SearchResultCard } from '../../../search/index.js';
import { usePublicHomeFeaturedQuery } from '../../../advertising/index.js';
import { PLACEMENTS } from '../../../../analytics/index.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import HomeCarousel from '../HomeCarousel/HomeCarousel.jsx';
import ActionLink from '../ActionLink/ActionLink.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';

const HEADING_ID = 'featured-listings-heading';

export default function FeaturedListings() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { data, isPending, isError } = usePublicHomeFeaturedQuery({ locale });
  const listings = data ?? [];

  // The row shows its link beside the controls; without a row (error,
  // empty) the heading keeps it.
  const renderHeader = (withLink) => (
    <SectionHeader
      id={HEADING_ID}
      eyebrow={t('home.featured.eyebrow')}
      title={t('home.featured.title')}
      subtitle={t('home.featured.subtitle')}
      viewAllHref={withLink ? `/${locale}/search` : undefined}
      viewAllLabel={withLink ? t('home.showcase.viewAll') : undefined}
    />
  );
  const action = (
    <ActionLink href={`/${locale}/search`}>
      {t('home.showcase.viewAll')}
    </ActionLink>
  );

  return (
    <Section aria-labelledby={HEADING_ID}>
      <Container size="wide">
        <ScrollReveal>
          {isPending || listings.length > 0 ? (
            <HomeCarousel
              label={t('home.featured.title')}
              header={renderHeader(false)}
              action={action}
              layout="spotlight"
              size="spotlight"
              isLoading={isPending}
            >
              {listings.map((listing, index) => (
                <SearchResultCard
                  key={listing.id}
                  result={listing}
                  topBadgeLabel={t('advertising.topBadge')}
                  placement={PLACEMENTS.HOME_FEATURED}
                  position={index}
                  promotionId={listing.promotion_id}
                />
              ))}
            </HomeCarousel>
          ) : (
            renderHeader(true)
          )}
        </ScrollReveal>

        {isError && (
          <Alert variant="danger" title={t('home.featured.error.title')}>
            {t('home.featured.error.description')}
          </Alert>
        )}

        {!isPending && !isError && listings.length === 0 && (
          <EmptyState
            title={t('home.featured.empty.title')}
            description={t('home.featured.empty.description')}
          />
        )}
      </Container>
    </Section>
  );
}
