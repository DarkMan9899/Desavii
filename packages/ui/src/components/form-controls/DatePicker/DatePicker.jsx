/**
 * DatePicker — COMPONENT_LIBRARY.md Part II §2 "DatePicker".
 *
 * Generic single/range date-selection primitive. The booking-specific,
 * availability-aware calendar (Part 7's BookingCalendar) is a separate,
 * later composition around this primitive plus live availability data —
 * this component knows nothing about bookings.
 *
 * Follows Select.jsx's trigger/popover shape (role="button" trigger +
 * Label/aria-labelledby pairing, click-outside close) since no shared
 * Popover primitive exists yet. The panel's day grid uses the WAI-ARIA
 * grid pattern (role="grid"/"row"/"gridcell") with roving tabIndex, per
 * COMPONENT_LIBRARY.md's "full keyboard grid navigation" requirement.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import Label from '../Label/Label.jsx';
import styles from './DatePicker.module.scss';

const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 8;

// Remediation: the panel used to be a plain `position: absolute` sibling
// of the trigger, so any ancestor with `overflow: hidden` between it and
// the viewport (the reservation widget's own decorative gold-sheen
// accent clips exactly this way - see ListingReservationWidget.module
// .scss) silently clipped or hid the calendar. Portaling to
// `document.body` and computing `position: fixed` coordinates from the
// trigger's own `getBoundingClientRect()` removes it from every
// ancestor's box entirely; flipping above the trigger (or right-
// aligning) when the panel would overflow the viewport is real collision
// detection, not a fixed direction that could push it off-screen.
function computePanelPosition(triggerEl, panelEl) {
  const triggerRect = triggerEl.getBoundingClientRect();
  const panelRect = panelEl.getBoundingClientRect();

  const overflowsBottom =
    triggerRect.bottom + PANEL_GAP + panelRect.height >
    window.innerHeight - VIEWPORT_MARGIN;
  const fitsAbove = triggerRect.top - PANEL_GAP - panelRect.height >= 0;
  const openUpward = overflowsBottom && fitsAbove;

  const top = openUpward
    ? triggerRect.top - PANEL_GAP - panelRect.height
    : triggerRect.bottom + PANEL_GAP;

  const overflowsRight =
    triggerRect.left + panelRect.width > window.innerWidth - VIEWPORT_MARGIN;
  const left = overflowsRight
    ? Math.max(VIEWPORT_MARGIN, triggerRect.right - panelRect.width)
    : triggerRect.left;

  return { top, left };
}

const MODES = ['single', 'range'];
const SIZES = ['sm', 'md', 'lg'];

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// `onChange` emits this, not a `Date` — every real consumer
// (`ListingReservationWidget`, `AvailabilityStep`) sends `value.start`/
// `value.end` straight through as `dateFrom`/`dateTo` in a JSON API
// payload with no conversion of their own; a `Date` there serializes to
// a full ISO *datetime* (`JSON.stringify` calls `toISOString()`), which
// fails the backend's plain `YYYY-MM-DD` validation. Symmetric with
// `value` already accepting a string via `toDate()` above.
function toISODateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameDay(a, b) {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDateDisabled(date, { minDate, maxDate, disabledDates }) {
  const day = startOfDay(date);
  const min = toDate(minDate);
  const max = toDate(maxDate);
  if (min && day < startOfDay(min)) return true;
  if (max && day > startOfDay(max)) return true;
  return disabledDates.some((disabledDate) =>
    isSameDay(day, toDate(disabledDate)),
  );
}

function buildMonthGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
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

export default function DatePicker({
  value = null,
  onChange,
  mode = 'single',
  minDate = undefined,
  maxDate = undefined,
  disabledDates = [],
  label = undefined,
  ariaLabel = undefined,
  error = undefined,
  required = false,
  disabled = false,
  size = 'md',
  locale = 'en',
  placeholder = 'Select date',
  previousMonthLabel = 'Previous month',
  nextMonthLabel = 'Next month',
  id = undefined,
}) {
  // `toDate()` on a plain `YYYY-MM-DD` string (what every real caller's
  // `value.start`/`value.end` actually is) parses it as UTC midnight —
  // per the ECMAScript date-string grammar, only date-only strings do
  // this, unlike a full datetime string. `day` in `commitDay` below
  // comes from `buildMonthGrid`'s `new Date(year, month, date)`, which is
  // always LOCAL midnight. In any timezone ahead of UTC (including
  // Armenia, this app's own market), local midnight of a given date is
  // an earlier timestamp than that same date's UTC midnight, so
  // `day < rangeStart` was true even when `day` and `rangeStart` were
  // the SAME calendar day — clicking one day twice to commit a same-day
  // range (e.g. a one-day car rental or tour) silently reset the
  // selection back to `{start, end: null}` instead of completing it, and
  // the panel never closed. `startOfDay()` normalizes both sides of
  // every comparison in this file to local midnight, matching
  // `isDateDisabled`'s own identical normalization of `minDate`/`maxDate`
  // just below.
  const single =
    mode === 'single' && toDate(value) ? startOfDay(toDate(value)) : null;
  const rangeStart =
    mode === 'range' && toDate(value && value.start)
      ? startOfDay(toDate(value.start))
      : null;
  const rangeEnd =
    mode === 'range' && toDate(value && value.end)
      ? startOfDay(toDate(value.end))
      : null;

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(single || rangeStart || new Date()),
  );
  const [hoverDate, setHoverDate] = useState(null);
  const [focusedDate, setFocusedDate] = useState(
    () => single || rangeStart || startOfDay(new Date()),
  );
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPosition, setPanelPosition] = useState(null);
  const generatedId = useId();
  const fieldId = id || generatedId;
  const labelId = `${fieldId}-label`;
  const errorId = `${fieldId}-error`;

  const constraints = useMemo(
    () => ({ minDate, maxDate, disabledDates }),
    [minDate, maxDate, disabledDates],
  );

  const weeks = useMemo(
    () => chunkIntoWeeks(buildMonthGrid(viewMonth)),
    [viewMonth],
  );

  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    [locale],
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
  const displayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale],
  );

  const weekdayLabels = useMemo(() => {
    // A fixed reference week (Sun 4 Jan 1970) so this only ever depends
    // on `locale`, not on which day "today" happens to be.
    return Array.from({ length: 7 }, (_, index) =>
      weekdayFormatter.format(new Date(1970, 0, 4 + index)),
    );
  }, [weekdayFormatter]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      // The panel is portaled to document.body (see the positioning
      // effect below), so it's no longer a real DOM descendant of
      // containerRef even though it's still a React-tree child -
      // panelRef must be checked separately, or every click inside the
      // calendar would register as "outside" and close it immediately.
      const insideTrigger = containerRef.current?.contains(event.target);
      const insidePanel = panelRef.current?.contains(event.target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return undefined;

    function updatePosition() {
      if (!triggerRef.current || !panelRef.current) return;
      setPanelPosition(
        computePanelPosition(triggerRef.current, panelRef.current),
      );
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
    // panelPosition itself isn't a dependency - this effect computes it,
    // depending on it would be an infinite loop; `weeks`/`open` cover
    // the cases where the panel's own size can change (month navigation
    // changes the grid's row count) and need a fresh measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weeks]);

  function openPanel() {
    if (disabled) return;
    setViewMonth(
      startOfMonth(single || rangeStart || focusedDate || new Date()),
    );
    setFocusedDate(single || rangeStart || startOfDay(new Date()));
    setOpen(true);
  }

  function closePanel({ refocusTrigger = true } = {}) {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  }

  function formatDisplayValue() {
    if (mode === 'range') {
      if (!rangeStart && !rangeEnd) return placeholder;
      if (rangeStart && !rangeEnd)
        return `${displayFormatter.format(rangeStart)} – …`;
      return `${displayFormatter.format(rangeStart)} – ${displayFormatter.format(rangeEnd)}`;
    }
    return single ? displayFormatter.format(single) : placeholder;
  }

  function commitDay(day) {
    if (disabled || isDateDisabled(day, constraints)) return;
    const iso = toISODateString(day);
    if (mode === 'single') {
      onChange(iso);
      closePanel();
      return;
    }
    if (!rangeStart || rangeEnd) {
      onChange({ start: iso, end: null });
    } else if (day < rangeStart) {
      onChange({ start: iso, end: null });
    } else {
      onChange({ start: toISODateString(rangeStart), end: iso });
      closePanel();
    }
  }

  function moveFocus(days) {
    setFocusedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + days);
      if (
        next.getMonth() !== viewMonth.getMonth() ||
        next.getFullYear() !== viewMonth.getFullYear()
      ) {
        setViewMonth(startOfMonth(next));
      }
      return next;
    });
  }

  function handleGridKeyDown(event) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-7);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(7);
        break;
      case 'PageUp':
        event.preventDefault();
        setViewMonth((current) => addMonths(current, -1));
        setFocusedDate((current) => addMonths(current, -1));
        break;
      case 'PageDown':
        event.preventDefault();
        setViewMonth((current) => addMonths(current, 1));
        setFocusedDate((current) => addMonths(current, 1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commitDay(focusedDate);
        break;
      case 'Escape':
        event.preventDefault();
        closePanel();
        break;
      default:
        break;
    }
  }

  const today = startOfDay(new Date());

  return (
    <div className={styles.field} ref={containerRef}>
      {label && (
        <Label
          htmlFor={fieldId}
          id={labelId}
          required={required}
          disabled={disabled}
        >
          {label}
        </Label>
      )}
      <div className={styles.wrapper}>
        <button
          type="button"
          id={fieldId}
          ref={triggerRef}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={error ? errorId : undefined}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          className={[
            styles.trigger,
            styles[`trigger--${size}`],
            error && styles['trigger--error'],
            disabled && styles['trigger--disabled'],
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() =>
            open ? closePanel({ refocusTrigger: false }) : openPanel()
          }
        >
          <span
            className={single || rangeStart ? styles.value : styles.placeholder}
          >
            {formatDisplayValue()}
          </span>
        </button>

        {open &&
          createPortal(
            <div
              ref={panelRef}
              className={styles.panel}
              role="dialog"
              aria-modal="false"
              aria-labelledby={labelId}
              style={
                panelPosition
                  ? {
                      position: 'fixed',
                      top: panelPosition.top,
                      left: panelPosition.left,
                      visibility: 'visible',
                    }
                  : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
              }
            >
              <div className={styles.header}>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-label={previousMonthLabel}
                  onClick={() =>
                    setViewMonth((current) => addMonths(current, -1))
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M10 3 6 8l4 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <span className={styles.monthLabel} aria-live="polite">
                  {monthYearFormatter.format(viewMonth)}
                </span>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-label={nextMonthLabel}
                  onClick={() =>
                    setViewMonth((current) => addMonths(current, 1))
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M6 3l4 5-4 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div
                role="grid"
                // Not itself a tab stop — focus lives on the roving-tabIndex
                // gridcell buttons below; -1 only satisfies
                // jsx-a11y/interactive-supports-focus for the composite
                // `role="grid"` container itself.
                tabIndex={-1}
                className={styles.grid}
                aria-labelledby={labelId}
                onKeyDown={handleGridKeyDown}
              >
                <div role="row" className={styles.weekdayRow}>
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
                      const isSelectedSingle =
                        mode === 'single' && isSameDay(day, single);
                      const isRangeStart =
                        mode === 'range' && isSameDay(day, rangeStart);
                      const isRangeEnd =
                        mode === 'range' && isSameDay(day, rangeEnd);
                      const previewEnd = rangeEnd || hoverDate;
                      const isInRange =
                        mode === 'range' &&
                        rangeStart &&
                        previewEnd &&
                        day > rangeStart &&
                        day < previewEnd;
                      const disabledDay = isDateDisabled(day, constraints);
                      const isToday = isSameDay(day, today);
                      const isFocused = isSameDay(day, focusedDate);

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          role="gridcell"
                          tabIndex={isFocused ? 0 : -1}
                          ref={(node) => {
                            if (node && isFocused && open) node.focus();
                          }}
                          disabled={disabledDay}
                          aria-selected={
                            isSelectedSingle ||
                            isRangeStart ||
                            isRangeEnd ||
                            undefined
                          }
                          aria-label={dayFormatter.format(day)}
                          aria-current={isToday ? 'date' : undefined}
                          className={[
                            styles.day,
                            isToday && styles['day--today'],
                            (isSelectedSingle || isRangeStart || isRangeEnd) &&
                              styles['day--selected'],
                            isInRange && styles['day--in-range'],
                            disabledDay && styles['day--disabled'],
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onMouseEnter={() => setHoverDate(day)}
                          onFocus={() => setFocusedDate(day)}
                          onClick={() => commitDay(day)}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )}
      </div>
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

DatePicker.propTypes = {
  value: PropTypes.oneOfType([
    PropTypes.instanceOf(Date),
    PropTypes.string,
    PropTypes.shape({
      start: PropTypes.oneOfType([
        PropTypes.instanceOf(Date),
        PropTypes.string,
      ]),
      end: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
    }),
  ]),
  onChange: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(MODES),
  minDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  maxDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  disabledDates: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]),
  ),
  label: PropTypes.string,
  ariaLabel: PropTypes.string,
  error: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(SIZES),
  locale: PropTypes.string,
  placeholder: PropTypes.string,
  previousMonthLabel: PropTypes.string,
  nextMonthLabel: PropTypes.string,
  id: PropTypes.string,
};

export { MODES as DATE_PICKER_MODES, SIZES as DATE_PICKER_SIZES };
