/**
 * PartnerCalendarDayView — Partner Workspace Sprint 5, P0. One day,
 * adapted per the SELECTED unit's own real scheduling shape:
 *
 * - Time-sliced unit (`time_slot_start` populated — a tour/activity
 *   departure) -> a real hour-axis timeline (06:00-23:00,
 *   `calendarDateGrid.js`), one `TimeSlotBlock` per sibling time-sliced
 *   unit on this listing (so a tour's Morning + Afternoon departure both
 *   show, not just whichever one happens to be toggled in the resource
 *   picker above).
 * - Date-only unit (hotel room, property, vehicle, a full-day guide —
 *   `time_slot_start` is NULL) -> a plain single-day summary card, the
 *   same breakdown numbers the Month view's selection panel already
 *   shows, never a fake hourly grid. This is the P0 requirement's own
 *   explicit anti-goal ("do not make Month view artificially hourly")
 *   applied symmetrically to Day view.
 *
 * Clicking a slot/the summary card sets `unitId` + `selection` on the
 * parent exactly like clicking a Month-grid day already does — the
 * existing action-tabs panel (set availability / quick block / external
 * reservation) below is reused unmodified for either shape.
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Badge } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { EmptyState, Skeleton } from '@desavii/ui/components/feedback-overlays';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUnitBreakdownQuery } from '../../../availability/index.js';
import { BookingStatusBadge } from '../../../bookings/index.js';
import { addDays, todayIso, HOUR_ROWS } from './calendarDateGrid.js';
import { SOURCE_TYPES, getDaySources } from './calendarSourceIndex.js';
import TimeSlotBlock, { HOUR_ROW_HEIGHT_PX } from './TimeSlotBlock.jsx';
import styles from './PartnerCalendarDayView.module.scss';

/**
 * Sprint D-2 (Partner Calendar source-aware UX, §11-12) — one row per
 * individual event touching this date, for a date-only unit
 * (`isTimeSliced` units keep their existing per-slot `TimeSlotBlock`
 * breakdown treatment; this list is never rendered there). Each source
 * type gets exactly the fields that type's backend row actually carries —
 * never an invented detail. A Desavii booking drills through to the
 * EXISTING `/partner/bookings/:id` detail page (`onNavigateToBooking`),
 * never a second booking-details UI.
 */
