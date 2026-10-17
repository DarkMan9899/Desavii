/**
 * The one place that turns `GET /search/filters` metadata into localized
 * text — used by the quick-filter pills, the filter panel, the active
 * chips and the Category page's own filter panel, so a filter reads the
 * same everywhere.
 *
 * Sources, by kind of value:
 * - amenities: the API's `label`, already in the requested language
 *   (`listing_amenity_translations`);
 * - attribute / policy names, option codes and units: the platform's
 *   catalog vocabulary (`partner.listingWizard.*`), the same translated
 *   catalog partners author listings with — never a second Search-only
 *   copy that could drift from it;
 * - Search-only computed filters (guest rating, meal plan, hourly stays)
 *   and group headings: `search.dynamicFilters.*`.
 */

const CATALOG = 'partner.listingWizard';

/** `4.5` → `4.5`, in the visitor's number format. */
function formatRating(value, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Number(value),
  );
}

/**
 * A Search-specific name wins where the catalog's would be ambiguous on
 * this page (Restaurants' `price_tier` is "Price" in the catalog, next to
 * Search's own Price filter) — otherwise the catalog name.
 */
export function definitionLabel(t, definition) {
  const searchKey = `search.dynamicFilters.definitions.${definition.code}`;
  switch (definition.value_source) {
    case 'ATTRIBUTE':
      return t(
        [searchKey, `${CATALOG}.attributes.${definition.code}`],
        definition.code,
      );
    case 'POLICY':
      return t(
        [searchKey, `${CATALOG}.policies.${definition.code}`],
        definition.code,
      );
    default:
      return t(searchKey);
  }
}

export function optionLabel(t, definition, option, locale) {
  switch (definition.value_source) {
    case 'AMENITY':
      return option.label ?? option.code;
    case 'REVIEW':
      return t('search.dynamicFilters.ratingAtLeast', {
        value: formatRating(option.code, locale),
      });
    case 'ROOM':
      return t(`${CATALOG}.mealPlans.${option.code}`, option.code);
    default:
      return t(
        `${CATALOG}.options.${definition.code}.${option.code}`,
        option.code,
      );
  }
}

/** A unit for a quantity (`2 bedrooms`), pluralized by the language's own rules. */
export function unitLabel(t, unit, count) {
  return unit
    ? t(`${CATALOG}.units.${unit}`, { count, defaultValue: unit })
    : '';
}

export function groupLabel(t, code) {
  return t(`search.dynamicFilters.groups.${code}`, code);
}

/** A group holding only one filter of the same name (Amenities) names it once. */
export function isNamedByGroup(t, group, definition) {
  return (
    group.definitions.length === 1 &&
    definitionLabel(t, definition) === groupLabel(t, group.code)
  );
}
