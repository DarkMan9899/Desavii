/**
 * Categories — real category tiles from `GET /search/categories`
 * (`useCategoriesQuery`, the `search` module's public export, §6.3's
 * cross-module rule — never reaches into `modules/search/queries/...`
 * directly). Renders all three required states (§1.4) — loading, empty,
 * error — before content, same pattern as `FeaturedListings`.
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
      <SectionHeader
        id={HEADING_ID}
        eyebrow={t('home.categories.eyebrow')}
        title={t('home.categories.title')}
      />

      {isPending && (
        <div className={styles.grid}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key -- skeleton
            // placeholders are positionally static, non-reorderable.
            <Skeleton key={index} variant="rect" height={148} />
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
        <ScrollReveal stagger variant="depth" className={styles.grid}>
          {categories.map((category, index) => (
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
