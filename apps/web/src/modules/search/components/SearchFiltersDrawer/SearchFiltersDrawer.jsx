/**
 * SearchFiltersDrawer — "All filters": every filter the chosen category
 * offers, in the shared `Drawer` (bottom sheet on phones, right panel from
 * Tablet). Live, like the rest of Search: a choice applies at once and the
 * results (and the footer's count) update behind the panel while it stays
 * open; typed price/keyword apply once typing pauses.
 *
 * - Phones: the primary fields live here too (the page shows only a
 *   one-line summary of them); from Tablet they sit in the search bar and
 *   this section is hidden.
 * - Price, then the category catalog's groups (`GET /search/filters`) —
 *   rating, rooms, property, dining, experience, vehicle, booking &
 *   policies, amenities — each a collapsible section with its own active
 *   count and Clear. Sections with something applied, and the one a quick
 *   filter pill opened the panel at, start open.
 *
 * "Show N results" applies anything still pending and closes; closing any
 * other way drops typing that has not applied yet. "Clear all" clears
 * every filter at once.
 */

import { useEffect, useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import PrimarySearchFields from '../PrimarySearchFields/PrimarySearchFields.jsx';
import FilterControl from '../DynamicFilterPanel/FilterControl.jsx';
import PriceRangeFields from './PriceRangeFields.jsx';
import { getFilterParamKeys } from '../DynamicFilterPanel/filterParamKey.js';
import { getActiveFilterChips } from '../DynamicFilterPanel/activeFilterChips.js';
import { useSearchDraft } from '../../hooks/useSearchDraft.js';
import { getSearchCapabilities } from '../../utils/categoryFilterCapabilities.js';
import { groupLabel, isNamedByGroup } from '../../utils/filterVocabulary.js';
import { PRICE_SECTION } from '../QuickFilters/QuickFilters.jsx';
import {
  categoryShape,
  destinationShape,
  filterGroupShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './SearchFiltersDrawer.module.scss';

const SKELETON_SECTIONS = 3;

function Section({
  id,
  title,
  activeCount,
  defaultOpen,
  onClear = undefined,
  children,
}) {
  const { t } = useTranslation();
  return (
    <details id={id} className={styles.section} open={defaultOpen}>
      <summary className={styles.summary}>
        <span className={styles.sectionTitle}>{title}</span>
        {activeCount > 0 && (
          <span className={styles.activeCount}>
            {t('search.filters.selectedCount', { count: activeCount })}
          </span>
        )}
      </summary>
      <div className={styles.sectionBody}>
        {children}
        {activeCount > 0 && onClear && (
          <div className={styles.sectionActions}>
            <Button variant="ghost" size="sm" onClick={onClear}>
              {t('search.filters.quick.clear')}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
Section.propTypes = {
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  activeCount: PropTypes.number.isRequired,
  defaultOpen: PropTypes.bool.isRequired,
  onClear: PropTypes.func,
  children: PropTypes.node.isRequired,
};

export default function SearchFiltersDrawer({
  isOpen,
  initialSection = undefined,
  onClose,
  filters,
  categories,
  destinations,
  filterGroups,
  isCatalogPending,
  total = undefined,
  onApply,
  onDynamicChange,
  onClearAll,
}) {
  const { t, i18n } = useTranslation();
  const sectionIdPrefix = useId();
  const category = categories.find(
    (candidate) => candidate.id === filters.categoryId,
  );
  const { dateMode } = getSearchCapabilities(category?.slug);
  const draft = useSearchDraft(filters, onApply, { dateMode });
  const sectionId = (code) => `${sectionIdPrefix}-${code}`;

  useEffect(() => {
    if (!isOpen || !initialSection) return undefined;
    // `scrollIntoView?.`: an engine without it (jsdom, older WebViews)
    // simply opens unscrolled instead of throwing inside the frame.
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(sectionId(initialSection))
        ?.scrollIntoView?.({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per opening; the id prefix is stable
  }, [isOpen, initialSection]);

  const close = () => {
    draft.cancel();
    onClose();
  };
  const showResults = () => {
    const errors = draft.flush();
    if (!errors.dates) onClose();
  };

  const activeByGroup = (group) =>
    getActiveFilterChips([group], filters.dynamicFilters, t, i18n.language)
      .length;
  const clearGroup = (group) =>
    onDynamicChange(
      Object.fromEntries(
        group.definitions.flatMap(getFilterParamKeys).map((key) => [key, '']),
      ),
    );
  const hasPrice =
    filters.priceMin !== undefined || filters.priceMax !== undefined;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={close}
      title={t('search.filters.drawerTitle')}
      closeLabel={t('common.close')}
    >
      <p className={styles.context}>
        {category?.name ?? t('search.filters.categoryAll')}
      </p>
      <div className={styles.body}>
        <div className={styles.primarySection}>
          <PrimarySearchFields
            filters={filters}
            draft={draft}
            onApply={onApply}
            categories={categories}
            destinations={destinations}
          />
        </div>

        <Section
          id={sectionId(PRICE_SECTION)}
          title={t('search.filters.sections.price')}
          activeCount={hasPrice ? 1 : 0}
          defaultOpen
          onClear={draft.clearPrice}
        >
          <PriceRangeFields
            priceMin={draft.priceMin}
            priceMax={draft.priceMax}
            onChange={draft.setPrice}
            error={
              draft.priceError
                ? t(`search.filters.price.${draft.priceError}`)
                : undefined
            }
          />
        </Section>

        {isCatalogPending &&
          Array.from({ length: SKELETON_SECTIONS }, (_, index) => (
            // Static, positional placeholders that never reorder.
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.sectionPlaceholder} />
          ))}

        {filterGroups.map((group, index) => {
          const activeCount = activeByGroup(group);
          return (
            <Section
              key={group.code}
              id={sectionId(group.code)}
              title={groupLabel(t, group.code)}
              activeCount={activeCount}
              defaultOpen={
                index === 0 || activeCount > 0 || group.code === initialSection
              }
              onClear={() => clearGroup(group)}
            >
              {group.definitions.map((definition) => (
                <FilterControl
                  key={definition.code}
                  definition={definition}
                  dynamicFilters={filters.dynamicFilters}
                  onChange={onDynamicChange}
                  isTitledBySection={isNamedByGroup(t, group, definition)}
                />
              ))}
            </Section>
          );
        })}
      </div>
      <div className={styles.footer}>
        <Button variant="ghost" size="md" onClick={onClearAll}>
          {t('search.filters.clearAll')}
        </Button>
        <Button variant="primary" size="md" onClick={showResults}>
          {total === undefined
            ? t('search.filters.apply')
            : t('search.filters.showResults', { count: total })}
        </Button>
      </div>
    </Drawer>
  );
}

SearchFiltersDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  initialSection: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  filters: searchFiltersShape.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  filterGroups: PropTypes.arrayOf(filterGroupShape).isRequired,
  isCatalogPending: PropTypes.bool.isRequired,
  total: PropTypes.number,
  onApply: PropTypes.func.isRequired,
  onDynamicChange: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
};
