/**
 * AmenityChecklist — the amenities filter, which can run to dozens of
 * options for a hotel: grouped under the catalog's own amenity groups
 * (`amenity_groups`, labelled from `partner.listingWizard.amenityGroups`),
 * with a find-as-you-type box once the list is long enough to need one,
 * and a count of what is selected. Options arrive already localized and
 * already limited to amenities that apply to the category. Inside a panel
 * section that already carries the same name, `isLabelHidden` keeps the
 * name (and count) for screen readers only instead of repeating it.
 */

import { useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Checkbox, Input } from '@desavii/ui/components/form-controls';
import styles from './AmenityChecklist.module.scss';

/** Below this many options a plain list is quicker to scan than to search. */
const SEARCHABLE_FROM = 8;
const UNGROUPED = 'OTHER';

export default function AmenityChecklist({
  label,
  options,
  selectedValues,
  onChange,
  isLabelHidden = false,
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const headingId = useId();

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(i18n.language);
    const byGroup = new Map();
    options
      .filter(
        (option) =>
          !needle ||
          option.text.toLocaleLowerCase(i18n.language).includes(needle),
      )
      .forEach((option) => {
        const group = option.group ?? UNGROUPED;
        if (!byGroup.has(group)) byGroup.set(group, []);
        byGroup.get(group).push(option);
      });
    return Array.from(byGroup.entries());
  }, [options, query, i18n.language]);

  const toggle = (value) =>
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((selected) => selected !== value)
        : [...selectedValues, value],
    );

  return (
    <div className={styles.checklist} role="group" aria-labelledby={headingId}>
      <p
        id={headingId}
        className={isLabelHidden ? styles.labelHidden : styles.label}
      >
        {label}
        {selectedValues.length > 0 && (
          <span className={styles.selected}>
            {t('search.filters.selectedCount', {
              count: selectedValues.length,
            })}
          </span>
        )}
      </p>
      {options.length >= SEARCHABLE_FROM && (
        <Input
          aria-label={t('search.filters.findAmenity')}
          placeholder={t('search.filters.findAmenity')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          iconLeft={<Search size={16} aria-hidden="true" />}
          size="sm"
        />
      )}
      {groups.length === 0 && (
        <p className={styles.empty}>{t('search.filters.noAmenityMatch')}</p>
      )}
      {groups.map(([group, groupOptions]) => (
        <div key={group} className={styles.group}>
          {groups.length > 1 && (
            <p className={styles.groupLabel}>
              {t(`partner.listingWizard.amenityGroups.${group}`, group)}
            </p>
          )}
          <div className={styles.options}>
            {groupOptions.map((option) => (
              <Checkbox
                key={option.value}
                label={
                  <span className={styles.optionLabel}>
                    <span>{option.text}</span>
                    <span className={styles.optionCount}>{option.count}</span>
                  </span>
                }
                checked={selectedValues.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

AmenityChecklist.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired,
      group: PropTypes.string,
    }),
  ).isRequired,
  selectedValues: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  isLabelHidden: PropTypes.bool,
};
