/**
 * The committed map area ("Search this area") as URL state: `bbox` is
 * `west,south,east,north` in degrees — the order the API (`searchMap.js`'s
 * `parseBoundingBox`) and the clustering library both use. Mirrors the
 * API's rules so a hand-edited or stale link is dropped here instead of
 * being sent just to be rejected; always written at a fixed precision, so
 * the same area is always the same URL (reload, Back and copied links
 * reproduce it exactly).
 */

/** ~1 m at the equator, the API's own precision. */
export const MAP_AREA_DECIMALS = 5;

const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;
const NUMBER_PATTERN = /^-?\d{1,3}(\.\d+)?$/;

/**
 * @param {string|null|undefined} raw
 * @returns {{ west: number, south: number, east: number, north: number } | null}
 */
export function parseMapArea(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',');
  if (parts.length !== 4 || !parts.every((part) => NUMBER_PATTERN.test(part))) {
    return null;
  }
  const [west, south, east, north] = parts.map(Number);
  const inRange =
    Math.abs(west) <= LONGITUDE_LIMIT &&
    Math.abs(east) <= LONGITUDE_LIMIT &&
    Math.abs(south) <= LATITUDE_LIMIT &&
    Math.abs(north) <= LATITUDE_LIMIT;
  if (!inRange || south >= north || west >= east) return null;
  return { west, south, east, north };
}

/** The canonical `bbox` string for an area. */
export function formatMapArea({ west, south, east, north }) {
  return [west, south, east, north]
    .map((value) => value.toFixed(MAP_AREA_DECIMALS))
    .join(',');
}

/** A raw `bbox` value in its canonical form, or undefined when invalid. */
export function canonicalMapArea(raw) {
  const area = parseMapArea(raw);
  return area ? formatMapArea(area) : undefined;
}

/**
 * The visible part of a map as an area — clamped to the valid range, so
 * a map zoomed out past the world's edges still commits a valid area.
 * `bounds` is anything with Leaflet's `getWest/getSouth/getEast/getNorth`.
 */
export function mapAreaFromBounds(bounds) {
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  return formatMapArea({
    west: clamp(bounds.getWest(), LONGITUDE_LIMIT),
    south: clamp(bounds.getSouth(), LATITUDE_LIMIT),
    east: clamp(bounds.getEast(), LONGITUDE_LIMIT),
    north: clamp(bounds.getNorth(), LATITUDE_LIMIT),
  });
}
