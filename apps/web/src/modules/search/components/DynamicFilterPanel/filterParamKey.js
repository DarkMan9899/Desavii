/**
 * Resolves a `GET /search/filters` definition to the exact `GET /search`
 * query param key(s) it writes/reads. The backend declares each
 * definition's `param` (`attr_{code}`, `amenityIds`, `policy_{code}`,
 * `room_{code}`, `ratingMin`); the `value_source` convention below is only
 * the fallback for a payload without it. `RANGE` writes `_min`/`_max`,
 * `STEPPER` only `_min` (an "N or more" filter); every other input type
 * writes the bare key (comma-joined ids/codes for multi-select, `true`
 * for a toggle).
 *
 * @param {{ code: string, input_type: string, value_source: string, param?: string }} definition
 * @returns {{ type: 'exact', key: string } | { type: 'range', minKey: string, maxKey: string|undefined }}
 */
export function getFilterParamKey(definition) {
  const base =
    definition.param ??
    (definition.value_source === 'AMENITY'
      ? 'amenityIds'
      : `attr_${definition.code}`);

  if (definition.input_type === 'RANGE') {
    return { type: 'range', minKey: `${base}_min`, maxKey: `${base}_max` };
  }
  if (definition.input_type === 'STEPPER') {
    return { type: 'range', minKey: `${base}_min`, maxKey: undefined };
  }
  return { type: 'exact', key: base };
}

/** Every URL key a definition can write — used to clear or prune it. */
export function getFilterParamKeys(definition) {
  const paramKey = getFilterParamKey(definition);
  return paramKey.type === 'exact'
    ? [paramKey.key]
    : [paramKey.minKey, paramKey.maxKey].filter(Boolean);
}

export default getFilterParamKey;
