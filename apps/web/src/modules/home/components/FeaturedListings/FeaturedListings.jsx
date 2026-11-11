/**
 * FeaturedListings — Home's featured rail: the active Home promotions
 * (TOP, paid) first, topped up with real top-rated listings and the
 * newest listing of each category when there are too few promotions to
 * fill the rail (`useFeaturedRail` / `selectFeaturedListings`). Every card
 * says why it is there; nothing is repeated or invented.
 *
 * Home featured fix (docs/HOME_REBUILD.md): the rail used to show the
 * promotions only — with one active promotion that was one card beside a
 * heading column. It is now a full-width `HomeCarousel` row of the shared
 * listing card (3+ per row on a laptop), with the counter,
 * paired controls, progress track and autoplay that row brings. A rail
 * of one or two cards (nothing else exists) keeps the spotlight layout,
 * the heading beside the cards, so it never reads as an empty band.
 *
 * Badges: a promotion is TOP and the only card that reports promotion
 * analytics; a newest-per-category fill card is "New"; a top-rated one
 * carries the shared "Top guest rating" badge on its own.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container, Section } from '@desavii/ui/components/layout';
import { EmptyState, Alert } from '@desavii/ui/components/feedback-overlays';
import useFeaturedRail from '../../hooks/useFeaturedRail.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import HomeCarousel from '../HomeCarousel/HomeCarousel.jsx';
import ActionLink from '../ActionLink/ActionLink.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import { SearchResultCard } from '../../../search/index.js';
import { PLACEMENTS } from '../../../../analytics/index.js';
import { FEATURED_SOURCES } from '../../utils/selectFeaturedListings.js';

const HIGHLIGHT_BY_SOURCE = Object.freeze({
  [FEATURED_SOURCES.PROMOTED]: 'top',
  [FEATURED_SOURCES.NEWEST]: 'new',
});

const HEADING_ID = 'featured-listings-heading';
// Up to this many cards, the heading sits beside them instead of above.
const SPOTLIGHT_MAX = 2;

export default function FeaturedListings() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { items, isPending, isError } = useFeaturedRail({ locale });

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
  const layout =
    !isPending && items.length <= SPOTLIGHT_MAX ? 'spotlight' : 'row';

  return (
    <Section aria-labelledby={HEADING_ID}>
      <Container size="wide">
        <ScrollReveal>
          {isPending || items.length > 0 ? (
            <HomeCarousel
              label={t('home.featured.title')}
              header={renderHeader(false)}
              action={action}
              layout={layout}
              size={layout === 'spotlight' ? 'spotlight' : 'feature'}
              isLoading={isPending}
            >
              {items.map(({ listing, source }, index) => {
                const promoted = source === FEATURED_SOURCES.PROMOTED;
                return (
                  <SearchResultCard
                    key={listing.id}
                    result={listing}
                    highlight={HIGHLIGHT_BY_SOURCE[source]}
                    // Only a paid placement is reported as one: a fill card
                    // must never count towards a promotion's impressions.
                    placement={promoted ? PLACEMENTS.HOME_FEATURED : undefined}
                    position={index}
                    promotionId={promoted ? listing.promotion_id : undefined}
                  />
                );
              })}
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

        {!isPending && !isError && items.length === 0 && (
          <EmptyState
            title={t('home.featured.empty.title')}
            description={t('home.featured.empty.description')}
          />
        )}
      </Container>
    </Section>
  );
}
