/**
 * PropTypes shapes shared by the Search page's components — one
 * definition of the catalog rows (`GET /search/categories`,
 * `GET /search/destinations`) and of the applied filter state
 * (`useSearchFilters().filters`), instead of each component restating
 * them.
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

export const searchDraftShape = PropTypes.shape({
  destination: PropTypes.string.isRequired,
  cityId: PropTypes.number,
  categoryId: PropTypes.number,
  dateRange: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }).isRequired,
  guests: PropTypes.number,
  priceMin: PropTypes.string.isRequired,
  priceMax: PropTypes.string.isRequired,
  dynamicFilters: PropTypes.objectOf(PropTypes.string).isRequired,
});
