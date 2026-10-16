/**
 * SearchForm — the Tablet+ inline search: `PrimarySearchFields` over a
 * local draft, applied as one search when the visitor presses Search (or
 * Enter). Nothing reaches the URL while they are still choosing — a
 * half-picked date range stays in the calendar instead of being written,
 * dropped and reset.
 *
 * Only the primary fields are applied here; price and category filters
 * belong to `SearchFiltersDrawer`. A different category still drops the
 * old category's attribute filters (`useSearchFilters.updateFilters`).
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import PrimarySearchFields from '../PrimarySearchFields/PrimarySearchFields.jsx';
import { useSearchDraft } from '../../hooks/useSearchDraft.js';
import { fromSearchDraft } from '../../utils/searchDraft.js';
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
}) {
  const { t } = useTranslation();
  const { draft, errors, updateDraft } = useSearchDraft(filters, categories);
  const [showErrors, setShowErrors] = useState(false);

  const { dateMode } = getSearchCapabilities(
    categories.find((category) => category.id === draft.categoryId)?.slug,
  );

  function handleSubmit(event) {
    event.preventDefault();
    if (errors.dates) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    const { destination, cityId, categoryId, dateFrom, dateTo, guests } =
      fromSearchDraft(draft);
    onApply({ destination, cityId, categoryId, dateFrom, dateTo, guests });
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      role="search"
      aria-label={t('search.filters.sections.search')}
      noValidate
    >
      <PrimarySearchFields
        draft={draft}
        onChange={updateDraft}
        categories={categories}
        destinations={destinations}
        dateError={
          showErrors && errors.dates
            ? t(`search.filters.dates.${dateMode}.${errors.dates}`)
            : undefined
        }
        layout="inline"
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="md">
          {t('search.filters.submit')}
        </Button>
      </div>
    </form>
  );
}

SearchForm.propTypes = {
  filters: searchFiltersShape.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  onApply: PropTypes.func.isRequired,
};
