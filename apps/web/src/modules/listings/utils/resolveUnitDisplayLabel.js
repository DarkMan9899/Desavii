/**
 * resolveUnitDisplayLabel — a bookable unit's own real `unit_label` (e.g.
 * "Deluxe King") when a partner set one, falling back to the generic
 * `bookable_unit_type` label (e.g. "Hotel room") for a legacy/unlabeled
 * unit — never a bare type code, and never the plural section heading
 * ("Rooms") a caller might otherwise reach for as a quick fallback.
 * Originally `ListingReservationWidget.jsx`'s own private helper (P2.2B);
 * extracted in Sprint C-2 so `RoomCard`/`RoomDetailModal` resolve an
 * unlabeled room's title the exact same way instead of inventing a
 * second fallback.
 */

export function resolveUnitDisplayLabel(t, unit) {
  if (!unit) return null;
  return (
    unit.unit_label ||
    t(`partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`, {
      defaultValue: unit.bookable_unit_type,
    })
  );
}

export default resolveUnitDisplayLabel;
