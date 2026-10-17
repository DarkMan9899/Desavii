/**
 * SearchToolbar — the results header: how many listings match (the whole
 * filtered total, `meta.total` from `GET /search`'s first page — never
 * the number of cards loaded so far) and how they are sorted. The count
 * line is a polite live region, so a screen reader hears "Searching…" /
 * "Updating results…" / "12 results" as live filtering runs and settles.
 *
 * Sort applies as soon as it is picked; "Best match" is offered only while
 * there is a keyword to match.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Select } from '@desavii/ui/components/form-controls';
import {
  SORT_KEYS,
  SORT_OPTION_META,
} from '../../../../constants/sortOptions.js';
import styles from './SearchToolbar.module.scss';

export default function SearchToolbar({
  total = undefined,
  isLoading,
  isUpdating,
  sort,
  hasKeyword,
  onSortChange,
}) {
  const { t } = useTranslation();
  const sortLabelId = useId();

  const sortOptions = SORT_KEYS.filter(
    (key) => !SORT_OPTION_META[key].requiresKeyword || hasKeyword,
  ).map((key) => ({ value: key, label: t(`search.filters.sort.${key}`) }));

  let status = '';
  if (isLoading) status = t('search.results.loading');
  else if (isUpdating) status = t('search.results.updating');
  else if (total !== undefined) {
    status = t('search.results.count', { count: total });
  }

  return (
    <div className={styles.toolbar}>
      <p className={styles.status} role="status">
        {status}
      </p>
      <div className={styles.sort}>
        <span id={sortLabelId} className={styles.sortLabel}>
          {t('search.filters.sortLabel')}
        </span>
        <div className={styles.sortControl}>
          <Select
            ariaLabel={t('search.filters.sortLabel')}
            options={sortOptions}
            value={sort}
            onChange={onSortChange}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

SearchToolbar.propTypes = {
  total: PropTypes.number,
  isLoading: PropTypes.bool.isRequired,
  isUpdating: PropTypes.bool.isRequired,
  sort: PropTypes.string.isRequired,
  hasKeyword: PropTypes.bool.isRequired,
  onSortChange: PropTypes.func.isRequired,
};