function SourceEventCard({
  event,
  t,
  locale,
  onNavigateToBooking,
  onCancelExternal = undefined,
  cancelExternalPending = false,
  connectionsById = null,
}) {
  if (event.sourceType === SOURCE_TYPES.BOOKING) {
    return (
      <button
        type="button"
        className={[styles.eventCard, styles['eventCard--booking']].join(' ')}
        onClick={() => onNavigateToBooking(event.id)}
      >
        <Inline gap="2" align="center" justify="space-between">
          <span className={styles.eventLabel}>
            {t('partner.calendar.sources.booking')}
            {event.customerDisplayName ? ` · ${event.customerDisplayName}` : ''}
          </span>
          <BookingStatusBadge status={event.status} audience="partner" />
        </Inline>
        {event.bookingReference && (
          <span className={styles.eventMeta}>{event.bookingReference}</span>
        )}
      </button>
    );
  }

  if (event.sourceType === SOURCE_TYPES.HOLD) {
    return (
      <div className={[styles.eventCard, styles['eventCard--hold']].join(' ')}>
        <Inline gap="2" align="center" justify="space-between">
          <span className={styles.eventLabel}>
            {t('partner.calendar.sources.hold')}
          </span>
          <Badge
            size="sm"
            variant="warning"
            label={t('partner.calendar.day.activeHoldBadge')}
          />
        </Inline>
        {event.expiresAt && (
          <span className={styles.eventMeta}>
            {t('partner.calendar.day.holdExpires', {
              time: new Date(event.expiresAt).toLocaleString(locale),
            })}
          </span>
        )}
      </div>
    );
  }

  if (event.sourceType === SOURCE_TYPES.BLOCK) {
    return (
      <div className={[styles.eventCard, styles['eventCard--block']].join(' ')}>
        <Inline gap="2" align="center" justify="space-between">
          <span className={styles.eventLabel}>
            {t('partner.calendar.sources.block')}
          </span>
          <Badge
            size="sm"
            variant="neutral"
            label={t(`partner.calendar.blocks.reasonCodes.${event.reasonCode}`)}
          />
        </Inline>
        <span className={styles.eventMeta}>
          {t('partner.calendar.breakdown.manual', { count: event.quantity })}
        </span>
        {event.notes && <span className={styles.eventMeta}>{event.notes}</span>}
      </div>
    );
  }

  // EXTERNAL — never rendered as a native Desavii booking (§12): a
  // dedicated read-only badge and the mirror-warning caption are always
  // shown, not only at cancel-time.
  const connection = event.connectionId
    ? connectionsById?.[event.connectionId]
    : null;
  return (
    <div
      className={[styles.eventCard, styles['eventCard--external']].join(' ')}
    >
      <Inline gap="2" align="center" justify="space-between">
        <span className={styles.eventLabel}>
          {t(`partner.calendar.external.sourceCodes.${event.sourceCode}`)}
          {event.guestName ? ` · ${event.guestName}` : ''}
        </span>
        <Badge
          size="sm"
          variant="neutral"
          label={t('partner.calendar.day.readOnlyBadge')}
        />
      </Inline>
      {connection && (
        <span className={styles.eventMeta}>
          {t('partner.calendar.day.viaConnection', { name: connection.name })}
        </span>
      )}
      {event.externalReference && (
        <span className={styles.eventMeta}>{event.externalReference}</span>
      )}
      <span className={styles.eventWarning}>
        {t('partner.calendar.external.mirrorWarning')}
      </span>
      {onCancelExternal && (
        <Inline justify="flex-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancelExternal(event.id)}
            loading={cancelExternalPending}
          >
            {t('partner.calendar.external.cancelAction')}
          </Button>
        </Inline>
      )}
    </div>
  );
}

SourceEventCard.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- normalized event shape varies per sourceType (see calendarSourceIndex.js)
  event: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  locale: PropTypes.string.isRequired,
  onNavigateToBooking: PropTypes.func.isRequired,
  onCancelExternal: PropTypes.func,
  cancelExternalPending: PropTypes.bool,
  // eslint-disable-next-line react/forbid-prop-types -- keyed by connection id, real GET /inventory-connections row shape
  connectionsById: PropTypes.object,
};

function DaySourceEventList({
  events,
  t,
  locale,
  onNavigateToBooking,
  onCancelExternal = undefined,
  cancelExternalPending = false,
  connectionsById = null,
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title={t('partner.calendar.day.noEvents')}
        description={t('partner.calendar.day.noEventsDescription')}
      />
    );
  }
  return (
    <Stack gap="2">
      {events.map((event) => (
        <SourceEventCard
          key={`${event.sourceType}-${event.id}`}
          event={event}
          t={t}
          locale={locale}
          onNavigateToBooking={onNavigateToBooking}
          onCancelExternal={onCancelExternal}
          cancelExternalPending={cancelExternalPending}
          connectionsById={connectionsById}
        />
      ))}
    </Stack>
  );
}

DaySourceEventList.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- array of normalized events, see SourceEventCard
  events: PropTypes.arrayOf(PropTypes.object).isRequired,
  t: PropTypes.func.isRequired,
  locale: PropTypes.string.isRequired,
  onNavigateToBooking: PropTypes.func.isRequired,
  onCancelExternal: PropTypes.func,
  cancelExternalPending: PropTypes.bool,
  // eslint-disable-next-line react/forbid-prop-types -- keyed by connection id
  connectionsById: PropTypes.object,
};

