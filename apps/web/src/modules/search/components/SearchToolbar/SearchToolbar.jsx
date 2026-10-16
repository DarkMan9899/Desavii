/**
 * SearchToolbar — the summary line above the results and the sort
 * control. The count is the whole filtered result's size
 * (`meta.total` from `GET /search`'s first page), not the number of
 * cards loaded so far. Its line is a polite live region, so a screen
 * reader hears "Searching…" / "Updating results…" / "12 results" as a
 * search runs and settles.
 *
 * Sort is applied as soon as it is picked (it reorders, it doesn't
 * filter); "Best match" is offered only while there is a keyword to
 * match.
 */

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
        <Select
          ariaLabel={t('search.filters.sortLabel')}
          options={sortOptions}
          value={sort}
          onChange={onSortChange}
          size="sm"
        />
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
