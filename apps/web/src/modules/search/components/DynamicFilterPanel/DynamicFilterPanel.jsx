/**
 * DynamicFilterPanel — the "filter drawer" the architecture proposal
 * calls for: every filter beyond keyword/category/sort, loaded entirely
 * from `GET /search/filters` (`useSearchFilterDefinitionsQuery`, keyed by
 * `categoryId`), rendered through `FilterControl`'s `input_type` registry.
 * No filter list is hardcoded here — `groups`/`definitions` are exactly
 * whatever the backend's catalog for the current category currently
 * declares, so changing `categoryId` (the query key) automatically
 * refetches and re-renders a different set of controls.
 *
 * Self-contained: owns its own trigger button (with an active-count
 * badge), its own active-filter chip row, and its own `Drawer` (bottom
 * sheet on mobile / right panel on desktop, via `packages/ui`'s existing
 * `Drawer`) — `SearchPageContent` only needs to place this component next
 * to `SearchFilters`, never reach into its internals.
 *
 * A `SINGLE_SELECT`/`MULTI_SELECT` definition with zero resolved options
 * (e.g. the amenities filter before any category is chosen) has nothing
 * meaningful to render, so it's filtered out here — `STEPPER`/`RANGE`
 * never depend on options and always render.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import { useSearchFilterDefinitionsQuery } from '../../queries/useSearchFilterDefinitionsQuery.js';
import FilterControl from './FilterControl.jsx';
import { getActiveFilterChips } from './activeFilterChips.js';
import styles from './DynamicFilterPanel.module.scss';

function isRenderableDefinition(definition) {
  if (['SINGLE_SELECT', 'MULTI_SELECT'].includes(definition.input_type)) {
    return definition.options.length > 0;
  }
  return true;
}

export default function DynamicFilterPanel({
  categoryId = undefined,
  dynamicFilters,
  onChange,
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { data: rawGroups = [] } = useSearchFilterDefinitionsQuery(categoryId);

  const groups = rawGroups
    .map((group) => ({
      ...group,
      definitions: group.definitions.filter(isRenderableDefinition),
    }))
    .filter((group) => group.definitions.length > 0);

  const activeChips = getActiveFilterChips(groups, dynamicFilters, t);

  const clearKeys = (keys) => {
    const patch = {};
    keys.forEach((key) => {
      patch[key] = '';
    });
    onChange(patch);
  };

  if (groups.length === 0) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.triggerRow}>
        <Button
          variant="secondary"
          size="md"
          iconLeft={<SlidersHorizontal size={18} aria-hidden="true" />}
          onClick={() => setIsOpen(true)}
        >
          {t('search.dynamicFilters.triggerLabel')}
        </Button>
        {activeChips.length > 0 && (
          <span className={styles.count}>
            <Badge
              variant="info"
              label={String(activeChips.length)}
              size="sm"
              filled
            />
          </span>
        )}

        {activeChips.length > 0 && (
          <div
            className={styles.chips}
            role="group"
            aria-label={t('search.dynamicFilters.activeFilters')}
          >
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.chip}
                onClick={() => clearKeys(chip.keysToClear)}
              >
                <Badge variant="neutral" label={chip.label} size="sm" />
                <X size={14} aria-hidden="true" />
                <span className={styles.chipSrLabel}>
                  {t('search.filters.removeFilter', { label: chip.label })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('search.dynamicFilters.drawerTitle')}
        closeLabel={t('common.close')}
      >
        <div className={styles.drawerBody}>
          {groups.map((group) => (
            <section key={group.code} className={styles.group}>
              <h3 className={styles.groupTitle}>
                {t(`search.dynamicFilters.groups.${group.code}`, group.code)}
              </h3>
              {group.definitions.map((definition) => (
                <FilterControl
                  key={definition.code}
                  definition={definition}
                  dynamicFilters={dynamicFilters}
                  onChange={onChange}
                />
              ))}
            </section>
          ))}
        </div>
        <div className={styles.drawerFooter}>
          <Button
            variant="ghost"
            size="md"
            onClick={() =>
              clearKeys(activeChips.flatMap((chip) => chip.keysToClear))
            }
            disabled={activeChips.length === 0}
          >
            {t('search.filters.clearAll')}
          </Button>
          <Button variant="primary" size="md" onClick={() => setIsOpen(false)}>
            {t('search.dynamicFilters.applyLabel')}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}

DynamicFilterPanel.propTypes = {
  categoryId: PropTypes.number,
  dynamicFilters: PropTypes.objectOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
};
