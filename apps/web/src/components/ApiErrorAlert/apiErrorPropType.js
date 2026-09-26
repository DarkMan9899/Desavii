import PropTypes from 'prop-types';

/** A rejected mutation's `ApiError` (`api/ApiError.js`), as forms receive it. */
const apiErrorPropType = PropTypes.shape({
  code: PropTypes.string,
  status: PropTypes.number,
  // eslint-disable-next-line react/forbid-prop-types -- backend detail entries; parseApiError validates each one
  details: PropTypes.array,
});

export default apiErrorPropType;
