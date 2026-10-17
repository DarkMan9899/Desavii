/**
 * PropTypes shapes shared by the Search page's components — one
 * definition of the catalog rows (`GET /search/categories`,
 * `GET /search/destinations`, `GET /search/filters`) and of the applied
 * filter state (`useSearchFilters().filters`), instead of each component
 * restating them.
 */

import PropTypes from 'prop-types';

export const categoryShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  slug: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
});

export const destinationShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  listing_count: PropTypes.number.isRequired,
});

export const searchFiltersShape = PropTypes.shape({
  destination: PropTypes.string.isRequired,
  categoryId: PropTypes.number,
  cityId: PropTypes.number,
  sort: PropTypes.string.isRequired,
  dateFrom: PropTypes.string,
  dateTo: PropTypes.string,
  guests: PropTypes.number,
  priceMin: PropTypes.number,
  priceMax: PropTypes.number,
  dynamicFilters: PropTypes.objectOf(PropTypes.string).isRequired,
});

/** One `GET /search/filters` definition (see `api/search.js`). */
export const filterDefinitionShape = PropTypes.shape({
  code: PropTypes.string.isRequired,
  input_type: PropTypes.string.isRequired,
  value_source: PropTypes.string.isRequired,
  param: PropTypes.string,
  is_advanced: PropTypes.bool,
  unit: PropTypes.string,
  min: PropTypes.number,
  max: PropTypes.number,
  listing_count: PropTypes.number,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
        .isRequired,
      code: PropTypes.string.isRequired,
      label: PropTypes.string,
      group: PropTypes.string,
      count: PropTypes.number,
    }),
  ).isRequired,
});

export const filterGroupShape = PropTypes.shape({
  code: PropTypes.string.isRequired,
  definitions: PropTypes.arrayOf(filterDefinitionShape).isRequired,
});
