/**
 * BookingItemMenuPreorder — on a restaurant booking item, whether it is a
 * table reservation alone or a table with a dish pre-order, and the
 * pre-order itself (docs/BOOKING_WIDGET_REBUILD.md §5). Shared by the
 * guest's, the partner's and the admin's booking detail, so all three read
 * the same stored snapshot the same way. Renders nothing for any other
 * booking type.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { RESTAURANT_BOOKING_TYPE } from '../../utils/restaurantReservation.js';
import MenuPreorderSummary from '../MenuPreorderSummary/MenuPreorderSummary.jsx';

export default function BookingItemMenuPreorder({
  bookingType = null,
  item,
  locale,
  headingLevel = 3,
}) {
  const { t } = useTranslation();
  if (bookingType !== RESTAURANT_BOOKING_TYPE) return null;
  const preorder = item.menu_preorder ?? null;

  return (
    <>
      <p>
        {t('bookings.menuPreorder.reservationType')}:{' '}
        {t(
          preorder
            ? 'bookings.menuPreorder.withPreorder'
            : 'bookings.menuPreorder.tableOnly',
        )}
      </p>
      {preorder && (
        <MenuPreorderSummary
          lines={preorder.lines.map((line, index) => ({
            // A deleted dish keeps its snapshot but loses its id.
            key: line.menu_item_id ?? `line-${index}`,
            title: line.title,
            quantity: line.quantity,
            lineTotalAmount: line.line_total_amount,
          }))}
          subtotalAmount={preorder.subtotal_amount}
          currency={preorder.currency}
          locale={locale}
          priceMode="snapshot"
          headingLevel={headingLevel}
        />
      )}
    </>
  );
}

BookingItemMenuPreorder.propTypes = {
  bookingType: PropTypes.string,
  item: PropTypes.shape({
    menu_preorder: PropTypes.shape({
      lines: PropTypes.arrayOf(
        PropTypes.shape({
          menu_item_id: PropTypes.number,
          title: PropTypes.string.isRequired,
          quantity: PropTypes.number.isRequired,
          line_total_amount: PropTypes.string.isRequired,
        }),
      ).isRequired,
      subtotal_amount: PropTypes.string.isRequired,
      currency: PropTypes.string.isRequired,
    }),
  }).isRequired,
  locale: PropTypes.string.isRequired,
  headingLevel: PropTypes.oneOf([2, 3, 4]),
};
