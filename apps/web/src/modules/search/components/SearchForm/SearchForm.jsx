/**
 * SearchForm — the Tablet+ search bar: the primary fields with the Search
 * button in the same row, aligned to the inputs.
 *
 * Live: a choice applies at once, typing applies once it pauses, and a
 * date range applies the moment it is complete. Search (or Enter) applies
 * whatever is still pending — typed text inside its pause, nothing at all
 * if the visitor already sees what they asked for — as one change, so it
 * never sends a duplicate request. A range missing its end date is pointed
 * out at the date field instead.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import PrimarySearchFields from '../PrimarySearchFields/PrimarySearchFields.jsx';
import { useSearchDraft } from '../../hooks/useSearchDraft.js';
import { getSearchCapabilities } from '../../utils/categoryFilterCapabilities.js';
import {
  categoryShape,
  destinationShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './SearchForm.module.scss';

export default function SearchForm({
  filters,
  categories,
  destinations,
  onApply,
  isSearching = false,
}) {
  const { t } = useTranslation();
  const { dateMode } = getSearchCapabilities(
    categories.find((category) => category.id === filters.categoryId)?.slug,
  );
  const draft = useSearchDraft(filters, onApply, { dateMode });

  const handleSubmit = (event) => {
    event.preventDefault();
    draft.flush();
  };

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      role="search"
      aria-label={t('search.filters.sections.search')}
      noValidate
    >
      <PrimarySearchFields
        filters={filters}
        draft={draft}
        onApply={onApply}
        categories={categories}
        destinations={destinations}
        layout="bar"
        action={
          <button
            type="submit"
            className={styles.submit}
            aria-busy={isSearching || undefined}
          >
            <Search size={18} aria-hidden="true" />
            <span>{t('search.filters.submit')}</span>
          </button>
        }
      />
    </form>
  );
}

SearchForm.propTypes = {
  filters: searchFiltersShape.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  onApply: PropTypes.func.isRequired,
  isSearching: PropTypes.bool,
};
