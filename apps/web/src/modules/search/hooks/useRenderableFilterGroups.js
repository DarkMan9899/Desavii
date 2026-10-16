/**
 * `useRenderableFilterGroups` — the `GET /search/filters` catalog for a
 * category, reduced to what can actually be shown: a `SINGLE_SELECT`/
 * `MULTI_SELECT` definition with zero resolved options (e.g. amenities
 * before any category is chosen) has nothing to offer, and a group left
 * empty by that is dropped too. `STEPPER`/`RANGE` never depend on
 * options and always render. Shared by `DynamicFilterPanel` (Category
 * page) and `SearchFiltersDrawer` (Search page), so both show the exact
 * same filters for a category.
 */

import { useMemo } from 'react';
import { useSearchFilterDefinitionsQuery } from '../queries/useSearchFilterDefinitionsQuery.js';

const OPTION_INPUT_TYPES = ['SINGLE_SELECT', 'MULTI_SELECT'];

function isRenderableDefinition(definition) {
  return (
    !OPTION_INPUT_TYPES.includes(definition.input_type) ||
    definition.options.length > 0
  );
}

/** @returns {Array<{ code: string, definitions: Array<object> }>} */
export function useRenderableFilterGroups(categoryId) {
  const { data: rawGroups } = useSearchFilterDefinitionsQuery(categoryId);
  return useMemo(
    () =>
      (rawGroups ?? [])
        .map((group) => ({
          ...group,
          definitions: group.definitions.filter(isRenderableDefinition),
        }))
        .filter((group) => group.definitions.length > 0),
    [rawGroups],
  );
}

export default useRenderableFilterGroups;
