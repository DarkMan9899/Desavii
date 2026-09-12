/**
 * Opening Hours response DTO (Pass 6, Restaurant vertical) — snake_case
 * wire fields, same shape convention as `restaurantMenuDto.js`.
 */

export function toOpeningHoursDayResponse(day) {
  return {
    day_of_week: day.dayOfWeek,
    opens_at: day.opensAt,
    closes_at: day.closesAt,
    is_closed: day.isClosed,
  };
}

export default { toOpeningHoursDayResponse };
