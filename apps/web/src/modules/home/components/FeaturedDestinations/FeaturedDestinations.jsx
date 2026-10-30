/**
 * FeaturedDestinations — the places with the most to book right now: the
 * destinations from `GET /search/destinations` that have listings, most
 * listings first (at most six), as a row of photo cards.
 *
 * Home rebuild (docs/HOME_REBUILD.md): the order is real inventory, not a
 * curated ranking, and the row uses `HomeCarousel` (no autoplay, no loop).
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container, Section } from '@desavii/ui/components/layout';
import {
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { useDestinationsQuery } from '../../../search/index.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import HomeCarousel from '../HomeCarousel/HomeCarousel.jsx';
import ActionLink from '../ActionLink/ActionLink.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import DestinationCard from '../DestinationCard/DestinationCard.jsx';
import styles from './FeaturedDestinations.module.scss';

const HEADING_ID = 'featured-destinations-heading';
const FEATURED_DESTINATIONS_LIMIT = 6;

export default function FeaturedDestinations() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { data, isPending, isError, refetch } = useDestinationsQuery({
    locale,
  });
  const destinations = (data ?? [])
    .filter((destination) => destination.listing_count > 0)
    .sort((a, b) => b.listing_count - a.listing_count)
    .slice(0, FEATURED_DESTINATIONS_LIMIT);

  // The photographs sit on the ink band — the page's signature moment —
  // whenever there are any; loading keeps the band so nothing flashes.
  const hasRow = isPending || destinations.length > 0;
  const tone = hasRow ? 'dark' : 'light';

  // The row shows its link beside the controls; without a row (error,
  // empty) the heading keeps it.
  const renderHeader = (withLink) => (
    <SectionHeader
      id={HEADING_ID}
      eyebrow={t('home.destinations.eyebrow')}
      title={t('home.destinations.title')}
      subtitle={t('home.destinations.subtitle')}
      tone={tone}
      viewAllHref={withLink ? `/${locale}/search` : undefined}
      viewAllLabel={withLink ? t('home.showcase.viewAll') : undefined}
    />
  );

  return (
    <Section
      aria-labelledby={HEADING_ID}
      className={hasRow ? styles.band : undefined}
    >
      <Container size="wide">
        <ScrollReveal>
          {hasRow ? (
            <HomeCarousel
              label={t('home.destinations.title')}
              header={renderHeader(false)}
              action={
                <ActionLink href={`/${locale}/search`} tone="dark">
                  {t('home.showcase.viewAll')}
                </ActionLink>
              }
              size="tall"
              tone="dark"
              isLoading={isPending}
            >
              {destinations.map((destination) => (
                <DestinationCard
                  key={destination.id}
                  destination={destination}
                />
              ))}
            </HomeCarousel>
          ) : (
            renderHeader(true)
          )}
        </ScrollReveal>

        {isError && (
          <ErrorState
            title={t('home.destinations.error.title')}
            description={t('home.destinations.error.description')}
            retryLabel={t('home.destinations.error.retry')}
            onRetry={() => refetch()}
          />
        )}

        {!isPending && !isError && destinations.length === 0 && (
          <EmptyState
            title={t('home.destinations.empty.title')}
            description={t('home.destinations.empty.description')}
          />
        )}
      </Container>
    </Section>
  );
}
