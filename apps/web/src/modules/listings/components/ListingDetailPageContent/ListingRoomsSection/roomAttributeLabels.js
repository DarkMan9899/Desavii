/**
 * roomAttributeLabels — maps a HOTEL_ROOM unit's Sprint C-1 structured
 * enum values (`bathroom_type`/`view_type`/`smoking_policy`) to real,
 * customer-facing copy. Reuses the exact `partner.listingWizard.
 * {bathroomTypes,viewTypes,smokingPolicies}.*` keys the Partner room-
 * authoring UI already uses for this same enum — natural, translated
 * strings, not partner-only jargon (`ListingReservationWidget.jsx`
 * already reuses this same `partner.listingWizard.*` namespace publicly
 * for unit-type/bed-type/date-picker copy; this follows that established
 * precedent instead of duplicating the strings under a public-only key).
 * Centralized here so no component resolves these codes with its own
 * inline `t(...)` call or switch statement.
 */

export function formatBathroomType(t, code) {
  if (!code) return null;
  return t(`partner.listingWizard.bathroomTypes.${code}`, {
    defaultValue: code,
  });
}

export function formatViewType(t, code) {
  if (!code) return null;
  return t(`partner.listingWizard.viewTypes.${code}`, { defaultValue: code });
}

export function formatSmokingPolicy(t, code) {
  if (!code) return null;
  return t(`partner.listingWizard.smokingPolicies.${code}`, {
    defaultValue: code,
  });
}

export default { formatBathroomType, formatViewType, formatSmokingPolicy };
