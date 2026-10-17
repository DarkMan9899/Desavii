/**
 * ActiveFilters — "filtered by": one removable chip per applied filter
 * (`utils/activeSearchChips.js`) plus "Clear filters". Removing a chip
 * applies immediately and pushes one history entry, so Back restores
 * it. One compact line on phones (chips scroll sideways), wrapping from
 * Tablet. Renders nothing while no filter is applied.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@desavii/ui/components/primitives';
import styles from './ActiveFilters.module.scss';

export default function ActiveFilters({ chips, onRemoveChip, onClearAll }) {
  const { t } = useTranslation();
  if (chips.length === 0) return null;

  return (
    <div
      className={styles.row}
      role="group"
      aria-label={t('search.filters.activeFilters')}
    >
      <ul className={styles.chips}>
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => onRemoveChip(chip)}
              aria-label={t('search.filters.removeFilter', {
                label: chip.label,
              })}
            >
              <span className={styles.chipLabel}>{chip.label}</span>
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.clearAll}>
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          {t('search.filters.clearAll')}
        </Button>
      </div>
    </div>
  );
}

ActiveFilters.propTypes = {
  chips: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onRemoveChip: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
};
