/**
 * PropTypes for a `GET /search/map` marker (`searchDto.js`'s
 * `toSearchMapResultResponse`), shared by every Map Search component.
 */

import PropTypes from 'prop-types';

export const mapMarkerShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  slug: PropTypes.string,
  title: PropTypes.string.isRequired,
  listing_type: PropTypes.string,
  category_slug: PropTypes.string,
  city_name: PropTypes.string,
  latitude: PropTypes.number.isRequired,
  longitude: PropTypes.number.isRequired,
  location_precision: PropTypes.oneOf(['exact', 'approximate']).isRequired,
  cover_image_url: PropTypes.string,
  price_amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  price_currency_code: PropTypes.string,
  pricing_model: PropTypes.string,
  rating_average: PropTypes.number,
  review_count: PropTypes.number,
});

export default mapMarkerShape;
