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
import { PriceTag } from '@desavii/ui/components/data-display';
import { Button } from '@desavii/ui/components/primitives';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import {
  resolveBookingCtaLabel,
  resolvePricingModelLabel,
} from '../../../utils/reservationLabels.js';
import ListingReservationWidget from '../ListingReservationWidget/ListingReservationWidget.jsx';
import styles from './MobileBookingBar.module.scss';

export default function MobileBookingBar({
  listingId,
  pricing = null,
  bookingCtaKey,
  location = null,
  selectedUnitId = undefined,
  onSelectUnit = undefined,
  dateRange = undefined,
  onChangeDateRange = undefined,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [isOpen, setIsOpen] = useState(false);

  const ctaLabel = resolveBookingCtaLabel(t, bookingCtaKey);
  const pricingModelLabel = resolvePricingModelLabel(t, pricing);

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.priceArea}>
          {pricing ? (
            <PriceTag
              amount={pricing.amount}
              currencyCode={pricing.currency}
              locale={locale}
              suffix={pricingModelLabel}
              size="md"
            />
          ) : (
            <span className={styles.noPricing}>
              {t('pages.listingDetail.reservation.noUnitsAvailable')}
            </span>
          )}
        </div>
        <Button variant="primary" onClick={() => setIsOpen(true)}>
          {ctaLabel}
        </Button>
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
          bookingCtaKey={bookingCtaKey}
          location={location}
          selectedUnitId={selectedUnitId}
          onSelectUnit={onSelectUnit}
          dateRange={dateRange}
          onChangeDateRange={onChangeDateRange}
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
  }),
  bookingCtaKey: PropTypes.string.isRequired,
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
};
