/**
 * Map Search constants shared by the map container, the lazy map and the
 * page layout.
 */

/** Mirrors `$breakpoint-laptop`: from here the List and the Map sit side by side. */
export const SPLIT_LAYOUT_MEDIA_QUERY = '(min-width: 1024px)';

/** Armenia's geographic centre, the view before any result is placed. */
export const DEFAULT_MAP_CENTER = [40.07, 45.04];
export const DEFAULT_MAP_ZOOM = 7;

/** Clusters stop forming here; listings still stacked are listed instead. */
export const CLUSTER_MAX_ZOOM = 16;
/** Cluster radius in screen pixels: wide enough for a price pill. */
export const CLUSTER_RADIUS_PX = 64;

/** Padding kept around results when the map fits them, in pixels. */
export const FIT_PADDING_PX = 48;

// Shared with Listing Detail's map (`utils/mapPresentation.js`).
export {
  APPROXIMATE_RADIUS_METERS,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
} from '../../../../utils/mapPresentation.js';
