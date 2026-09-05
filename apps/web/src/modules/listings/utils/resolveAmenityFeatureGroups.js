/**
 * resolveAmenityFeatureGroups — matches a set of numeric amenity ids
 * against `metadata.amenity_groups` (`GET /listings/metadata`, the same
 * catalog `AmenitiesStep`/`RoomAmenitiesEditor` already author against)
 * into `FeatureGrid`'s `{title, items: [{label, icon}]}` shape. Extracted
 * from `ListingAmenitiesSection.jsx` (Phase 18) so Sprint C-2's room-level
 * amenities display — a second, structurally identical id-to-label-and-
 * icon resolution against the exact same shared catalog — reuses one
 * function instead of a second copy of this matching logic.
 */

import resolveAmenityGroupIcon from './amenityGroupIcons.js';

export function resolveAmenityFeatureGroups(amenityGroups, amenityIds, t) {
  const idSet = new Set(amenityIds ?? []);
  return (amenityGroups ?? [])
    .map((group) => ({
      title: t(`partner.listingWizard.amenityGroups.${group.code}`, {
        defaultValue: group.code,
      }),
      items: group.amenities
        .filter((amenity) => idSet.has(amenity.value))
        .map((amenity) => ({
          label: amenity.code,
          icon: resolveAmenityGroupIcon(group.code),
        })),
    }))
    .filter((group) => group.items.length > 0);
}

export default resolveAmenityFeatureGroups;
