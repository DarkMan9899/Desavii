/**
 * MobileBookingBar — Phase 18.11. Below the `laptop` breakpoint (where
 * `ListingDetailPageContent.module.scss`'s `.sidebar` stops being a
 * sticky column and would otherwise just fall to the bottom of the
 * document flow), this renders instead: a real fixed bottom bar showing
 * the price and a booking CTA that opens the *same* `ListingReservationWidget`
 * inside a bottom `Drawer`. This is a deliberately different pattern
 * from the desktop sidebar, not the desktop panel squeezed into a
 * narrower column — matches every reference booking product's mobile
 * pattern (price bar pinned to the viewport, full booking flow behind a
 * tap), and reuses the widget itself rather than re-implementing unit
 * selection/date-picking/quantity/total for a second time.
 *
 * Hidden at `laptop` and up via CSS (`display: none`) rather than a JS
 * media-query check — matches this codebase's established
 * `respond()`-mixin convention for breakpoint-conditional chrome (e.g.
 * `ListingDetailPageContent.module.scss`'s own `.sidebar`), so there is
 * no client-side layout flash before hydration settles.
 *
 * Sprint C-2: forwards the same lifted `selectedUnitId`/`onSelectUnit`
 * `ListingDetailPageContent` passes the desktop widget — a room picked
 * in `ListingRoomsSection` on a mobile viewport must show up here too
 * once this drawer opens, not just on desktop.
 *
 * Sprint C-3: forwards the same lifted `dateRange`/`onChangeDateRange`
 * pair too — a stay picked inside this drawer's widget must update
 * `ListingRoomsSection`'s cards the moment the drawer closes, exactly
 * like the desktop sidebar already does.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@desavii/ui/components/primitives';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import {
  resolvePricingModelLabel,
  isPricingModelBookable,
} from '../../../utils/reservationLabels.js';
import {
  resolveBookingFlow,
  resolveBookingCtaKey,
} from '../../../utils/bookingFlows.js';
import { useListingBookableUnitsQuery } from '../../../queries/useListingBookableUnitsQuery.js';
import ListingReservationWidget from '../ListingReservationWidget/ListingReservationWidget.jsx';
import {
  menusShape,
  weeklyHoursShape,
} from '../ListingReservationWidget/reservationPropShapes.js';
import Money from '../../../../../components/Money/Money.jsx';
import styles from './MobileBookingBar.module.scss';

export default function MobileBookingBar({
  listingId,
  pricing = null,
  location = null,
  selectedUnitId = undefined,
  onSelectUnit = undefined,
  dateRange = undefined,
  onChangeDateRange = undefined,
  listingType = null,
  bookingRules = null,
  categorySlug = null,
  menus = [],
  weeklyHours = null,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [isOpen, setIsOpen] = useState(false);
  // The bar names the same action as the panel, from the same (cached)
  // units read — "Rent this car", "Reserve a table", "Book tour"…
  const { data: units } = useListingBookableUnitsQuery(listingId);
  const ctaLabel = t(
    resolveBookingCtaKey({
      flow: resolveBookingFlow(units),
      categorySlug,
      listingType,
    }),
  );
  const pricingModelLabel = resolvePricingModelLabel(t, pricing, listingType);
  // Step L6.2H1: a legacy pricing model the server refuses to book shows
  // why instead of a price, and offers no booking drawer.
  const isBookable = isPricingModelBookable(pricing);

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.priceArea}>
          {!isBookable && (
            <span className={styles.noPricing}>
              {t('pages.listingDetail.reservation.pricingUnavailable')}
            </span>
          )}
          {isBookable && pricing && (
            <Money
              amountAmd={pricing.amount}
              locale={locale}
              suffix={pricingModelLabel}
              size="md"
            />
          )}
          {isBookable && !pricing && (
            <span className={styles.noPricing}>
              {t('pages.listingDetail.reservation.noUnitsAvailable')}
            </span>
          )}
        </div>
        {isBookable && (
          // The CTA takes the room the price leaves; a label too long for
          // it moves to its own row — the price is never clipped.
          <div className={styles.cta}>
            <Button variant="primary" fullWidth onClick={() => setIsOpen(true)}>
              {ctaLabel}
            </Button>
          </div>
        )}
      </div>

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchor="bottom"
        title={ctaLabel}
        closeLabel={t('common.close')}
      >
        <ListingReservationWidget
          listingId={listingId}
          pricing={pricing}
          location={location}
          selectedUnitId={selectedUnitId}
          onSelectUnit={onSelectUnit}
          dateRange={dateRange}
          onChangeDateRange={onChangeDateRange}
          listingType={listingType}
          bookingRules={bookingRules}
          categorySlug={categorySlug}
          menus={menus}
          weeklyHours={weeklyHours}
          presentation="sheet"
        />
      </Drawer>
    </>
  );
}

MobileBookingBar.propTypes = {
  listingId: PropTypes.number.isRequired,
  pricing: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    currency: PropTypes.string,
    pricing_model: PropTypes.string,
    is_model_supported: PropTypes.bool,
  }),
  location: PropTypes.shape({
    cityName: PropTypes.string,
    countryName: PropTypes.string,
  }),
  selectedUnitId: PropTypes.number,
  onSelectUnit: PropTypes.func,
  dateRange: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  onChangeDateRange: PropTypes.func,
  // Step L6.2F: forwarded to the reservation widget (booking-rule UX).
  listingType: PropTypes.string,
  categorySlug: PropTypes.string,
  bookingRules: PropTypes.shape({
    minimum_stay_nights: PropTypes.number,
    maximum_stay_nights: PropTypes.number,
    advance_booking_min_hours: PropTypes.number,
    advance_booking_max_days: PropTypes.number,
  }),
  menus: menusShape,
  weeklyHours: weeklyHoursShape,
};
