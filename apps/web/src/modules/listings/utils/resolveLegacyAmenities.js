/**
 * Step L6.1 — a listing's (or room's) stored amenities that its category
 * no longer offers ("legacy" amenities). The backend keeps them until the
 * Partner removes them (it only rejects NEW out-of-category amenities), so
 * the Partner UI must show them — otherwise they could never be removed.
 *
 * `amenityGroups` is the category's selectable set; `amenityCatalog` is
 * every amenity's localized label (`GET /listings/metadata`'s
 * `amenity_catalog`). A stored id with no label is left out rather than
 * shown as a raw id — it still round-trips untouched.
 *
 * @returns {{ value: number, code: string }[]} in catalog (label) order
 */
export function resolveLegacyAmenities(
  amenityGroups,
  amenityCatalog,
  storedIds,
) {
  const applicableIds = new Set(
    (amenityGroups ?? []).flatMap((group) =>
      group.amenities.map((amenity) => amenity.value),
    ),
  );
  const legacyIds = new Set(
    (storedIds ?? []).filter((id) => !applicableIds.has(id)),
  );
  return (amenityCatalog ?? []).filter((amenity) =>
    legacyIds.has(amenity.value),
  );
}

export default resolveLegacyAmenities;
