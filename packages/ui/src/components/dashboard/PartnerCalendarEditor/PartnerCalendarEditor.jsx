/**
 * PartnerCalendarEditor — COMPONENT_LIBRARY.md Part II §8 "Partner
 * Calendar Editor": an always-open month grid (no popover chrome)
 * reusing `DatePicker`'s calendar-math and grid/keyboard-navigation
 * shape (`PartnerCalendarPageContent.jsx`). `statusByDate` values are a
 * small closed vocabulary (`available`/`blocked`/`booked`) the caller
 * maps backend codes onto — same "variant not business logic" contract
 * `Badge` uses. Price-override editing is deliberately out of scope
 * (no shared popover-editing primitive exists yet); this only toggles
 * a date/date-range `selection` for the caller's own blackout form.
 *
 * `viewMonth` is a plain `{year, month}` pair (0-indexed month, like
 * `Date#getMonth()`) rather than a `Date` instance — the caller's own
 * `monthRange()`/`todayViewMonth()` helpers already work in that shape
 * (a `Date`'s time-of-day/timezone components carry no meaning for "which
 * month is showing"), so this matches rather than forcing a conversion.
 *
 * Calendar Excellence: a weekday header (`weekStartsOn` lets the caller
 * match its own Week view), `today` (a `YYYY-MM-DD` string the caller
 * resolves in the business timezone — this component never guesses one)
 * marking today and dimming past dates, and a legend for every status and
 * every source dot. Each status also carries a non-color cue (a hatch for
 * blocked, a struck-through number for fully booked, a fill bar for
 * partial), so the grid never relies on color alone.
 */

import { useId, useMemo } from 'react';
import PropTypes from 'prop-types';
import Skeleton from '../../feedback-overlays/Skeleton/Skeleton.jsx';
import { createDateFormatter } from '../../../utils/dateFormat.js';
import styles from './PartnerCalendarEditor.module.scss';

const DAYS_PER_WEEK = 7;
// Sunday 4 January 1970: a fixed reference week, so the weekday header
// only ever depends on `locale` and `weekStartsOn`.
const REFERENCE_SUNDAY = { year: 1970, month: 0, day: 4 };

function addMonths({ year, month }, delta) {
  const total = month + delta;
  return {
    year: year + Math.floor(total / 12),
    month: ((total % 12) + 12) % 12,
  };
}

function toISODate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function buildMonthGrid({ year, month }, weekStartsOn) {
  const leadingDays =
    (new Date(year, month, 1).getDay() - weekStartsOn + DAYS_PER_WEEK) %
    DAYS_PER_WEEK;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < leadingDays; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1)
    cells.push(new Date(year, month, day));
  return cells;
}

function EmptyDayCell() {
  return <span role="presentation" className={styles.emptyCell} />;
}

function chunkIntoWeeks(cells) {
  const weeks = [];
  for (let i = 0; i < cells.length; i += DAYS_PER_WEEK)
    weeks.push(cells.slice(i, i + DAYS_PER_WEEK));
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek && lastWeek.length < DAYS_PER_WEEK) lastWeek.push(null);
  return weeks;
}

const SOURCE_KEYS = ['booking', 'hold', 'block', 'external'];

