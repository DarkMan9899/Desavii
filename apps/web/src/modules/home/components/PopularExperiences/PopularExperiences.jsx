/**
 * PopularExperiences — "New on desavii": the most recently published
 * listings of every category (`GET /search?sort=newest`), so a returning
 * visitor sees what is new. The heading says "new", never "popular" — the
 * order is publication date, not demand.
 *
 * Home rebuild (docs/HOME_REBUILD.md): same data and card
 * (`SearchResultCard`); the dark decorative panel is gone and the row is
 * `HomeCarousel`, on a soft surface band that separates it from the
 * featured row above.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container, Section } from '@desavii/ui/components/layout';
import { EmptyState, Alert } from '@desavii/ui/components/feedback-overlays';
import {
  useSearchListingsQuery,
  SearchResultCard,
} from '../../../search/index.js';
import { PLACEMENTS } from '../../../../analytics/index.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import HomeCarousel from '../HomeCarousel/HomeCarousel.jsx';
import ActionLink from '../ActionLink/ActionLink.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import styles from './PopularExperiences.module.scss';

const HEADING_ID = 'popular-experiences-heading';

export default function PopularExperiences() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { data, isPending, isError } = useSearchListingsQuery(
    { sort: 'newest' },
    { locale },
  );
  const listings = data?.pages[0]?.results ?? [];

  // The row shows its link beside the controls; without a row (error,
  // empty) the heading keeps it.
  const renderHeader = (withLink) => (
    <SectionHeader
      id={HEADING_ID}
      eyebrow={t('home.experiences.eyebrow')}
      title={t('home.experiences.title')}
      subtitle={t('home.experiences.subtitle')}
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
    <Section aria-labelledby={HEADING_ID} className={styles.band}>
      <Container size="wide">
        <ScrollReveal>
          {isPending || listings.length > 0 ? (
            <HomeCarousel
              label={t('home.experiences.title')}
              header={renderHeader(false)}
              action={action}
              isLoading={isPending}
            >
              {listings.map((listing, index) => (
                <SearchResultCard
                  key={listing.id}
                  result={listing}
                  placement={PLACEMENTS.SEARCH_RESULTS}
                  position={index}
                />
              ))}
            </HomeCarousel>
          ) : (
            renderHeader(true)
          )}
        </ScrollReveal>

        {isError && (
          <Alert variant="danger" title={t('home.experiences.error.title')}>
            {t('home.experiences.error.description')}
          </Alert>
        )}

        {!isPending && !isError && listings.length === 0 && (
          <EmptyState
            title={t('home.experiences.empty.title')}
            description={t('home.experiences.empty.description')}
          />
        )}
      </Container>
    </Section>
  );
}
