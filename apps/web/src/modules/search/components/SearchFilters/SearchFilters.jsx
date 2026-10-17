/**
 * SearchFilters — the Search page's search console: everything above the
 * results that changes the search, on one navy surface.
 *
 * - Tablet+: `SearchForm`, the primary fields with the Search button in
 *   the same row.
 * - Phones: a one-line summary of the applied search (what · when · who)
 *   that opens the filter panel, so the results start on the first screen
 *   instead of below five stacked fields.
 * - `QuickFilters`: price and the chosen category's quick filters, plus
 *   "All filters" (`SearchFiltersDrawer`), which a phone pill opens at
 *   that filter's own section.
 * - AI search, collapsed behind a toggle: `AiSearchBar` (Stage 15.2)
 *   turns a sentence into the same filters through `onAiApply`.
 *
 * Owns no filter state: the applied filters come from `useSearchFilters`
 * (the URL), and every control applies live through `onApply` /
 * `onDynamicChange`.
 */

import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Sparkles } from 'lucide-react';
import SearchForm from '../SearchForm/SearchForm.jsx';
import QuickFilters from '../QuickFilters/QuickFilters.jsx';
import SearchFiltersDrawer from '../SearchFiltersDrawer/SearchFiltersDrawer.jsx';
import { AiSearchBar } from '../../../ai/index.js';
import { getSearchCapabilities } from '../../utils/categoryFilterCapabilities.js';
import { formatSearchDates } from '../../utils/activeSearchChips.js';
import {
  categoryShape,
  destinationShape,
  filterGroupShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './SearchFilters.module.scss';

/** Filters only the panel and quick pills hold: price and category filters. */
function countPanelFilters(filters) {
  const hasPrice =
    filters.priceMin !== undefined || filters.priceMax !== undefined;
  return (hasPrice ? 1 : 0) + Object.keys(filters.dynamicFilters).length;
}

export default function SearchFilters({
  filters,
  categories,
  destinations,
  filterGroups,
  isCatalogPending,
  total = undefined,
  isSearching,
  onApply,
  onDynamicChange,
  onClearAll,
  onAiApply,
}) {
  const { t, i18n } = useTranslation();
  const [panel, setPanel] = useState({ isOpen: false, section: undefined });
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

  const openPanel = (section) => setPanel({ isOpen: true, section });

  return (
    <div className={styles.console}>
      <div className={styles.searchCard}>
        <div className={styles.inlineForm}>
          <SearchForm
            filters={filters}
            categories={categories}
            destinations={destinations}
            onApply={onApply}
            isSearching={isSearching}
          />
        </div>
        <button
          type="button"
          className={styles.summary}
          onClick={() => openPanel()}
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
      </div>

      <div className={styles.footerRow}>
        <QuickFilters
          filters={filters}
          filterGroups={filterGroups}
          isCatalogPending={isCatalogPending}
          onApply={onApply}
          onDynamicChange={onDynamicChange}
          onOpenPanel={openPanel}
          panelFilterCount={countPanelFilters(filters)}
        />
        <button
          type="button"
          className={styles.aiToggle}
          onClick={() => setIsAiOpen((open) => !open)}
          aria-expanded={isAiOpen}
          aria-controls={aiPanelId}
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>
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

      <div id={aiPanelId} hidden={!isAiOpen} className={styles.aiPanel}>
        {isAiOpen && <AiSearchBar onApply={onAiApply} />}
      </div>

      <SearchFiltersDrawer
        isOpen={panel.isOpen}
        initialSection={panel.section}
        onClose={() => setPanel({ isOpen: false, section: undefined })}
        filters={filters}
        categories={categories}
        destinations={destinations}
        filterGroups={filterGroups}
        isCatalogPending={isCatalogPending}
        total={total}
        onApply={onApply}
        onDynamicChange={onDynamicChange}
        onClearAll={onClearAll}
      />
    </div>
  );
}

SearchFilters.propTypes = {
  filters: searchFiltersShape.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  filterGroups: PropTypes.arrayOf(filterGroupShape).isRequired,
  isCatalogPending: PropTypes.bool.isRequired,
  total: PropTypes.number,
  isSearching: PropTypes.bool.isRequired,
  onApply: PropTypes.func.isRequired,
  onDynamicChange: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
  onAiApply: PropTypes.func.isRequired,
};
