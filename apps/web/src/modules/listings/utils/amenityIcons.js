/**
 * amenityIcons — one icon per amenity, keyed by the amenity's stable
 * `key` (`listing_amenities.code`, migration 0056; `GET /listings/metadata`
 * returns it next to the localized label). An amenity with no key, or a key
 * this map does not know yet, falls back to its group's icon, so a new
 * catalog entry always renders sensibly.
 *
 * `POPULAR_AMENITY_KEYS` is the order a traveller scans for first
 * (Hotels.com "Popular amenities", Booking.com "most popular facilities");
 * the page shows the listing's own amenities in this order before the full
 * grouped list. Category applicability already decides which amenities a
 * listing can have, so one ordering serves every category.
 */

import { AMENITY_ICONS } from '../../../utils/listingFactIcons.js';
import resolveAmenityGroupIcon from './amenityGroupIcons.js';

export const POPULAR_AMENITY_KEYS = Object.freeze([
  'WIFI',
  'PARKING',
  'BREAKFAST_INCLUDED',
  'AIR_CONDITIONING',
  'POOL',
  'KITCHEN',
  'FRONT_DESK_24H',
  'RESTAURANT',
  'SPA',
  'AIRPORT_SHUTTLE',
  'PET_FRIENDLY',
  'WHEELCHAIR_ACCESSIBLE',
  'DEDICATED_WORKSPACE',
  'WASHING_MACHINE',
  'GARDEN',
  'TERRACE',
  'OUTDOOR_SEATING',
  'PRIVATE_DINING_ROOM',
  'KIDS_MENU',
  'GPS_NAVIGATION',
  'CHILD_SEAT',
  'WINTER_TYRES',
  'LOCKERS',
  'CAFE',
]);

export function resolveAmenityIcon(amenityKey, groupCode) {
  return AMENITY_ICONS[amenityKey] ?? resolveAmenityGroupIcon(groupCode);
}

export default resolveAmenityIcon;
