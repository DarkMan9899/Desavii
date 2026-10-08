/**
 * Step L6.3B — how an hourly hotel stay reads wherever a booking item (or a
 * hold item at checkout) is shown: booking type, date, start–end, duration,
 * and optionally rooms and guests — never nights or a check-out date. Every
 * value comes from the stored item itself (its own date, times and
 * quantity), never the room's current hourly settings. Returned as
 * label/value pairs so each page keeps its own markup.
 */

const HOURLY_MODE = 'HOURLY';

export function isHourlyItem(item) {
  return item?.booking_mode === HOURLY_MODE;
}

function hourOf(time) {
  return Number(String(time).slice(0, 2));
}

/**
 * @param {Function} t
 * @param {{date_from: string, start_time: string, end_time: string, quantity: number, guest_count?: number|null}} item
 * @param {{formatDate?: Function, includeRoomsAndGuests?: boolean}} [options]
 * @returns {Array<{key: string, label: string, value: string}>}
 */
export function hourlyStayRows(
  t,
  item,
  { formatDate = (date) => date, includeRoomsAndGuests = true } = {},
) {
  const start = String(item.start_time).slice(0, 5);
  const end = String(item.end_time).slice(0, 5);
  const rows = [
    {
      key: 'type',
      label: t('bookings.hourly.bookingType'),
      value: t('bookings.hourly.hourlyStay'),
    },
    {
      key: 'date',
      label: t('bookings.hourly.date'),
      value: formatDate(item.date_from),
    },
    { key: 'start', label: t('bookings.hourly.start'), value: start },
    { key: 'end', label: t('bookings.hourly.end'), value: end },
    {
      key: 'duration',
      label: t('bookings.hourly.duration'),
      value: t('bookings.hourly.hoursCount', {
        count: hourOf(item.end_time) - hourOf(item.start_time),
      }),
    },
  ];
  if (includeRoomsAndGuests) {
    rows.push({
      key: 'rooms',
      label: t('bookings.hourly.rooms'),
      value: String(item.quantity),
    });
    if (item.guest_count !== null && item.guest_count !== undefined) {
      rows.push({
        key: 'guests',
        label: t('bookings.hourly.guests'),
        value: String(item.guest_count),
      });
    }
  }
  return rows;
}

export default { isHourlyItem, hourlyStayRows };
