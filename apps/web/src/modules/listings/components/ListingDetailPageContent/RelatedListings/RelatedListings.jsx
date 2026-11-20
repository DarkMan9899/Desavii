/**
 * RelatedListings — "more like this" strip, reusing `search`'s own
 * `useSearchListingsQuery` + `SearchResultCard` (both now exported from
 * `modules/search/index.js` for exactly this cross-module use) rather
 * than inventing a parallel same-category fetch/card. `GET /search`'s
 * flat DTO is exactly what a related-listings strip needs — no new
 * backend endpoint. Only the first page is shown (no "load more" here,
 * unlike the full search results page); the current listing is excluded
 * client-side since `GET /search` has no "exclude id" filter.
 *
 * Listing Detail redesign: at most `RELATED_LIMIT` cards — enough to
 * compare, never a second results page. On a phone they form a swipeable
 * rail (one card and the next one peeking) instead of a stack that would
 * double the page's length; from tablet, a grid. A plain responsive CSS
 * layout (`.list`), not the `Grid` primitive, whose fixed `columns` pin
 * one count at every breakpoint.
 */

import PropTypes from 'prop-types';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Section } from '@desavii/ui/components/layout';
import {
  useSearchListingsQuery,
  SearchResultCard,
} from '../../../../search/index.js';
import styles from './RelatedListings.module.scss';

export const RELATED_LIMIT = 6;

export default function RelatedListings({
  categoryId = undefined,
  excludeListingId,
}) {
  const { locale } = useParams();
  const { t } = useTranslation();
  const { data } = useSearchListingsQuery({ categoryId }, { locale });

  const results = (data?.pages[0]?.results ?? [])
    .filter((result) => result.id !== excludeListingId)
    .slice(0, RELATED_LIMIT);

  if (!categoryId || results.length === 0) return null;

  return (
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.relatedListings.heading')}
    >
      <h2>{t('pages.listingDetail.relatedListings.heading')}</h2>
      <ul className={styles.list}>
        {results.map((result) => (
          <li key={result.id} className={styles.item}>
            <SearchResultCard result={result} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

RelatedListings.propTypes = {
  categoryId: PropTypes.number,
  excludeListingId: PropTypes.number.isRequired,
};
