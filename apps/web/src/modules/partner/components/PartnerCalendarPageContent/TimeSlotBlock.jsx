/**
 * TimeSlotBlock — one time-sliced `bookable_unit`'s departure block for
 * one date, positioned on the Week/Day hour axis (`calendarDateGrid.js`).
 * Fetches its own per-day breakdown (`useUnitBreakdownQuery`) so Week/Day
 * views can render N sibling units (e.g. a tour's Morning + Afternoon
 * departure) as N independent blocks without a parent-level fan-out
 * query — same "small component owns its own query" convention this
 * whole module already uses (`StaffMemberCard`, Sprint 4).
 *
 * Status is derived from real breakdown fields only (`total`/`available`/
 * `manual`) — never a separate invented status field.
 */

import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { Skeleton } from '@desavii/ui/components/feedback-overlays';
import { useUnitBreakdownQuery } from '../../../availability/index.js';
import { timeToRowOffset, HOUR_ROWS } from './calendarDateGrid.js';
import { resolveBreakdownStatus } from './resolveDayStatus.js';
import styles from './TimeSlotBlock.module.scss';

const HOUR_ROW_HEIGHT_PX = 56;

export default function TimeSlotBlock({ unit, date, isSelected, onSelect }) {
  const { t } = useTranslation();
  const breakdownQuery = useUnitBreakdownQuery(unit.id, date, date);
  const day = breakdownQuery.data?.[0];
  const status = resolveBreakdownStatus(day);

  const start = unit.time_slot_start.slice(0, 5);
  const end = unit.time_slot_end.slice(0, 5);
  const top = timeToRowOffset(start) * HOUR_ROW_HEIGHT_PX;
  const height = Math.max(
    (timeToRowOffset(end) - timeToRowOffset(start)) * HOUR_ROW_HEIGHT_PX,
    HOUR_ROW_HEIGHT_PX / 2,
  );

  const statusLabel = status
    ? t(`partner.calendar.timeline.status.${status}`)
    : t('partner.calendar.timeline.status.loading');

  return (
    <button
      type="button"
      className={[
        styles.block,
        status && styles[`block--${status}`],
        isSelected && styles['block--selected'],
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ top, height }}
      onClick={() => onSelect(unit.id, date)}
      aria-label={t('partner.calendar.timeline.slotAriaLabel', {
        label: unit.unit_label ?? `${start}–${end}`,
        start,
        end,
        status: statusLabel,
      })}
    >
      {breakdownQuery.isPending ? (
        <Skeleton variant="text" width="80%" />
      ) : (
        <>
          <span className={styles.label}>
            {unit.unit_label ?? `${start}–${end}`}
          </span>
          <span className={styles.range}>
            {start}–{end}
          </span>
          {day && (
            <span className={styles.capacity}>
              {t('partner.calendar.breakdown.available', {
                count: Math.max(day.available, 0),
              })}
            </span>
          )}
        </>
      )}
    </button>
  );
}

TimeSlotBlock.propTypes = {
  unit: PropTypes.shape({
    id: PropTypes.number.isRequired,
    unit_label: PropTypes.string,
    time_slot_start: PropTypes.string.isRequired,
    time_slot_end: PropTypes.string.isRequired,
  }).isRequired,
  date: PropTypes.string.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export { HOUR_ROWS, HOUR_ROW_HEIGHT_PX };
