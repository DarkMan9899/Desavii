/**
 * One chip per applied Search filter, in the order the form shows them:
 * keyword, destination, category, dates, party size, price, then each
 * category filter (`getActiveFilterChips`, the Category page's own chip
 * builder). Each chip carries exactly what removing it means: `patch`
 * for `updateFilters`, or `dynamicKeys` for `updateDynamicFilter`. Pure,
 * so the chip row and its tests share one source.
 */

import { getActiveFilterChips } from '../components/DynamicFilterPanel/activeFilterChips.js';
import { formatMoney } from '../../../utils/formatMoney.js';
import { BASE_CURRENCY } from '../../../utils/currencyPolicy.js';

/** `YYYY-MM-DD` dates are calendar days, so they are formatted in UTC — never shifted by the viewer's timezone. */
export function formatSearchDates(dateFrom, dateTo, locale) {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const start = new Date(`${dateFrom}T00:00:00Z`);
  if (dateFrom === dateTo) return formatter.format(start);
  return formatter.formatRange(start, new Date(`${dateTo}T00:00:00Z`));
}

function formatAmd(amount, locale) {
  return formatMoney({ amountAmd: amount, currency: BASE_CURRENCY, locale });
}

function priceChipLabel({ priceMin, priceMax }, t, locale) {
  if (priceMin !== undefined && priceMax !== undefined) {
    return t('search.filters.price.chipRange', {
      min: formatAmd(priceMin, locale),
      max: formatAmd(priceMax, locale),
    });
  }
  if (priceMin !== undefined) {
    return t('search.filters.price.chipMin', {
      min: formatAmd(priceMin, locale),
    });
  }
  return t('search.filters.price.chipMax', {
    max: formatAmd(priceMax, locale),
  });
}

/**
 * @returns {Array<{ key: string, label: string, patch?: object, dynamicKeys?: string[] }>}
 */
export function buildActiveSearchChips({
  filters,
  categories,
  destinations,
  groups,
  party,
  t,
  locale,
}) {
  const chips = [];
  if (filters.destination) {
    chips.push({
      key: 'destination',
      label: t('search.filters.keywordChip', { keyword: filters.destination }),
      patch: { destination: '' },
    });
  }
  const city = destinations.find(
    (destination) => destination.id === filters.cityId,
  );
  if (city) {
    chips.push({
      key: 'cityId',
      label: city.name,
      patch: { cityId: undefined },
    });
  }
  const category = categories.find(
    (candidate) => candidate.id === filters.categoryId,
  );
  if (category) {
    chips.push({
      key: 'categoryId',
      label: category.name,
      patch: { categoryId: undefined },
    });
  }
  if (filters.dateFrom && filters.dateTo) {
    chips.push({
      key: 'dates',
      label: formatSearchDates(filters.dateFrom, filters.dateTo, locale),
      patch: { dateFrom: undefined, dateTo: undefined },
    });
  }
  if (filters.guests && party) {
    chips.push({
      key: 'guests',
      label: t(`search.filters.partyCount.${party}`, { count: filters.guests }),
      patch: { guests: undefined },
    });
  }
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    chips.push({
      key: 'price',
      label: priceChipLabel(filters, t, locale),
      patch: { priceMin: undefined, priceMax: undefined },
    });
  }
  getActiveFilterChips(groups, filters.dynamicFilters, t).forEach((chip) => {
    chips.push({
      key: chip.key,
      label: chip.label,
      dynamicKeys: chip.keysToClear,
    });
  });
  return chips;
}

export default buildActiveSearchChips;
