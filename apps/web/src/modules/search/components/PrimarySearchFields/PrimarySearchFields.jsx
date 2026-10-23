/**
 * PrimarySearchFields — the Search page's main fields: keyword,
 * destination, category, dates and party size. Live: a choice from a
 * list (destination, category, party) applies at once through `onApply`;
 * typed text and a half-picked date range go through `draft`
 * (`useSearchDraft`), which applies them once typing pauses / the range is
 * complete. Used by the desktop search bar and inside the phone filter
 * panel.
 *
 * The date and party fields follow the chosen category
 * (`categoryFilterCapabilities.js`): a stay asks for check-in/check-out,
 * a car rental for pick-up/return, a restaurant or departure for one
 * date; the party field is named the way that category's booking names
 * it, and is absent where Search cannot filter by it.
 *
 * Destination is a real city (`cityId`, `GET /search/destinations`), its
 * name in the visitor's language and its count scoped to the chosen
 * category; a city with nothing to show is left out unless selected.
 *
 * `layout="bar"` is the desktop search bar: Laptop — keyword,
 * destination, category over dates, party and the Search button;
 * Desktop — one row. `stacked` is one field per row (phone panel).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  Input,
  Select,
  DatePicker,
} from '@desavii/ui/components/form-controls';
import {
  DATE_MODES,
  getSearchCapabilities,
} from '../../utils/categoryFilterCapabilities.js';
import { getBusinessToday } from '../../../../utils/businessDate.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';
import {
  categoryShape,
  destinationShape,
  searchFiltersShape,
} from '../../constants/propShapes.js';
import styles from './PrimarySearchFields.module.scss';

/** Largest party size offered in the picker; larger groups contact the partner. */
const MAX_PARTY_OPTION = 12;
const PARTY_OPTION_COUNTS = Array.from(
  { length: MAX_PARTY_OPTION },
  (_, index) => index + 1,
);

const ANY_VALUE = '';

export default function PrimarySearchFields({
  filters,
  draft,
  onApply,
  categories,
  destinations,
  layout = 'stacked',
  action = undefined,
}) {
  const { t, i18n } = useTranslation();
  const selectTexts = useSelectTexts();

  const categorySlug = categories.find(
    (category) => category.id === filters.categoryId,
  )?.slug;
  const { dateMode, party } = getSearchCapabilities(categorySlug);
  const isSingleDay = dateMode === DATE_MODES.DAY;

  const destinationOptions = [
    { value: ANY_VALUE, label: t('search.filters.destinationAll') },
    ...destinations
      .filter(
        (destination) =>
          destination.listing_count > 0 || destination.id === filters.cityId,
      )
      .map((destination) => ({
        value: String(destination.id),
        label: t('search.filters.destinationOption', {
          name: destination.name,
          count: destination.listing_count,
        }),
        triggerLabel: destination.name,
      })),
  ];

  const categoryOptions = [
    { value: ANY_VALUE, label: t('search.filters.categoryAll') },
    ...categories.map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
  ];

  const partyOptions = party
    ? [
        { value: ANY_VALUE, label: t('search.filters.partyPlaceholder') },
        ...PARTY_OPTION_COUNTS.map((count) => ({
          value: String(count),
          label: t(`search.filters.partyCount.${party}`, { count }),
        })),
      ]
    : [];

  const toId = (value) => (value ? Number(value) : undefined);
  const businessToday = getBusinessToday();
  const datePickerProps = {
    locale: i18n.language,
    minDate: businessToday,
    today: businessToday,
    previousMonthLabel: t('partner.listingWizard.datePicker.previousMonth'),
    nextMonthLabel: t('partner.listingWizard.datePicker.nextMonth'),
    label: t(`search.filters.dates.${dateMode}.label`),
    placeholder: t(`search.filters.dates.${dateMode}.placeholder`),
    error: draft.dateError
      ? t(`search.filters.dates.${dateMode}.${draft.dateError}`)
      : undefined,
  };

  return (
    <div className={[styles.fields, styles[`fields--${layout}`]].join(' ')}>
      <div className={styles.keyword}>
        <Input
          label={t('search.filters.keywordLabel')}
          placeholder={t('search.filters.keywordPlaceholder')}
          value={draft.keyword}
          onChange={(event) => draft.setKeyword(event.target.value)}
          iconLeft={<Search size={18} aria-hidden="true" />}
        />
      </div>
      <div className={styles.field}>
        <Select
          label={t('search.filters.destinationLabel')}
          searchPlaceholder={selectTexts.searchPlaceholder}
          noOptionsMessage={selectTexts.noOptionsMessage}
          options={destinationOptions}
          value={filters.cityId ? String(filters.cityId) : ANY_VALUE}
          onChange={(value) => onApply({ cityId: toId(value) })}
        />
      </div>
      <div className={styles.field}>
        <Select
          label={t('search.filters.categoryLabel')}
          searchPlaceholder={selectTexts.searchPlaceholder}
          noOptionsMessage={selectTexts.noOptionsMessage}
          options={categoryOptions}
          value={filters.categoryId ? String(filters.categoryId) : ANY_VALUE}
          onChange={(value) => onApply({ categoryId: toId(value) })}
        />
      </div>
      <div className={styles.dates}>
        {isSingleDay ? (
          <DatePicker
            // eslint-disable-next-line react/jsx-props-no-spreading -- the same locale/label set both picker modes share
            {...datePickerProps}
            mode="single"
            value={filters.dateFrom ?? null}
            onChange={draft.setDates}
          />
        ) : (
          <DatePicker
            // eslint-disable-next-line react/jsx-props-no-spreading -- the same locale/label set both picker modes share
            {...datePickerProps}
            mode="range"
            value={draft.dateRange}
            onChange={draft.setDates}
          />
        )}
      </div>
      {party && (
        <div className={styles.field}>
          <Select
            label={t(`search.filters.party.${party}`)}
            options={partyOptions}
            value={filters.guests ? String(filters.guests) : ANY_VALUE}
            onChange={(value) => onApply({ guests: toId(value) })}
          />
        </div>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

PrimarySearchFields.propTypes = {
  filters: searchFiltersShape.isRequired,
  draft: PropTypes.shape({
    keyword: PropTypes.string.isRequired,
    setKeyword: PropTypes.func.isRequired,
    dateRange: PropTypes.shape({
      start: PropTypes.string,
      end: PropTypes.string,
    }).isRequired,
    setDates: PropTypes.func.isRequired,
    dateError: PropTypes.string,
  }).isRequired,
  onApply: PropTypes.func.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  layout: PropTypes.oneOf(['stacked', 'bar']),
  // The bar's Search button — a field-row item, so it lines up with the
  // inputs instead of floating beside the form.
  action: PropTypes.node,
};
