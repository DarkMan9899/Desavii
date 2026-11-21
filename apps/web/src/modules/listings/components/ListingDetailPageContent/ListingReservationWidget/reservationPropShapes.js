/**
 * PropTypes shapes the reservation panel and the mobile booking bar both
 * accept for a restaurant's menus and weekly opening hours (the public
 * `GET /listings/:id/menu` and opening-hours wire shapes).
 */

import PropTypes from 'prop-types';

export const menusShape = PropTypes.arrayOf(
  PropTypes.shape({
    id: PropTypes.number,
    is_active: PropTypes.bool,
    sections: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.number,
        title: PropTypes.string,
        items: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number })),
      }),
    ),
  }),
);

export const weeklyHoursShape = PropTypes.arrayOf(
  PropTypes.shape({
    day_of_week: PropTypes.number,
    opens_at: PropTypes.string,
    closes_at: PropTypes.string,
    is_closed: PropTypes.bool,
  }),
);
