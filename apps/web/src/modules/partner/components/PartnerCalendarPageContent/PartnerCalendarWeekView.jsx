/**
 * PartnerCalendarWeekView — Partner Workspace Sprint 5, P0. Seven days,
 * adapted per the SELECTED unit's own real scheduling shape — same
 * time-sliced-vs-date-only split as `PartnerCalendarDayView.jsx`
 * (see that file's header for the full rationale):
 *
 * - Time-sliced unit -> 7 day-columns sharing one hour axis
 *   (06:00-23:00), each column stacking a `TimeSlotBlock` per sibling
 *   time-sliced unit — the "operational schedule" view the brief asks
 *   Week to be for a domain that has one.
 * - Date-only unit -> a plain 7-cell status strip, reusing the exact
 *   `statusByDate` map the Month view already computes (the parent
 *   widens its `useListingCalendarQuery` range to cover whichever view
 *   is active, so this is the same data source, never a second fetch).
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Badge } from '@desavii/ui/components/primitives';
import { EmptyState } from '@desavii/ui/components/feedback-overlays';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  weekDates,
  startOfWeek,
  todayIso,
  HOUR_ROWS,
} from './calendarDateGrid.js';
import TimeSlotBlock, { HOUR_ROW_HEIGHT_PX } from './TimeSlotBlock.jsx';
import styles from './PartnerCalendarWeekView.module.scss';

const SOURCE_KEYS = ['booking', 'hold', 'block', 'external'];

function DateOnlyDayCell({
  date,
  status = null,
  isSelected,
  statusLabels,
  sources = null,
  sourceLabels = null,
  onSelect,
  dayFormatter,
}) {
  const presentSourceKeys = sources
    ? SOURCE_KEYS.filter((key) => sources[key])
    : [];
  const sourceLabelText = presentSourceKeys
    .map((key) => sourceLabels?.[key])
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      className={[
        styles.dayCell,
        status && styles[`dayCell--${status}`],
        isSelected && styles['dayCell--selected'],
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(date)}
      aria-label={[
        dayFormatter.format(new Date(`${date}T00:00:00Z`)),
        status ? (statusLabels[status] ?? status) : null,
        sourceLabelText || null,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <span className={styles.dayCellDate} aria-hidden="true">
        {dayFormatter.format(new Date(`${date}T00:00:00Z`))}
      </span>
      {status && (
        <Badge
          size="sm"
          variant="neutral"
          label={statusLabels[status] ?? status}
        />
      )}
      {presentSourceKeys.length > 0 && (
        <span className={styles.sourceDots} aria-hidden="true">
          {presentSourceKeys.map((key) => (
            <span
              key={key}
              className={[styles.sourceDot, styles[`sourceDot--${key}`]].join(
                ' ',
              )}
            />
          ))}
        </span>
      )}
    </button>
  );
}

DateOnlyDayCell.propTypes = {
  date: PropTypes.string.isRequired,
  status: PropTypes.string,
  isSelected: PropTypes.bool.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- keys are caller-chosen status codes
  statusLabels: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- caller-chosen source-presence flags, not a fixed shape
  sources: PropTypes.object,
  // eslint-disable-next-line react/forbid-prop-types -- keys are the caller's own source keys
  sourceLabels: PropTypes.object,
  onSelect: PropTypes.func.isRequired,
  dayFormatter: PropTypes.instanceOf(Intl.DateTimeFormat).isRequired,
};

export default function PartnerCalendarWeekView({
  weekStart,
  onWeekStartChange,
  units,
  effectiveUnit = undefined,
  isTimeSliced,
  statusByDate,
  statusLabels,
  sourceIndicatorsByDate = null,
  sourceLabels = null,
  selection = null,
  onSelectSlot,
  onSelectDate,
  locale,
}) {
  const { t } = useTranslation();
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const timeSlicedUnits = useMemo(
    () => units.filter((u) => u.time_slot_start),
    [units],
  );

  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }),
    [locale],
  );
  const rangeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    [locale],
  );

  return (
    <div className={styles.weekView}>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navButton}
          aria-label={t('partner.calendar.week.previousWeek')}
          onClick={() => onWeekStartChange(addDays(weekStart, -7))}
        >
          <Icon icon={ChevronLeft} size="sm" />
        </button>
        <span className={styles.rangeLabel}>
          {rangeFormatter.format(new Date(`${dates[0]}T00:00:00Z`))} –{' '}
          {rangeFormatter.format(new Date(`${dates[6]}T00:00:00Z`))}
        </span>
        <button
          type="button"
          className={styles.navButton}
          aria-label={t('partner.calendar.week.nextWeek')}
          onClick={() => onWeekStartChange(addDays(weekStart, 7))}
        >
          <Icon icon={ChevronRight} size="sm" />
        </button>
        {weekStart !== startOfWeek(todayIso()) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onWeekStartChange(startOfWeek(todayIso()))}
          >
            {t('partner.calendar.day.today')}
          </Button>
        )}
      </div>

      {isTimeSliced && timeSlicedUnits.length === 0 && (
        <EmptyState title={t('partner.calendar.timeline.noSlots')} />
      )}

      {isTimeSliced && timeSlicedUnits.length > 0 && (
        <div className={styles.timeline}>
          <div className={styles.hourLabels}>
            <div className={styles.hourLabelsSpacer} />
            {HOUR_ROWS.map((hour) => (
              <div
                key={hour}
                className={styles.hourLabel}
                style={{ height: HOUR_ROW_HEIGHT_PX }}
              >
                {hour}
              </div>
            ))}
          </div>
          <div className={styles.days}>
            {dates.map((date) => (
              <div key={date} className={styles.dayColumn}>
                <div className={styles.dayColumnHeader}>
                  {weekdayFormatter.format(new Date(`${date}T00:00:00Z`))}
                </div>
                <div
                  className={styles.slotsLayer}
                  style={{ height: HOUR_ROWS.length * HOUR_ROW_HEIGHT_PX }}
                >
                  {HOUR_ROWS.map((hour) => (
                    <div
                      key={hour}
                      className={styles.hourGridline}
                      style={{ height: HOUR_ROW_HEIGHT_PX }}
                    />
                  ))}
                  {timeSlicedUnits.map((unit) => (
                    <TimeSlotBlock
                      key={unit.id}
                      unit={unit}
                      date={date}
                      isSelected={
                        selection?.start === date &&
                        effectiveUnit?.id === unit.id
                      }
                      onSelect={onSelectSlot}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isTimeSliced && (
        <div className={styles.weekStrip}>
          {dates.map((date) => (
            <DateOnlyDayCell
              key={date}
              date={date}
              status={statusByDate[date]}
              isSelected={selection?.start === date}
              statusLabels={statusLabels}
              sources={sourceIndicatorsByDate?.[date]}
              sourceLabels={sourceLabels}
              onSelect={onSelectDate}
              dayFormatter={weekdayFormatter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

PartnerCalendarWeekView.propTypes = {
  weekStart: PropTypes.string.isRequired,
  onWeekStartChange: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- real GET /availability/units row shape
  units: PropTypes.arrayOf(PropTypes.object).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- same
  effectiveUnit: PropTypes.object,
  isTimeSliced: PropTypes.bool.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- date-keyed status map, not a fixed shape
  statusByDate: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- keys are caller-chosen status codes
  statusLabels: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- date-keyed map of caller-chosen source-presence flags, not a fixed shape
  sourceIndicatorsByDate: PropTypes.object,
  // eslint-disable-next-line react/forbid-prop-types -- keys are the caller's own source keys
  sourceLabels: PropTypes.object,
  selection: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  onSelectSlot: PropTypes.func.isRequired,
  onSelectDate: PropTypes.func.isRequired,
  locale: PropTypes.string.isRequired,
};
