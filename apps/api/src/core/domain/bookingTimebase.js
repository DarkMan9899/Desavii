/**
 * Step L6.2E — the booking timebase: the platform's business timezone, when
 * a customer booking starts, and the base "that start is already past" rule
 * every customer hold obeys regardless of a Partner's own booking rules.
 *
 * Business timezone: every listing is in Armenia today (one country, no
 * per-listing/location timezone column), so booking dates and times are
 * Asia/Yerevan wall-clock values. Before any listing outside Armenia is
 * supported, the listing/location timezone must be modelled explicitly and
 * passed in here instead of this constant.
 *
 * "Now" is never read here: callers pass the DB-sourced UTC instant
 * (`UTC_TIMESTAMP(3)`, read once per reservation — see
 * `MySqlReservationHoldRepository#readHoldClock`), so a result never depends
 * on the Node process's own timezone or clock. The conversion to Asia/Yerevan
 * uses the IANA zone through `Intl`, never a hand-written offset.
 *
 * Dates and times are compared as wall-clock strings (`YYYY-MM-DDTHH:MM:SS`),
 * the same "never reinterpret a wall-clock string as an absolute instant"
 * convention `rentalIntervalValidation.js` uses.
 */

export const BUSINESS_TIMEZONE = 'Asia/Yerevan';

const TOUR_DEPARTURE_UNIT_TYPE = 'TOUR_DEPARTURE';

const BUSINESS_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * @param {Date} instant - an absolute instant
 * @returns {{date: string, time: string}} its Asia/Yerevan calendar date
 *   (`YYYY-MM-DD`) and wall-clock time (`HH:MM:SS`)
 */
export function toBusinessDateTime(instant) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new TypeError('toBusinessDateTime requires a valid Date.');
  }
  const parts = Object.fromEntries(
    BUSINESS_PARTS_FORMATTER.formatToParts(instant).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function toSeconds(time) {
  return time.length === 5 ? `${time}:00` : time.slice(0, 8);
}

/**
 * When a customer booking starts. A VEHICLE rental starts at its pickup time
 * and a RESTAURANT_TABLE reservation at its reservation time (both taken from
 * the request — `usesRequestedTime`); a TOUR_DEPARTURE with a fixed departure
 * starts at the unit's own `time_slot_start`. Everything else — lodging,
 * untimed departures/sessions — is date-only: no machine-readable check-in
 * time exists (the `check_in_time` policy is free text), so none is invented.
 *
 * @returns {{date: string, time: string|null}}
 */
export function resolveBookingStart({
  unitTypeCode,
  dateFrom,
  usesRequestedTime,
  requestedStartTime = null,
  unitTimeSlotStart = null,
}) {
  if (usesRequestedTime) {
    return { date: dateFrom, time: requestedStartTime ?? null };
  }
  if (unitTypeCode === TOUR_DEPARTURE_UNIT_TYPE && unitTimeSlotStart) {
    return { date: dateFrom, time: unitTimeSlotStart };
  }
  return { date: dateFrom, time: null };
}

/**
 * The base past-start rule. A timed start is past once its Asia/Yerevan
 * wall-clock moment is before `now`; a date-only start is past only once its
 * whole calendar day is before today's Asia/Yerevan date — today stays
 * bookable all day.
 *
 * @param {{date: string, time: string|null}} start
 * @param {Date} now - DB-sourced current instant
 */
export function isBookingStartInPast(start, now) {
  const business = toBusinessDateTime(now);
  if (!start.time) return start.date < business.date;
  return (
    `${start.date}T${toSeconds(start.time)}` <
    `${business.date}T${business.time}`
  );
}

export default {
  BUSINESS_TIMEZONE,
  toBusinessDateTime,
  resolveBookingStart,
  isBookingStartInPast,
};
