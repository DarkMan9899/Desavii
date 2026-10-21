/**
 * Map Search domain rules — the `bbox` ("Search this area") constraint and
 * the map result universe. Pure, shared by the request validator and the
 * service so the two can never disagree about what a valid area is.
 *
 * `bbox` is `west,south,east,north` in decimal degrees — the GeoJSON / map
 * library order (`[westLng, southLat, eastLng, northLat]`). It is one more
 * canonical Search filter: List and Map both apply it, so the cards and the
 * markers always describe the same listings.
 *
 * An area must not cross the antimeridian (`west < east`): the marketplace
 * is Armenia, so a box that wraps around the date line is malformed input,
 * not a real search.
 */

export const BBOX_PARAM = 'bbox';

/** ~1 m at the equator: finer precision only makes URLs noisier. */
export const BBOX_DECIMALS = 5;

/**
 * The most markers one map response carries. The matching universe is
 * counted in full (`meta.total`), so a capped response says so
 * (`meta.truncated`) instead of silently dropping listings.
 */
export const MAP_RESULT_LIMIT = 500;

/**
 * Public map location policy. Public venues (hotels, restaurants,
 * attractions, entertainment venues, tour meeting points) are shown where
 * they are. Private stays — someone's apartment, villa or guest house —
 * are shown only approximately (a listing linked to any of these
 * categories, also when it is listed under another one too): at the
 * centre of the fixed grid cell their
 * stored point falls in. A fixed grid, not a random offset, so a listing
 * never jumps between reloads and repeated requests can never average out
 * to the real point; ~1.1 km × 0.85 km in Armenia, a neighbourhood, never
 * a building. The stored coordinates (booking/location truth) are never
 * changed — this is presentation, applied in SQL before any area filter,
 * so a "Search this area" probe can't locate the real point either.
 */
export const APPROXIMATE_LOCATION_CATEGORY_SLUGS = Object.freeze([
  'apartments',
  'villas',
  'guest-houses',
]);
export const APPROXIMATE_GRID_DEGREES = 0.01;
export const LOCATION_PRECISION = Object.freeze({
  EXACT: 'exact',
  APPROXIMATE: 'approximate',
});

const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;
const NUMBER_PATTERN = /^-?\d{1,3}(\.\d+)?$/;

/**
 * @param {unknown} raw - the `bbox` query value
 * @returns {{ west: number, south: number, east: number, north: number } | null}
 *   null for anything that is not one well-formed, non-empty area
 */
export function parseBoundingBox(raw) {
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

/** The canonical string for an area (fixed precision, fixed order). */
export function formatBoundingBox({ west, south, east, north }) {
  return [west, south, east, north]
    .map((value) => value.toFixed(BBOX_DECIMALS))
    .join(',');
}

export default parseBoundingBox;
