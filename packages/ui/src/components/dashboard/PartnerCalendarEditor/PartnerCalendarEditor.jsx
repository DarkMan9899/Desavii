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
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import Skeleton from '../../feedback-overlays/Skeleton/Skeleton.jsx';
import styles from './PartnerCalendarEditor.module.scss';

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

function buildMonthGrid({ year, month }) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1)
    cells.push(new Date(year, month, day));
  return cells;
}

function EmptyDayCell() {
  return <span role="presentation" className={styles.emptyCell} />;
}

function chunkIntoWeeks(cells) {
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek && lastWeek.length < 7) lastWeek.push(null);
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
}) {
  const weeks = useMemo(
    () => chunkIntoWeeks(buildMonthGrid(viewMonth)),
    [viewMonth],
  );
  const monthYearFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale],
  );
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
        <span className={styles.monthLabel}>
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
      </ul>

      {isLoading ? (
        <Skeleton variant="rect" height={240} />
      ) : (
        <div role="grid" className={styles.grid}>
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
                    className={[
                      styles.day,
                      status && styles[`day--${status}`],
                      isSelected && styles['day--selected'],
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleDayClick(day)}
                  >
                    <span className={styles.dayCellInner}>
                      {day.getDate()}
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
};
