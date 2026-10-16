/**
 * SearchFiltersDrawer — every Search filter beyond the inline form, in
 * the shared `Drawer` (bottom sheet on phones, right panel from Tablet).
 *
 * - Phones: the primary fields live here too (the page shows only a
 *   one-line summary of them), so the whole search is edited in one
 *   place; from Tablet, where `SearchForm` shows them inline, this
 *   section is hidden.
 * - Price: the AMD "from" price range.
 * - Category filters: whatever `GET /search/filters` declares for the
 *   drafted category (`useRenderableFilterGroups`, rendered through the
 *   same `FilterControl` registry the Category page uses).
 *
 * Everything edits one draft; "Show results" applies it as a single
 * search and closes the drawer, "Clear all" empties the draft. Closing
 * any other way discards the draft, so the drawer always reopens on the
 * search that is actually applied.
 */

import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import PrimarySearchFields from '../PrimarySearchFields/PrimarySearchFields.jsx';
import FilterControl from '../DynamicFilterPanel/FilterControl.jsx';
import PriceRangeFields from './PriceRangeFields.jsx';
import { useSearchDraft } from '../../hooks/useSearchDraft.js';
import { useRenderableFilterGroups } from '../../hooks/useRenderableFilterGroups.js';
import { fromSearchDraft } from '../../utils/searchDraft.js';
import { getSearchCapabilities } from '../../utils/categoryFilterCapabilities.js';
import {
  categoryShape,
  destinationShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './SearchFiltersDrawer.module.scss';

export default function SearchFiltersDrawer({
  isOpen,
  onClose,
  filters,
  categories,
  destinations,
  onApply,
}) {
  const { t } = useTranslation();
  const { draft, errors, updateDraft, resetDraft, clearDraft } = useSearchDraft(
    filters,
    categories,
  );
  const [showErrors, setShowErrors] = useState(false);
  const groups = useRenderableFilterGroups(draft.categoryId);
  const headingId = useId();

  const { dateMode } = getSearchCapabilities(
    categories.find((category) => category.id === draft.categoryId)?.slug,
  );

  const close = () => {
    resetDraft();
    setShowErrors(false);
    onClose();
  };

  const apply = () => {
    if (errors.dates || errors.price) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    onApply(fromSearchDraft(draft));
    onClose();
  };

  const updateDynamicFilters = (patch) => {
    const next = { ...draft.dynamicFilters };
    Object.entries(patch).forEach(([key, value]) => {
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
    });
    updateDraft({ dynamicFilters: next });
  };

  const errorText = (field, key) =>
    showErrors && errors[field] ? t(key) : undefined;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={close}
      title={t('search.filters.drawerTitle')}
      closeLabel={t('common.close')}
    >
      <div className={styles.body}>
        <section
          className={[styles.section, styles.primarySection].join(' ')}
          aria-labelledby={`${headingId}-search`}
        >
          <h3 id={`${headingId}-search`} className={styles.sectionTitle}>
            {t('search.filters.sections.search')}
          </h3>
          <PrimarySearchFields
            draft={draft}
            onChange={updateDraft}
            categories={categories}
            destinations={destinations}
            dateError={errorText(
              'dates',
              `search.filters.dates.${dateMode}.${errors.dates}`,
            )}
          />
        </section>

        <section
          className={styles.section}
          aria-labelledby={`${headingId}-price`}
        >
          <h3 id={`${headingId}-price`} className={styles.sectionTitle}>
            {t('search.filters.sections.price')}
          </h3>
          <PriceRangeFields
            priceMin={draft.priceMin}
            priceMax={draft.priceMax}
            onChange={updateDraft}
            error={errorText('price', 'search.filters.price.invalidRange')}
          />
        </section>

        {groups.map((group) => (
          <section key={group.code} className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t(`search.dynamicFilters.groups.${group.code}`, group.code)}
            </h3>
            {group.definitions.map((definition) => (
              <FilterControl
                key={definition.code}
                definition={definition}
                dynamicFilters={draft.dynamicFilters}
                onChange={updateDynamicFilters}
              />
            ))}
          </section>
        ))}
      </div>
      <div className={styles.footer}>
        <Button variant="ghost" size="md" onClick={clearDraft}>
          {t('search.filters.clearAll')}
        </Button>
        <Button variant="primary" size="md" onClick={apply}>
          {t('search.filters.apply')}
        </Button>
      </div>
    </Drawer>
  );
}

SearchFiltersDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  filters: searchFiltersShape.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  onApply: PropTypes.func.isRequired,
};
