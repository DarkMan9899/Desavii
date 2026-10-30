/**
 * Categories — every category the marketplace offers (`GET
 * /search/categories`), as photo tiles linking to each category page.
 *
 * Home rebuild (docs/HOME_REBUILD.md): one tile is larger — the category
 * with the most live listings, so the emphasis follows real inventory
 * rather than a fixed pick — and the rest follow in the catalog's order.
 * Phone: two columns with the featured tile across both; tablet: three
 * columns; laptop: four, the featured tile taking a 2×2 block.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section } from '@desavii/ui/components/layout';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { useCategoriesQuery } from '../../../search/index.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import CategoryCard from '../CategoryCard/CategoryCard.jsx';
import styles from './Categories.module.scss';

const HEADING_ID = 'categories-heading';
const SKELETON_COUNT = 9;

/** The category with the most listings first, the rest in catalog order. */
export function orderForDisplay(categories) {
  if (categories.length === 0) return [];
  const featured = categories.reduce((best, category) =>
    (category.listing_count ?? 0) > (best.listing_count ?? 0) ? category : best,
  );
  return [featured, ...categories.filter((category) => category !== featured)];
}

export default function Categories() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const {
    data: categories,
    isPending,
    isError,
    refetch,
  } = useCategoriesQuery({ locale });

  return (
    <Section aria-labelledby={HEADING_ID}>
      <ScrollReveal>
        <SectionHeader
          id={HEADING_ID}
          eyebrow={t('home.categories.eyebrow')}
          title={t('home.categories.title')}
          subtitle={t('home.categories.subtitle')}
        />
      </ScrollReveal>

      {isPending && (
        <div className={styles.grid}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <Skeleton
              key={index}
              variant="rect"
              className={
                index === 0 ? styles.skeletonFeatured : styles.skeleton
              }
            />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          title={t('home.categories.error.title')}
          description={t('home.categories.error.description')}
          retryLabel={t('home.categories.error.retry')}
          onRetry={() => refetch()}
        />
      )}

      {!isPending && !isError && categories.length === 0 && (
        <EmptyState
          title={t('home.categories.empty.title')}
          description={t('home.categories.empty.description')}
        />
      )}

      {!isPending && !isError && categories.length > 0 && (
        <ScrollReveal stagger className={styles.grid}>
          {orderForDisplay(categories).map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              featured={index === 0}
            />
          ))}
        </ScrollReveal>
      )}
    </Section>
  );
}
