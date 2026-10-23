/**
 * Map presentation constants shared by every public map (Search Map and
 * Listing Detail), so both draw the same tiles and the same private-stay
 * area.
 */

export const OSM_TILE_URL =
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * The radius drawn around an approximate (private-stay) point: half the
 * diagonal of the API's 0.01° grid cell at Armenia's latitude, so the
 * circle covers the whole cell the real point can be in.
 */
export const APPROXIMATE_RADIUS_METERS = 700;