export default function PartnerCalendarEditor({
  viewMonth,
  onViewMonthChange,
  statusByDate,
  statusLabels,
  selection = null,
  onSelectionChange,
  locale = 'en',
  previousMonthLabel,
  nextMonthLabel,
  disabled = false,
  isLoading = false,
  // Sprint D-2: `{ [isoDate]: { booking, hold, block, external } }` —
  // which of the four calendar source types touch that date, for a
  // compact per-day dot row. Entirely optional/additive: omitted, the
  // grid renders exactly as it always did.
  sourceIndicatorsByDate = null,
  sourceLabels = null,
  today = null,
  weekStartsOn = 0,
}) {
  const monthLabelId = useId();
  const weeks = useMemo(
    () => chunkIntoWeeks(buildMonthGrid(viewMonth, weekStartsOn)),
    [viewMonth, weekStartsOn],
  );
  // `createDateFormatter`, not bare `Intl`: a browser without Armenian
  // ICU data would otherwise render English month and weekday names.
  const monthYearFormatter = useMemo(
    () => createDateFormatter(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );
  const dayFormatter = useMemo(
    () =>
      createDateFormatter(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale],
  );
  const weekdayLabels = useMemo(() => {
    const formatter = createDateFormatter(locale, { weekday: 'short' });
    return Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
      formatter.format(
        new Date(
          REFERENCE_SUNDAY.year,
          REFERENCE_SUNDAY.month,
          REFERENCE_SUNDAY.day + weekStartsOn + index,
        ),
      ),
    );
  }, [locale, weekStartsOn]);
  const monthLabelDate = useMemo(
    () => new Date(viewMonth.year, viewMonth.month, 1),
    [viewMonth],
  );

  function handleDayClick(day) {
    if (disabled) return;
    const iso = toISODate(day);
    if (!selection?.start || (selection.start && selection.end)) {
      onSelectionChange({ start: iso, end: null });
    } else if (iso < selection.start) {
      onSelectionChange({ start: iso, end: null });
    } else {
      onSelectionChange({ start: selection.start, end: iso });
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          aria-label={previousMonthLabel}
          disabled={disabled}
          onClick={() => onViewMonthChange(addMonths(viewMonth, -1))}
        >
          &lsaquo;
        </button>
        <span
          id={monthLabelId}
          className={styles.monthLabel}
          aria-live="polite"
        >
          {monthYearFormatter.format(monthLabelDate)}
        </span>
        <button
          type="button"
          className={styles.navButton}
          aria-label={nextMonthLabel}
          disabled={disabled}
          onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
        >
          &rsaquo;
        </button>
      </div>

      <ul className={styles.legend}>
        {Object.entries(statusLabels).map(([status, label]) => (
          <li key={status} className={styles.legendItem}>
            <span
              className={[
                styles.legendSwatch,
                styles[`legendSwatch--${status}`],
              ].join(' ')}
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
        {sourceLabels &&
          SOURCE_KEYS.filter((key) => sourceLabels[key]).map((key) => (
            <li key={key} className={styles.legendItem}>
              <span
                className={[styles.sourceDot, styles[`sourceDot--${key}`]].join(
                  ' ',
                )}
                aria-hidden="true"
              />
              {sourceLabels[key]}
            </li>
          ))}
      </ul>

      {isLoading ? (
        <Skeleton variant="rect" height={240} />
      ) : (
        <div role="grid" className={styles.grid} aria-labelledby={monthLabelId}>
          <div role="row" className={styles.weekRow}>
            {weekdayLabels.map((weekday) => (
              <span
                key={weekday}
                role="columnheader"
                className={styles.weekday}
              >
                {weekday}
              </span>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            // eslint-disable-next-line react/no-array-index-key -- weeks never reorder within a static month grid
            <div role="row" className={styles.weekRow} key={weekIndex}>
              {week.map((day, dayIndex) => {
                if (!day) {
                  // eslint-disable-next-line react/no-array-index-key -- empty leading/trailing cells have no date identity
                  return <EmptyDayCell key={dayIndex} />;
                }
                const iso = toISODate(day);
                const status = statusByDate[iso];
                const isToday = iso === today;
                const isPast = Boolean(today) && iso < today;
                const isSelected =
                  selection?.start &&
                  (iso === selection.start ||
                    (selection.end &&
                      iso >= selection.start &&
                      iso <= selection.end));
                const sources = sourceIndicatorsByDate?.[iso];
                const presentSourceKeys = sources
                  ? SOURCE_KEYS.filter((key) => sources[key])
                  : [];
                const sourceLabelText = presentSourceKeys
                  .map((key) => sourceLabels?.[key])
                  .filter(Boolean)
                  .join(', ');

                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    disabled={disabled}
                    aria-label={[
                      dayFormatter.format(day),
                      status ? (statusLabels[status] ?? status) : null,
                      sourceLabelText || null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    aria-selected={isSelected || undefined}
                    aria-current={isToday ? 'date' : undefined}
                    className={[
                      styles.day,
                      status && styles[`day--${status}`],
                      isPast && styles['day--past'],
                      isToday && styles['day--today'],
                      isSelected && styles['day--selected'],
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleDayClick(day)}
                  >
                    <span className={styles.dayCellInner}>
                      <span className={styles.dayNumber}>{day.getDate()}</span>
                      {presentSourceKeys.length > 0 && (
                        <span className={styles.sourceDots} aria-hidden="true">
                          {presentSourceKeys.map((key) => (
                            <span
                              key={key}
                              className={[
                                styles.sourceDot,
                                styles[`sourceDot--${key}`],
                              ].join(' ')}
                            />
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

PartnerCalendarEditor.propTypes = {
  viewMonth: PropTypes.shape({
    year: PropTypes.number.isRequired,
    month: PropTypes.number.isRequired,
  }).isRequired,
  onViewMonthChange: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- values are a closed available/blocked/booked vocabulary the caller maps codes onto, not a fixed shape worth naming
  statusByDate: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- keys are caller-chosen status codes, not a fixed shape
  statusLabels: PropTypes.object.isRequired,
  selection: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  onSelectionChange: PropTypes.func.isRequired,
  locale: PropTypes.string,
  previousMonthLabel: PropTypes.string.isRequired,
  nextMonthLabel: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  isLoading: PropTypes.bool,
  // eslint-disable-next-line react/forbid-prop-types -- date-keyed map of caller-chosen source-presence flags, not a fixed shape
  sourceIndicatorsByDate: PropTypes.object,
  // eslint-disable-next-line react/forbid-prop-types -- keys are the caller's own source keys (booking/hold/block/external)
  sourceLabels: PropTypes.object,
  // `YYYY-MM-DD`, resolved by the caller in the business timezone.
  today: PropTypes.string,
  // 0 = Sunday, 1 = Monday.
  weekStartsOn: PropTypes.oneOf([0, 1]),
};
