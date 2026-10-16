/**
 * PrimarySearchFields — the Search page's main fields: keyword,
 * destination, category, dates and party size. Controlled and
 * presentational: it edits a `useSearchDraft` draft through `onChange`
 * and never applies anything itself — `SearchForm` (inline, Tablet+) and
 * `SearchFiltersDrawer` (phone) own when a draft becomes the search.
 *
 * The date and party fields follow the chosen category
 * (`categoryFilterCapabilities.js`): a stay asks for check-in/check-out,
 * a car rental for pick-up/return, a restaurant or departure for one
 * date; the party field is named the way that category's booking names
 * it, and is absent where Search cannot filter by it.
 *
 * Destination is a real city (`cityId`, `GET /search/destinations`),
 * listing only cities that have listings — the keyword field stays the
 * free-text search over names and descriptions.
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
import {
  categoryShape,
  destinationShape,
  searchDraftShape,
} from '../../constants/propShapes.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';
import styles from './PrimarySearchFields.module.scss';

/** Largest party size offered in the picker; larger groups contact the partner. */
const MAX_PARTY_OPTION = 12;
const PARTY_OPTION_COUNTS = Array.from(
  { length: MAX_PARTY_OPTION },
  (_, index) => index + 1,
);

const ANY_VALUE = '';

export default function PrimarySearchFields({
  draft,
  onChange,
  categories,
  destinations,
  dateError = undefined,
  layout = 'stacked',
}) {
  const { t, i18n } = useTranslation();
  const selectTexts = useSelectTexts();

  const categorySlug = categories.find(
    (category) => category.id === draft.categoryId,
  )?.slug;
  const { dateMode, party } = getSearchCapabilities(categorySlug);
  const isSingleDay = dateMode === DATE_MODES.DAY;

  const destinationOptions = [
    { value: ANY_VALUE, label: t('search.filters.destinationAll') },
    ...destinations
      .filter(
        (destination) =>
          destination.listing_count > 0 || destination.id === draft.cityId,
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
  const datePickerTexts = {
    locale: i18n.language,
    minDate: getBusinessToday(),
    previousMonthLabel: t('partner.listingWizard.datePicker.previousMonth'),
    nextMonthLabel: t('partner.listingWizard.datePicker.nextMonth'),
    label: t(`search.filters.dates.${dateMode}.label`),
    placeholder: t(`search.filters.dates.${dateMode}.placeholder`),
    error: dateError,
  };

  return (
    <div className={[styles.fields, styles[`fields--${layout}`]].join(' ')}>
      <div className={styles.keyword}>
        <Input
          label={t('search.filters.keywordLabel')}
          placeholder={t('search.filters.keywordPlaceholder')}
          value={draft.destination}
          onChange={(event) => onChange({ destination: event.target.value })}
          iconLeft={<Search size={18} aria-hidden="true" />}
        />
      </div>
      <div className={styles.field}>
        <Select
          label={t('search.filters.destinationLabel')}
          searchPlaceholder={selectTexts.searchPlaceholder}
          noOptionsMessage={selectTexts.noOptionsMessage}
          options={destinationOptions}
          value={draft.cityId ? String(draft.cityId) : ANY_VALUE}
          onChange={(value) => onChange({ cityId: toId(value) })}
        />
      </div>
      <div className={styles.field}>
        <Select
          label={t('search.filters.categoryLabel')}
          searchPlaceholder={selectTexts.searchPlaceholder}
          noOptionsMessage={selectTexts.noOptionsMessage}
          options={categoryOptions}
          value={draft.categoryId ? String(draft.categoryId) : ANY_VALUE}
          onChange={(value) => onChange({ categoryId: toId(value) })}
        />
      </div>
      <div className={styles.dates}>
        {isSingleDay ? (
          <DatePicker
            // eslint-disable-next-line react/jsx-props-no-spreading -- the same locale/label set both picker modes share
            {...datePickerTexts}
            mode="single"
            value={draft.dateRange.start}
            onChange={(date) =>
              onChange({ dateRange: { start: date, end: date } })
            }
          />
        ) : (
          <DatePicker
            // eslint-disable-next-line react/jsx-props-no-spreading -- the same locale/label set both picker modes share
            {...datePickerTexts}
            mode="range"
            value={draft.dateRange}
            onChange={(range) => onChange({ dateRange: range })}
          />
        )}
      </div>
      {party && (
        <div className={styles.field}>
          <Select
            label={t(`search.filters.party.${party}`)}
            options={partyOptions}
            value={draft.guests ? String(draft.guests) : ANY_VALUE}
            onChange={(value) => onChange({ guests: toId(value) })}
          />
        </div>
      )}
    </div>
  );
}

PrimarySearchFields.propTypes = {
  draft: searchDraftShape.isRequired,
  onChange: PropTypes.func.isRequired,
  categories: PropTypes.arrayOf(categoryShape).isRequired,
  destinations: PropTypes.arrayOf(destinationShape).isRequired,
  dateError: PropTypes.string,
  layout: PropTypes.oneOf(['stacked', 'inline']),
};
