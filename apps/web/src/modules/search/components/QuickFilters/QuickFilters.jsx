/**
 * QuickFilters — the row of high-value filters under the search bar, so
 * the common narrowing never needs the full filter panel: Price, then the
 * chosen category's quick filters (metadata-driven — every catalog
 * definition with `is_advanced: false`, e.g. guest rating and stars for
 * Hotels, cuisine and price tier for Restaurants, transmission, seats and
 * fuel for Car Rentals), then "All filters".
 *
 * Tablet+: each pill opens a small panel with the same control the full
 * panel uses (`FilterControl`), applied live; an applied pill shows its
 * value. Phones: the row scrolls sideways and a pill opens the full
 * filter panel at that filter's section — a popover inside a sideways-
 * scrolling row would be clipped. The two rows are switched by CSS only.
 *
 * While a newly chosen category's catalog loads, placeholder pills hold
 * the row's height — the previous category's filters never flash.
 */

import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Popover } from '@desavii/ui/components/navigation';
import { Button } from '@desavii/ui/components/primitives';
import FilterControl from '../DynamicFilterPanel/FilterControl.jsx';
import PriceRangeFields from '../SearchFiltersDrawer/PriceRangeFields.jsx';
import { getActiveFilterChips } from '../DynamicFilterPanel/activeFilterChips.js';
import { getFilterParamKeys } from '../DynamicFilterPanel/filterParamKey.js';
import { definitionLabel } from '../../utils/filterVocabulary.js';
import { formatPriceRange } from '../../utils/activeSearchChips.js';
import { useSearchDraft } from '../../hooks/useSearchDraft.js';
import {
  filterGroupShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './QuickFilters.module.scss';

export const PRICE_SECTION = 'PRICE';
const PLACEHOLDER_PILLS = 3;

function quickDefinitions(groups) {
  return groups.flatMap((group) =>
    group.definitions
      .filter((definition) => definition.is_advanced === false)
      .map((definition) => ({ definition, groupCode: group.code })),
  );
}

function Pill({
  label,
  value = undefined,
  isOpen = false,
  onClick,
  controlsId = undefined,
}) {
  return (
    <button
      type="button"
      className={[styles.pill, value && styles['pill--active']]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      aria-expanded={controlsId ? isOpen : undefined}
      aria-controls={controlsId && isOpen ? controlsId : undefined}
      aria-haspopup={controlsId ? 'dialog' : undefined}
    >
      <span className={styles.pillLabel}>{value || label}</span>
      {controlsId && (
        <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      )}
    </button>
  );
}
Pill.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  isOpen: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  controlsId: PropTypes.string,
};

function PopoverPill({
  label,
  value = undefined,
  onClear,
  children,
  onClose = undefined,
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const close = () => {
    onClose?.();
    setIsOpen(false);
  };
  return (
    <Popover
      isOpen={isOpen}
      onClose={close}
      panelClassName={styles.panel}
      trigger={
        <Pill
          label={label}
          value={value}
          isOpen={isOpen}
          controlsId={panelId}
          onClick={() => (isOpen ? close() : setIsOpen(true))}
        />
      }
    >
      <div id={panelId} role="dialog" aria-label={label}>
        <div className={styles.panelBody}>{children}</div>
        <div className={styles.panelFooter}>
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t('search.filters.quick.clear')}
          </Button>
          <Button variant="secondary" size="sm" onClick={close}>
            {t('search.filters.quick.done')}
          </Button>
        </div>
      </div>
    </Popover>
  );
}
PopoverPill.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onClear: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func,
};

function PricePill({ filters, onApply }) {
  const { t, i18n } = useTranslation();
  const draft = useSearchDraft(filters, onApply);
  return (
    <PopoverPill
      label={t('search.filters.quick.price')}
      value={formatPriceRange(filters, t, i18n.language)}
      onClear={draft.clearPrice}
      onClose={() => draft.flush()}
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
    </PopoverPill>
  );
}
PricePill.propTypes = {
  filters: searchFiltersShape.isRequired,
  onApply: PropTypes.func.isRequired,
};

export default function QuickFilters({
  filters,
  filterGroups,
  isCatalogPending,
  onApply,
  onDynamicChange,
  onOpenPanel,
  panelFilterCount,
}) {
  const { t, i18n } = useTranslation();
  const quick = quickDefinitions(filterGroups);
  const valueOf = (definition) =>
    getActiveFilterChips(
      [{ definitions: [definition] }],
      filters.dynamicFilters,
      t,
      i18n.language,
    )[0]?.label;
  const clear = (definition) =>
    onDynamicChange(
      Object.fromEntries(
        getFilterParamKeys(definition).map((key) => [key, '']),
      ),
    );
  const priceValue = formatPriceRange(filters, t, i18n.language);

  // The console's one solid light control: always findable on navy.
  const allFilters = (
    <button
      type="button"
      className={styles.allFilters}
      onClick={() => onOpenPanel()}
      aria-label={
        panelFilterCount > 0
          ? t('search.filters.quick.allFiltersActive', {
              count: panelFilterCount,
            })
          : undefined
      }
    >
      <SlidersHorizontal size={16} aria-hidden="true" />
      <span>{t('search.filters.quick.allFilters')}</span>
      {panelFilterCount > 0 && (
        <span className={styles.count} aria-hidden="true">
          {panelFilterCount}
        </span>
      )}
    </button>
  );

  const placeholders = isCatalogPending
    ? Array.from({ length: PLACEHOLDER_PILLS }, (_, index) => (
        // Static, positional placeholders that never reorder.
        // eslint-disable-next-line react/no-array-index-key
        <span key={index} className={styles.placeholder} aria-hidden="true" />
      ))
    : null;

  return (
    <div
      className={styles.quickFilters}
      role="group"
      aria-label={t('search.filters.quick.label')}
      aria-busy={isCatalogPending || undefined}
    >
      <div className={[styles.row, styles['row--popovers']].join(' ')}>
        <PricePill filters={filters} onApply={onApply} />
        {placeholders}
        {quick.map(({ definition }) => (
          <PopoverPill
            key={definition.code}
            label={definitionLabel(t, definition)}
            value={valueOf(definition)}
            onClear={() => clear(definition)}
          >
            <FilterControl
              definition={definition}
              dynamicFilters={filters.dynamicFilters}
              onChange={onDynamicChange}
            />
          </PopoverPill>
        ))}
        {allFilters}
      </div>

      <div className={[styles.row, styles['row--scroll']].join(' ')}>
        {allFilters}
        <Pill
          label={t('search.filters.quick.price')}
          value={priceValue}
          onClick={() => onOpenPanel(PRICE_SECTION)}
        />
        {placeholders}
        {quick.map(({ definition, groupCode }) => (
          <Pill
            key={definition.code}
            label={definitionLabel(t, definition)}
            value={valueOf(definition)}
            onClick={() => onOpenPanel(groupCode)}
          />
        ))}
      </div>
    </div>
  );
}

QuickFilters.propTypes = {
  filters: searchFiltersShape.isRequired,
  filterGroups: PropTypes.arrayOf(filterGroupShape).isRequired,
  isCatalogPending: PropTypes.bool.isRequired,
  onApply: PropTypes.func.isRequired,
  onDynamicChange: PropTypes.func.isRequired,
  onOpenPanel: PropTypes.func.isRequired,
  panelFilterCount: PropTypes.number.isRequired,
};