function DateOnlySummary({ unit, date, isSelected, onSelect }) {
  const { t } = useTranslation();
  const breakdownQuery = useUnitBreakdownQuery(unit.id, date, date);
  const day = breakdownQuery.data?.[0];

  if (breakdownQuery.isPending) {
    return <Skeleton variant="rect" height={96} />;
  }

  return (
    <button
      type="button"
      className={[
        styles.summaryCard,
        isSelected && styles['summaryCard--selected'],
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(unit.id, date)}
    >
      {day ? (
        <span className={styles.summaryStats}>
          {t('partner.calendar.breakdown.total', { count: day.total })} ·{' '}
          {t('partner.calendar.breakdown.available', { count: day.available })}
        </span>
      ) : (
        <span className={styles.summaryStats}>
          {t('partner.calendar.day.noData')}
        </span>
      )}
    </button>
  );
}

DateOnlySummary.propTypes = {
  unit: PropTypes.shape({ id: PropTypes.number.isRequired }).isRequired,
  date: PropTypes.string.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default function PartnerCalendarDayView({
  date,
  onDateChange,
  units,
  effectiveUnit = undefined,
  isTimeSliced,
  selection = null,
  onSelectSlot,
  locale,
  daySourceIndex = null,
  connectionsById = null,
  onNavigateToBooking = undefined,
  onCancelExternal = undefined,
  cancelExternalPending = false,
}) {
  const { t } = useTranslation();
  const timeSlicedUnits = useMemo(
    () => units.filter((u) => u.time_slot_start),
    [units],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [locale],
  );

  return (
    <div className={styles.dayView}>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navButton}
          aria-label={t('partner.calendar.day.previousDay')}
          onClick={() => onDateChange(addDays(date, -1))}
        >
          <Icon icon={ChevronLeft} size="sm" />
        </button>
        <span className={styles.dateLabel}>
          {dateFormatter.format(new Date(`${date}T00:00:00Z`))}
        </span>
        <button
          type="button"
          className={styles.navButton}
          aria-label={t('partner.calendar.day.nextDay')}
          onClick={() => onDateChange(addDays(date, 1))}
        >
          <Icon icon={ChevronRight} size="sm" />
        </button>
        {date !== todayIso() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDateChange(todayIso())}
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
                  selection?.start === date && effectiveUnit?.id === unit.id
                }
                onSelect={onSelectSlot}
              />
            ))}
          </div>
        </div>
      )}

      {!isTimeSliced && effectiveUnit && (
        <Stack gap="3">
          <DateOnlySummary
            unit={effectiveUnit}
            date={date}
            isSelected={selection?.start === date}
            onSelect={onSelectSlot}
          />
          {daySourceIndex && onNavigateToBooking && (
            <DaySourceEventList
              events={getDaySources(daySourceIndex, date)}
              t={t}
              locale={locale}
              onNavigateToBooking={onNavigateToBooking}
              onCancelExternal={onCancelExternal}
              cancelExternalPending={cancelExternalPending}
              connectionsById={connectionsById}
            />
          )}
        </Stack>
      )}
    </div>
  );
}

PartnerCalendarDayView.propTypes = {
  date: PropTypes.string.isRequired,
  onDateChange: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- real GET /availability/units row shape
  units: PropTypes.arrayOf(PropTypes.object).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- same
  effectiveUnit: PropTypes.object,
  isTimeSliced: PropTypes.bool.isRequired,
  selection: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  onSelectSlot: PropTypes.func.isRequired,
  locale: PropTypes.string.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- a Map, not a plain-object shape
  daySourceIndex: PropTypes.instanceOf(Map),
  // eslint-disable-next-line react/forbid-prop-types -- keyed by connection id, real GET /inventory-connections row shape
  connectionsById: PropTypes.object,
  onNavigateToBooking: PropTypes.func,
  onCancelExternal: PropTypes.func,
  cancelExternalPending: PropTypes.bool,
};
