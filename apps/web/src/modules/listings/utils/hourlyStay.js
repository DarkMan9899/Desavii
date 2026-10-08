/**
 * Step L6.3B — the optional hourly hotel stay, client side. Mirrors the
 * server's `core/domain/hourlyStay.js` contract so the UI only offers what
 * the server accepts (the server stays authoritative):
 * - hourly booking is a per-room opt-in (`hourly_enabled`) on a HOTEL_ROOM;
 *   every other room is nightly-only;
 * - one business date (Armenia time), whole-hour boundaries (`HH:00`,
 *   `24:00` = end of day), within the room's window and min..max hours;
 * - price = hourly rate × hours × rooms (guests never multiply it).
 */

export const BOOKING_MODES = Object.freeze({
  NIGHTLY: 'NIGHTLY',
  HOURLY: 'HOURLY',
});

export const HOURS_PER_DAY = 24;

const HOURLY_ROOM_UNIT_TYPE = 'HOTEL_ROOM';
const WHOLE_HOUR_PATTERN = /^([01]\d|2[0-4]):00(:00)?$/;

/** `"14:00"` -> 14, `"24:00"` -> 24; `null` for anything else. */
export function parseWholeHour(time) {
  if (typeof time !== 'string' || !WHOLE_HOUR_PATTERN.test(time)) return null;
  return Number(time.slice(0, 2));
}

/** `9` -> `"09:00"`. */
export function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Whether a public unit offers hourly stays. */
export function isHourlyRoom(unit) {
  return (
    unit?.bookable_unit_type === HOURLY_ROOM_UNIT_TYPE &&
    unit?.hourly_enabled === true
  );
}

/** A room's hourly rules from its public DTO fields. */
export function toHourlyRules(unit) {
  return {
    minHours: unit.hourly_min_duration_hours,
    maxHours: unit.hourly_max_duration_hours,
    fromHour: parseWholeHour(unit.hourly_available_from),
    untilHour: parseWholeHour(unit.hourly_available_until),
  };
}

/** Start hours a stay of at least `minHours` can begin at inside the window. */
export function startHourOptions({ fromHour, untilHour, minHours }) {
  const options = [];
  for (let hour = fromHour; hour + minHours <= untilHour; hour += 1) {
    options.push(hour);
  }
  return options;
}

/** End hours valid for a stay starting at `startHour` (min..max, inside the window). */
export function endHourOptions(startHour, { untilHour, minHours, maxHours }) {
  const options = [];
  for (
    let hour = startHour + minHours;
    hour <= Math.min(untilHour, startHour + maxHours);
    hour += 1
  ) {
    options.push(hour);
  }
  return options;
}

/**
 * The fewest rooms free across every hour of `[startHour, endHour)`, from
 * the public hourly slots (`status`/`remaining_count`): 0 when any hour is
 * sold out or already started, `null` when every hour is plentiful (the
 * exact count is only published when low).
 */
export function remainingForInterval(slots, startHour, endHour) {
  const covered = (slots ?? []).filter((slot) => {
    const hour = parseWholeHour(slot.start_time);
    return hour >= startHour && hour < endHour;
  });
  if (
    covered.length !== endHour - startHour ||
    covered.some((slot) => slot.status === 'SOLD_OUT' || slot.status === 'PAST')
  ) {
    return 0;
  }
  const lowCounts = covered
    .filter((slot) => slot.status === 'LOW')
    .map((slot) => slot.remaining_count);
  return lowCounts.length > 0 ? Math.min(...lowCounts) : null;
}

export default {
  BOOKING_MODES,
  HOURS_PER_DAY,
  parseWholeHour,
  formatHour,
  isHourlyRoom,
  toHourlyRules,
  startHourOptions,
  endHourOptions,
  remainingForInterval,
};
