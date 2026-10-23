/**
 * resolveAmenityFeatureGroups — matches a set of numeric amenity ids
 * against `metadata.amenity_groups` (`GET /listings/metadata`, the same
 * catalog `AmenitiesStep`/`RoomAmenitiesEditor` already author against)
 * into `FeatureGrid`'s `{title, items: [{label, icon}]}` shape. Shared by
 * the listing-level Amenities section and the room cards/detail, so every
 * surface resolves ids, labels and icons the same way.
 *
 * Each amenity carries its own icon (`amenityIcons.js`, keyed by the
 * amenity's stable `key`), falling back to its group's icon.
 */

import { resolveAmenityIcon, POPULAR_AMENITY_KEYS } from './amenityIcons.js';

function toFeatureItem(amenity, groupCode) {
  return {
    key: amenity.key ?? null,
    label: amenity.code,
    icon: resolveAmenityIcon(amenity.key, groupCode),
  };
}

export function resolveAmenityFeatureGroups(amenityGroups, amenityIds, t) {
  const idSet = new Set(amenityIds ?? []);
  return (amenityGroups ?? [])
    .map((group) => ({
      title: t(`partner.listingWizard.amenityGroups.${group.code}`, {
        defaultValue: group.code,
      }),
      items: group.amenities
        .filter((amenity) => idSet.has(amenity.value))
        .map((amenity) => toFeatureItem(amenity, group.code)),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The listing's own amenities in `POPULAR_AMENITY_KEYS` order, at most
 * `limit` — what a guest looks for first. Amenities outside that list are
 * still in the full grouped view; this never invents one.
 */
export function resolvePopularAmenities(featureGroups, limit) {
  const rankByKey = new Map(
    POPULAR_AMENITY_KEYS.map((key, index) => [key, index]),
  );
  return featureGroups
    .flatMap((group) => group.items)
    .filter((item) => rankByKey.has(item.key))
    .sort((a, b) => rankByKey.get(a.key) - rankByKey.get(b.key))
    .slice(0, limit);
}

export default resolveAmenityFeatureGroups;
