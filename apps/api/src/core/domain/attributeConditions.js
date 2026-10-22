/**
 * Conditional category attributes (migration 0055): a fact that only
 * means something after another choice — a car's daily distance limit
 * when its mileage policy is LIMITED, a tour's pickup details when it
 * offers hotel pickup. One rule, read by the Listing service (accept,
 * reject, clear) and by publish readiness (ask only while it applies).
 *
 * Values are compared by code, the way the Wizard and the API address
 * attributes (`{ code, optionCodes }` for ENUM/MULTI_ENUM, `{ code, value }`
 * otherwise).
 */

/**
 * @param {{ dependsOn?: { attributeCode: string, optionCode: string } | null }} attribute
 * @param {Map<string, { optionCodes?: string[], value?: unknown }>} valuesByCode
 *   the listing's effective attribute values (stored, overlaid by the request)
 * @returns {boolean} whether the attribute applies to the listing as it stands
 */
export function isAttributeApplicable(attribute, valuesByCode) {
  if (!attribute.dependsOn) return true;
  const controlling = valuesByCode.get(attribute.dependsOn.attributeCode);
  return Boolean(
    controlling?.optionCodes?.includes(attribute.dependsOn.optionCode),
  );
}

/**
 * Whether a submitted entry actually states a value — an ENUM entry with no
 * option codes, or a blank scalar, says "nothing", never a fact.
 * @param {{ optionCodes?: string[], value?: unknown }} entry
 */
export function hasAttributeValue(entry) {
  if (!entry) return false;
  if (entry.optionCodes !== undefined) return entry.optionCodes.length > 0;
  return (
    entry.value !== undefined && entry.value !== null && entry.value !== ''
  );
}

/**
 * The listing's attribute values as they will be after a write: stored
 * values, with every submitted code replacing its stored entry.
 * @param {Array<{ code: string }>} stored
 * @param {Array<{ code: string }>} [submitted]
 * @returns {Map<string, object>}
 */
export function mergeAttributeValues(stored, submitted = []) {
  const merged = new Map(stored.map((entry) => [entry.code, entry]));
  submitted.forEach((entry) => merged.set(entry.code, entry));
  return merged;
}

export default {
  isAttributeApplicable,
  hasAttributeValue,
  mergeAttributeValues,
};
