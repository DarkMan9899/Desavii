/**
 * RestaurantReservationFields — a table reservation's own questions
 * (docs/BOOKING_WIDGET_REBUILD.md §4–§5, W-09/W-14): the date, a time the
 * restaurant is open, the party size, and — only when the partner has
 * published a menu in the page's language — whether to pre-order dishes.
 *
 * Never a date range, a "Guests" room field or a table count: a table
 * reservation is one reservation for one party. The pre-order itself is
 * chosen in `MenuPreorderPicker`; this block shows what was chosen and how
 * it is paid (at the restaurant).
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import {
  DatePicker,
  Input,
  Radio,
  Select,
} from '@desavii/ui/components/form-controls';
import { Stack } from '@desavii/ui/components/layout';
import { SMALLINT_UNSIGNED_MAX } from '../../../../availability/index.js';
import MenuPreorderSummary from '../../../../bookings/components/MenuPreorderSummary/MenuPreorderSummary.jsx';
import useSelectTexts from '../../../../../hooks/useSelectTexts.js';
import QuantityStepper from './QuantityStepper.jsx';
import styles from './MenuPreorder.module.scss';
import widgetStyles from './ListingReservationWidget.module.scss';

function TimeField({ times = null, time, date = null, onChangeTime }) {
  const { t } = useTranslation();
  const selectTexts = useSelectTexts();
  const label = t('pages.listingDetail.reservation.reservationTimeLabel');
  // No published hours: a free time field, never an invented schedule.
  if (times === null) {
    return (
      <Input
        type="time"
        label={label}
        value={time}
        disabled={!date}
        onChange={(event) => onChangeTime(event.target.value)}
      />
    );
  }
  if (date && times.length === 0) {
    return (
      <p role="status" className={widgetStyles.staySoldOut}>
        {t('pages.listingDetail.reservation.restaurant.noTimes')}
      </p>
    );
  }
  return (
    <Select
      label={label}
      searchPlaceholder={selectTexts.searchPlaceholder}
      noOptionsMessage={selectTexts.noOptionsMessage}
      options={times.map((value) => ({ value, label: value }))}
      value={time || ''}
      disabled={!date}
      placeholder={t(
        'pages.listingDetail.reservation.restaurant.timePlaceholder',
      )}
      onChange={(value) => onChangeTime(value ?? '')}
    />
  );
}

TimeField.propTypes = {
  times: PropTypes.arrayOf(PropTypes.string),
  time: PropTypes.string.isRequired,
  date: PropTypes.string,
  onChangeTime: PropTypes.func.isRequired,
};

export default function RestaurantReservationFields({
  date = null,
  onChangeDate,
  today,
  maxDate = undefined,
  times = null,
  closesAfterMidnightAt = null,
  time,
  onChangeTime,
  partySize,
  onChangePartySize,
  menuPreorder,
  withPreorder,
  onChangeWithPreorder,
  onOpenMenu,
  priceLocale,
}) {
  const { t, i18n } = useTranslation();
  const modeName = useId();
  const { preorder } = menuPreorder;

  return (
    <Stack gap="4">
      <DatePicker
        mode="single"
        label={t('pages.listingDetail.reservation.dateLabel')}
        value={date}
        onChange={onChangeDate}
        minDate={today}
        today={today}
        maxDate={maxDate}
        locale={i18n.language}
        previousMonthLabel={t('partner.listingWizard.datePicker.previousMonth')}
        nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
        placeholder={t('partner.listingWizard.datePicker.selectDate')}
      />
      <TimeField
        times={times}
        time={time}
        date={date}
        onChangeTime={onChangeTime}
      />
      {closesAfterMidnightAt && (
        <p className={widgetStyles.timeHint}>
          {t('pages.listingDetail.reservation.restaurant.overnightHint', {
            time: closesAfterMidnightAt,
          })}
        </p>
      )}
      <QuantityStepper
        label={t('pages.listingDetail.reservation.partySizeLabel')}
        value={partySize}
        min={1}
        max={SMALLINT_UNSIGNED_MAX}
        onChange={onChangePartySize}
      />

      {menuPreorder.hasMenu && (
        <fieldset className={styles.modeChoice}>
          <legend className={styles.modeLegend}>
            {t('pages.listingDetail.reservation.restaurant.modeLabel')}
          </legend>
          <Radio
            name={modeName}
            value="table"
            label={t('pages.listingDetail.reservation.restaurant.tableOnly')}
            checked={!withPreorder}
            onChange={() => onChangeWithPreorder(false)}
          />
          <Radio
            name={modeName}
            value="preorder"
            label={t('pages.listingDetail.reservation.restaurant.withPreorder')}
            checked={withPreorder}
            onChange={() => onChangeWithPreorder(true)}
          />
        </fieldset>
      )}

      {menuPreorder.hasMenu && withPreorder && (
        <div className={styles.preorderBlock}>
          {menuPreorder.hasSelection && preorder.subtotalAmount ? (
            <MenuPreorderSummary
              lines={preorder.lines.map((line) => ({
                key: line.menuItemId,
                title: line.title,
                quantity: line.quantity,
                lineTotalAmount: line.lineTotalAmount,
              }))}
              subtotalAmount={preorder.subtotalAmount}
              currency={preorder.currency}
              locale={priceLocale}
            />
          ) : (
            <p className={styles.preorderEmpty}>
              {t('pages.listingDetail.reservation.restaurant.preorderEmpty')}
            </p>
          )}
          <Button
            variant="secondary"
            ariaHasPopup="dialog"
            onClick={onOpenMenu}
          >
            {t(
              menuPreorder.hasSelection
                ? 'pages.listingDetail.reservation.restaurant.editDishes'
                : 'pages.listingDetail.reservation.restaurant.chooseDishes',
            )}
          </Button>
        </div>
      )}
    </Stack>
  );
}

RestaurantReservationFields.propTypes = {
  date: PropTypes.string,
  onChangeDate: PropTypes.func.isRequired,
  today: PropTypes.string.isRequired,
  maxDate: PropTypes.string,
  times: PropTypes.arrayOf(PropTypes.string),
  closesAfterMidnightAt: PropTypes.string,
  time: PropTypes.string.isRequired,
  onChangeTime: PropTypes.func.isRequired,
  partySize: PropTypes.number.isRequired,
  onChangePartySize: PropTypes.func.isRequired,
  menuPreorder: PropTypes.shape({
    hasMenu: PropTypes.bool.isRequired,
    hasSelection: PropTypes.bool.isRequired,
    preorder: PropTypes.shape({
      lines: PropTypes.arrayOf(
        PropTypes.shape({ menuItemId: PropTypes.number }),
      ).isRequired,
      subtotalAmount: PropTypes.string,
      currency: PropTypes.string,
    }).isRequired,
  }).isRequired,
  withPreorder: PropTypes.bool.isRequired,
  onChangeWithPreorder: PropTypes.func.isRequired,
  onOpenMenu: PropTypes.func.isRequired,
  priceLocale: PropTypes.string.isRequired,
};
