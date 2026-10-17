/**
 * FilterControl — the `input_type` -> control registry every
 * `GET /search/filters` definition renders through (the Search page's
 * quick-filter pills and filter panel, and the Category page's panel).
 * The one place that reads the current raw value(s) out of
 * `dynamicFilters` via `filterParamKey.js` and turns each control's typed
 * `onChange` back into the string-keyed `patch` the URL state expects.
 *
 * Every visible option can narrow the results: an option no listing in
 * scope carries (`count: 0`) is hidden unless it is already selected (so
 * an old link's choice can still be cleared). Labels and units come from
 * `utils/filterVocabulary.js`. A range slider commits once dragging
 * pauses — one search for the finished range, not one per step.
 * `isTitledBySection`: the surrounding panel section already shows this
 * filter's name, so a control with its own heading does not repeat it.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ChipGroup, Switch } from '@desavii/ui/components/form-controls';
import Stepper from './controls/Stepper.jsx';
import RangeSlider from './controls/RangeSlider.jsx';
import CheckboxGroup from './controls/CheckboxGroup.jsx';
import AmenityChecklist from './controls/AmenityChecklist.jsx';
import { getFilterParamKey } from './filterParamKey.js';
import { useDebouncedCommit } from '../../hooks/useDebouncedCommit.js';
import {
  definitionLabel,
  optionLabel,
  unitLabel,
} from '../../utils/filterVocabulary.js';
import { filterDefinitionShape } from '../../constants/propShapes.js';
import styles from './FilterControl.module.scss';

const TOGGLE_ON = 'true';
/** Unit pluralization for an "N or more" bound ("2+ bedrooms"). */
const PLURAL_SAMPLE = 2;

function toNumber(raw) {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function OptionLabel({ text, count }) {
  return (
    <span className={styles.optionLabel}>
      <span>{text}</span>
      <span className={styles.optionCount}>{count}</span>
    </span>
  );
}
OptionLabel.propTypes = {
  text: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
};

function DebouncedRange({
  definition,
  label,
  paramKey,
  dynamicFilters,
  onChange,
}) {
  const { t } = useTranslation();
  const boundsMin = definition.min ?? 0;
  const boundsMax = definition.max ?? 100;
  const applied = {
    min: toNumber(dynamicFilters[paramKey.minKey]) ?? boundsMin,
    max: toNumber(dynamicFilters[paramKey.maxKey]) ?? boundsMax,
  };
  const [draft, setDraft] = useState(null);
  const value = draft ?? applied;
  const { schedule } = useDebouncedCommit((next) => {
    setDraft(null);
    onChange({
      [paramKey.minKey]: next.min === boundsMin ? '' : String(next.min),
      [paramKey.maxKey]: next.max === boundsMax ? '' : String(next.max),
    });
  });

  return (
    <RangeSlider
      label={label}
      unit={unitLabel(t, definition.unit, PLURAL_SAMPLE)}
      min={boundsMin}
      max={boundsMax}
      valueMin={value.min}
      valueMax={value.max}
      onChange={(nextMin, nextMax) => {
        const next = { min: nextMin, max: nextMax };
        setDraft(next);
        schedule(next);
      }}
      minAriaLabel={t('search.dynamicFilters.minValue', { label })}
      maxAriaLabel={t('search.dynamicFilters.maxValue', { label })}
    />
  );
}
DebouncedRange.propTypes = {
  definition: filterDefinitionShape.isRequired,
  label: PropTypes.string.isRequired,
  paramKey: PropTypes.shape({
    minKey: PropTypes.string.isRequired,
    maxKey: PropTypes.string,
  }).isRequired,
  dynamicFilters: PropTypes.objectOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default function FilterControl({
  definition,
  dynamicFilters,
  onChange,
  isTitledBySection = false,
}) {
  const { t, i18n } = useTranslation();
  const paramKey = getFilterParamKey(definition);
  const label = definitionLabel(t, definition);

  const visibleOptions = (selected) =>
    definition.options
      .filter(
        (option) => option.count > 0 || selected.includes(String(option.value)),
      )
      .map((option) => ({
        value: String(option.value),
        group: option.group,
        text: optionLabel(t, definition, option, i18n.language),
        count: option.count,
      }));

  if (definition.input_type === 'STEPPER') {
    const value = toNumber(dynamicFilters[paramKey.minKey]);
    return (
      <Stepper
        label={label}
        unit={unitLabel(t, definition.unit, PLURAL_SAMPLE)}
        min={definition.min ?? 0}
        max={definition.max ?? undefined}
        value={value}
        onChange={(next) =>
          onChange({
            [paramKey.minKey]: next === undefined ? '' : String(next),
          })
        }
        anyLabel={t('search.dynamicFilters.anyValue')}
        decreaseAriaLabel={t('search.dynamicFilters.decrease', { label })}
        increaseAriaLabel={t('search.dynamicFilters.increase', { label })}
      />
    );
  }

  if (definition.input_type === 'RANGE') {
    return (
      <DebouncedRange
        definition={definition}
        label={label}
        paramKey={paramKey}
        dynamicFilters={dynamicFilters}
        onChange={onChange}
      />
    );
  }

  if (definition.input_type === 'TOGGLE') {
    const count = definition.options[0]?.count ?? definition.listing_count;
    return (
      <Switch
        label={<OptionLabel text={label} count={count} />}
        checked={dynamicFilters[paramKey.key] === TOGGLE_ON}
        onChange={(event) =>
          onChange({ [paramKey.key]: event.target.checked ? TOGGLE_ON : '' })
        }
      />
    );
  }

  if (definition.input_type === 'SINGLE_SELECT') {
    const selectedValue = dynamicFilters[paramKey.key];
    return (
      <ChipGroup
        label={label}
        options={visibleOptions(selectedValue ? [selectedValue] : []).map(
          (option) => ({
            value: option.value,
            label: <OptionLabel text={option.text} count={option.count} />,
          }),
        )}
        selectedValue={selectedValue}
        onChange={(next) => onChange({ [paramKey.key]: next ?? '' })}
      />
    );
  }

  if (definition.input_type === 'MULTI_SELECT') {
    const raw = dynamicFilters[paramKey.key];
    const selectedValues = raw ? raw.split(',') : [];
    const options = visibleOptions(selectedValues);
    const writeSelection = (next) =>
      onChange({ [paramKey.key]: next.join(',') });
    if (definition.value_source === 'AMENITY') {
      return (
        <AmenityChecklist
          label={label}
          options={options}
          selectedValues={selectedValues}
          onChange={writeSelection}
          isLabelHidden={isTitledBySection}
        />
      );
    }
    return (
      <CheckboxGroup
        label={label}
        options={options.map((option) => ({
          value: option.value,
          label: <OptionLabel text={option.text} count={option.count} />,
        }))}
        selectedValues={selectedValues}
        onChange={writeSelection}
      />
    );
  }

  return null;
}

FilterControl.propTypes = {
  definition: filterDefinitionShape.isRequired,
  dynamicFilters: PropTypes.objectOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  isTitledBySection: PropTypes.bool,
};
