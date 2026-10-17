/**
 * Derives the "active filter" chip list from the current `dynamicFilters`
 * bag + the category's resolved filter catalog — one chip per filter that
 * currently has a value, each carrying the exact key(s) clearing it
 * requires (a RANGE chip clears both `_min` and `_max` together). Labels
 * come from `utils/filterVocabulary.js`, the same source the controls
 * use. Pure, no React, so the Search and Category pages and their tests
 * all call it directly.
 *
 * @param {Array<{ definitions: object[] }>} groups
 * @param {Object<string, string>} dynamicFilters
 * @param {Function} t
 * @param {string} [locale]
 */

import { getFilterParamKey, getFilterParamKeys } from './filterParamKey.js';
import {
  definitionLabel,
  optionLabel,
  unitLabel,
} from '../../utils/filterVocabulary.js';

const TOGGLE_ON = 'true';

/** `30 minutes`; with `suffix` `2+ rooms` — the mark sits on the number. */
function withUnit(t, definition, value, suffix = '') {
  const unit = unitLabel(t, definition.unit, Number(value));
  return unit ? `${value}${suffix} ${unit}` : `${value}${suffix}`;
}

function chipValue(t, definition, dynamicFilters, locale) {
  const paramKey = getFilterParamKey(definition);
  switch (definition.input_type) {
    case 'STEPPER': {
      const raw = dynamicFilters[paramKey.minKey];
      return raw ? withUnit(t, definition, raw, '+') : null;
    }
    case 'RANGE': {
      const rawMin = dynamicFilters[paramKey.minKey];
      const rawMax = dynamicFilters[paramKey.maxKey];
      if (!rawMin && !rawMax) return null;
      return `${rawMin ?? definition.min}–${withUnit(
        t,
        definition,
        rawMax ?? definition.max,
      )}`;
    }
    case 'TOGGLE':
      return dynamicFilters[paramKey.key] === TOGGLE_ON ? '' : null;
    default: {
      const raw = dynamicFilters[paramKey.key];
      if (!raw) return null;
      const labels = raw
        .split(',')
        .map((id) =>
          definition.options.find((option) => String(option.value) === id),
        )
        .filter(Boolean)
        .map((option) => optionLabel(t, definition, option, locale));
      return labels.length > 0 ? labels.join(', ') : null;
    }
  }
}

export function getActiveFilterChips(groups, dynamicFilters, t, locale) {
  return groups.flatMap((group) =>
    group.definitions.flatMap((definition) => {
      const value = chipValue(t, definition, dynamicFilters, locale);
      if (value === null) return [];
      const name = definitionLabel(t, definition);
      return [
        {
          key: getFilterParamKeys(definition)[0],
          keysToClear: getFilterParamKeys(definition),
          // A toggle's name is its value ("Pets allowed").
          label: value === '' ? name : `${name}: ${value}`,
        },
      ];
    }),
  );
}

export default getActiveFilterChips;
