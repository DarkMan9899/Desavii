/**
 * SearchFilters — the Search page's search panel, everything above the
 * results that edits the search:
 *
 * - From Tablet: `SearchForm`, the primary fields inline with a Search
 *   button.
 * - On phones: a one-line summary of the applied search (what · when ·
 *   who) that opens the drawer, so the results start within the first
 *   screen instead of below five stacked fields.
 * - "Filters" (every width): opens `SearchFiltersDrawer` — price and the
 *   category's own filters, plus the primary fields on phones. Its badge
 *   counts the filters only the drawer shows.
 * - AI search, collapsed behind a toggle: `AiSearchBar` (Stage 15.2)
 *   turns a sentence into the same filters through `onAiApply`.
 *
 * Owns no filter state: the applied filters come from `useSearchFilters`
 * (the URL), and every edit is a local draft until applied.
 */

import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Badge, Button } from '@desavii/ui/components/primitives';
import SearchForm from '../SearchForm/SearchForm.jsx';
import SearchFiltersDrawer from '../SearchFiltersDrawer/SearchFiltersDrawer.jsx';
import { AiSearchBar } from '../../../ai/index.js';
import { getSearchCapabilities } from '../../utils/categoryFilterCapabilities.js';
import { formatSearchDates } from '../../utils/activeSearchChips.js';
import {
  categoryShape,
  destinationShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './SearchFilters.module.scss';

function countDrawerOnlyFilters(filters) {
  const hasPrice =
    filters.priceMin !== undefined || filters.priceMax !== undefined;
  return (hasPrice ? 1 : 0) + Object.keys(filters.dynamicFilters).length;
}

export default function SearchFilters({
  filters,
  categories,
  destinations,
  onApply,
  onAiApply,
}) {
  const { t, i18n } = useTranslation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const aiPanelId = useId();

  const category = categories.find(
    (candidate) => candidate.id === filters.categoryId,
  );
  const city = destinations.find(
    (destination) => destination.id === filters.cityId,
  );
  const { party } = getSearchCapabilities(category?.slug);

  const summaryTitle =
    (filters.destination &&
      t('search.filters.keywordChip', { keyword: filters.destination })) ||
    [city?.name, category?.name].filter(Boolean).join(' · ') ||
    t('search.filters.summaryEverything');
  const summaryDetails = [
    filters.dateFrom &&
      formatSearchDates(filters.dateFrom, filters.dateTo, i18n.language),
    filters.guests &&
      party &&
      t(`search.filters.partyCount.${party}`, { count: filters.guests }),
  ]
    .filter(Boolean)
    .join(' · ');

  const drawerOnlyCount = countDrawerOnlyFilters(filters);

  return (
    <div className={styles.panel}>
      <div className={styles.inlineForm}>
        <SearchForm
          filters={filters}
          categories={categories}
          destinations={destinations}
          onApply={onApply}
        />
      </div>

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.summary}
          onClick={() => setIsDrawerOpen(true)}
          aria-label={t('search.filters.editSearchSummary', {
            summary: [summaryTitle, summaryDetails].filter(Boolean).join(', '),
          })}
        >
          <Search size={18} aria-hidden="true" className={styles.summaryIcon} />
          <span className={styles.summaryText}>
            <span className={styles.summaryTitle}>{summaryTitle}</span>
            {summaryDetails && (
              <span className={styles.summaryDetails}>{summaryDetails}</span>
            )}
          </span>
        </button>
        <Button
          variant="secondary"
          size="md"
          iconLeft={<SlidersHorizontal size={18} aria-hidden="true" />}
          onClick={() => setIsDrawerOpen(true)}
          ariaLabel={
            drawerOnlyCount > 0
              ? t('search.filters.filtersButtonActive', {
                  count: drawerOnlyCount,
                })
              : undefined
          }
        >
          <span className={styles.filtersLabel}>
            {t('search.filters.filtersButton')}
          </span>
          {drawerOnlyCount > 0 && (
            <Badge
              variant="info"
              label={String(drawerOnlyCount)}
              size="sm"
              filled
            />
          )}
        </Button>
        <button
          type="button"
          className={styles.aiToggle}
          onClick={() => setIsAiOpen((open) => !open)}
          aria-expanded={isAiOpen}
          aria-controls={aiPanelId}
        >
          <Sparkles size={18} aria-hidden="true" />
          <span className={styles.aiLabel}>
            {isAiOpen ? t('search.aiSearch.hide') : t('search.aiSearch.toggle')}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={[styles.chevron, isAiOpen && styles.chevronOpen]
              .filter(Boolean)
              .join(' ')}
          />
        </button>
      </div>

      <div id={aiPanelId} hidden={!isAiOpen}>
        {isAiOpen && <AiSearchBar onApply={onAiApply} />}
      </div>

      <SearchFiltersDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        filters={filters}
        categories={categories}
        destinations={destinations}
        onApply={onApply}
      />
    </div>
  );
}

SearchFilters.propTypes = {
  filters: searchFiltersShape.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  onApply: PropTypes.func.isRequired,
  onAiApply: PropTypes.func.isRequired,
};
