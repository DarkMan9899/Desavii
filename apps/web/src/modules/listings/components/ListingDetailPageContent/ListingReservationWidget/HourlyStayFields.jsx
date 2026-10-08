/**
 * Step L6.3B — the hourly-stay inputs for an hourly-enabled hotel room:
 * one date, then a start and an end time on the hour, built from the room's
 * own window and minimum/maximum duration. Hours that are sold out or have
 * already started (server clock, Armenia time) are not selectable, and an
 * end time can only extend through hours that are still free. Nightly
 * check-in/check-out never appear here.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { DatePicker, Select } from '@desavii/ui/components/form-controls';
import { Inline } from '@desavii/ui/components/layout';
import { Spinner } from '@desavii/ui/components/feedback-overlays';
import {
  formatHour,
  parseWholeHour,
  startHourOptions,
  endHourOptions,
  toHourlyRules,
} from '../../../utils/hourlyStay.js';
import styles from './ListingReservationWidget.module.scss';

const UNAVAILABLE_SLOT_STATUSES = new Set(['SOLD_OUT', 'PAST']);

export default function HourlyStayFields({
  unit,
  slots = null,
  isLoadingSlots = false,
  date = null,
  startHour = null,
  endHour = null,
  today,
  maxDate = undefined,
  locale,
  onChangeDate,
  onChangeStart,
  onChangeEnd,
}) {
  const { t } = useTranslation();
  const rules = toHourlyRules(unit);
  const unavailableHours = new Set(
    (slots ?? [])
      .filter((slot) => UNAVAILABLE_SLOT_STATUSES.has(slot.status))
      .map((slot) => parseWholeHour(slot.start_time)),
  );
  const isFree = (hour) => !unavailableHours.has(hour);
  const hasSlots = Boolean(date) && Array.isArray(slots);

  const startOptions = startHourOptions(rules).map((hour) => ({
    value: String(hour),
    label: formatHour(hour),
    disabled: !hasSlots || !isFree(hour),
  }));
  const endOptions =
    startHour === null
      ? []
      : endHourOptions(startHour, rules).map((hour) => {
          let throughFree = true;
          for (let h = startHour; h < hour; h += 1) {
            if (!isFree(h)) throughFree = false;
          }
          return {
            value: String(hour),
            label: formatHour(hour),
            disabled: !throughFree,
          };
        });
  const noTimesLeft =
    hasSlots && startOptions.every((option) => option.disabled);
  const hours =
    startHour !== null && endHour !== null ? endHour - startHour : null;

  return (
    <>
      <DatePicker
        mode="single"
        label={t('pages.listingDetail.reservation.dateLabel')}
        value={date}
        onChange={onChangeDate}
        minDate={today}
        maxDate={maxDate}
        locale={locale}
        previousMonthLabel={t('partner.listingWizard.datePicker.previousMonth')}
        nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
        placeholder={t('partner.listingWizard.datePicker.selectDate')}
      />
      {date && isLoadingSlots && (
        <Spinner label={t('pages.listingDetail.reservation.loadingTimes')} />
      )}
      {noTimesLeft ? (
        <p role="status" className={styles.staySoldOut}>
          {t('pages.listingDetail.reservation.noHourlyTimesForDate')}
        </p>
      ) : (
        <Inline gap="3" wrap>
          <Select
            label={t('pages.listingDetail.reservation.startTimeLabel')}
            placeholder={t('partner.listingWizard.selectPlaceholder')}
            options={startOptions}
            value={startHour === null ? null : String(startHour)}
            disabled={!hasSlots}
            onChange={(value) => onChangeStart(Number(value))}
          />
          <Select
            label={t('pages.listingDetail.reservation.endTimeLabel')}
            placeholder={t('partner.listingWizard.selectPlaceholder')}
            options={endOptions}
            value={endHour === null ? null : String(endHour)}
            disabled={startHour === null}
            onChange={(value) => onChangeEnd(Number(value))}
          />
        </Inline>
      )}
      {hours !== null && (
        <p role="status" className={styles.stayNights}>
          {t('pages.listingDetail.reservation.hourlyDuration', {
            count: hours,
          })}
        </p>
      )}
      <p className={styles.hourlyHint}>
        {t('pages.listingDetail.reservation.hourlyHint', {
          from: unit.hourly_available_from,
          until: unit.hourly_available_until,
        })}
      </p>
    </>
  );
}

HourlyStayFields.propTypes = {
  unit: PropTypes.shape({
    hourly_min_duration_hours: PropTypes.number,
    hourly_max_duration_hours: PropTypes.number,
    hourly_available_from: PropTypes.string,
    hourly_available_until: PropTypes.string,
  }).isRequired,
  slots: PropTypes.arrayOf(
    PropTypes.shape({
      start_time: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    }),
  ),
  isLoadingSlots: PropTypes.bool,
  date: PropTypes.string,
  startHour: PropTypes.number,
  endHour: PropTypes.number,
  today: PropTypes.string.isRequired,
  maxDate: PropTypes.string,
  locale: PropTypes.string.isRequired,
  onChangeDate: PropTypes.func.isRequired,
  onChangeStart: PropTypes.func.isRequired,
  onChangeEnd: PropTypes.func.isRequired,
};
