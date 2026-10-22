/**
 * Converts between `MetadataFieldRenderer`'s per-field domain value (see
 * that component's file header — number/boolean/string/ISO-date/option-
 * code/option-codes[]) and the wire shape `attributeValues` expects
 * (`{ code, value }` or `{ code, optionCodes }` — `listingValidators.js`'s
 * `attributeValueSchema`). Both ENUM and MULTI_ENUM use `optionCodes` on
 * the wire (even a single-select ENUM sends a one-element array — see
 * `mysqlListingRepository.js`'s `ENUM_ATTRIBUTE_DATA_TYPES`); only the
 * *domain* value differs (a bare string for ENUM vs. a string array for
 * MULTI_ENUM), which is what `MetadataFieldRenderer` actually renders
 * against.
 *
 * Lives in `modules/listings/utils/` (moved out of `PartnerListingWizard/`
 * in Phase 6) since `fromAttributeValuesResponse` is now shared by both
 * the wizard (write side) and `ListingAttributesSection` (Listing
 * Details' read side) — keeping it wizard-scoped would also have forced
 * an unrelated read-only page's bundle to pull in the whole wizard chunk.
 */

const NUMERIC_DATA_TYPES = ['INTEGER', 'DECIMAL'];

function isEmptyValue(value) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Whether an attribute applies to the values as they stand — a conditional
 * attribute (`depends_on`, migration 0055) only while its controlling
 * attribute holds that option. The API applies the same rule (it rejects a
 * value it does not apply to, and clears one that stopped applying).
 */
export function isAttributeApplicable(definition, values) {
  const condition = definition.depends_on;
  if (!condition) return true;
  const controlling = values[condition.attribute_code];
  return Array.isArray(controlling)
    ? controlling.includes(condition.option_code)
    : controlling === condition.option_code;
}

/**
 * The `attributeValues` write for the Wizard's current values. A field the
 * partner emptied is sent as a removal when it had a stored value
 * (`initialValues`) — an empty choice as no options, an empty number or
 * text as `null` — and simply left out otherwise. An attribute that does
 * not apply right now is never sent; the API clears its stored value.
 */
export function toAttributeValuesPayload(
  definitions,
  values,
  initialValues = {},
) {
  return definitions
    .filter((definition) => isAttributeApplicable(definition, values))
    .filter(
      (definition) =>
        !isEmptyValue(values[definition.code]) ||
        !isEmptyValue(initialValues[definition.code]),
    )
    .map((definition) => {
      const value = values[definition.code];
      const isEnum =
        definition.data_type === 'ENUM' ||
        definition.data_type === 'MULTI_ENUM';
      if (isEmptyValue(value)) {
        return isEnum
          ? { code: definition.code, optionCodes: [] }
          : { code: definition.code, value: null };
      }
      if (definition.data_type === 'MULTI_ENUM') {
        return { code: definition.code, optionCodes: value };
      }
      if (definition.data_type === 'ENUM') {
        return { code: definition.code, optionCodes: [value] };
      }
      return { code: definition.code, value };
    });
}

export function fromAttributeValuesResponse(definitions, attributeValues) {
  const byCode = new Map(
    (attributeValues ?? []).map((entry) => [entry.code, entry]),
  );
  const result = {};
  definitions.forEach((definition) => {
    const entry = byCode.get(definition.code);
    if (!entry) return;
    if (definition.data_type === 'MULTI_ENUM') {
      result[definition.code] = entry.option_codes ?? [];
    } else if (definition.data_type === 'ENUM') {
      result[definition.code] = entry.option_codes?.[0] ?? null;
    } else if (NUMERIC_DATA_TYPES.includes(definition.data_type)) {
      result[definition.code] =
        entry.value !== undefined ? Number(entry.value) : undefined;
    } else if (definition.data_type === 'BOOLEAN') {
      result[definition.code] = Boolean(Number(entry.value));
    } else {
      result[definition.code] = entry.value;
    }
  });
  return result;
}
