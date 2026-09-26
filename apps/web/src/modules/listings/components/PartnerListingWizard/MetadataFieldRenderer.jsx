/**
 * MetadataFieldRenderer — the `data_type` -> control registry
 * `DynamicAttributesStep`, `AmenitiesStep`'s pricing-adjacent bits,
 * `PricingStep`, and `PoliciesStep` all render every `GET /listings/
 * metadata` entry through. Analogous to (but a new component from, not a
 * modification of) search's `FilterControl.jsx` — this is the one
 * generic engine "no hardcoded category behaviour" hangs on: it has
 * never seen a category name, only a `definition` object shaped by
 * `data_type`.
 *
 * Mirrors `FilterControl.jsx`'s own pattern for i18n and options: this
 * component resolves its own label/option-labels via `t()` rather than
 * receiving them as props, since attribute/policy/pricing-model `code`s
 * are a fixed, backend-declared catalog per category (never per-listing
 * free text) — exactly the same shape `search.dynamicFilters.*` already
 * established for filter definitions. `namespace` picks which leaf of
 * `partner.listingWizard.*` a given definition's code/options resolve
 * against (`attributes`, `policies`, or `pricingModels` — the three
 * metadata kinds that share this one control registry).
 *
 * Value contract per `data_type` (the domain shape a step's own state
 * holds; converting to the wire shape `attributeValues`/`policyValues`/
 * `pricing` expect — `optionCodes` arrays for ENUM/MULTI_ENUM, `value`
 * otherwise — is each step's own job when it calls `updateListing`):
 *   INTEGER / DECIMAL -> number
 *   BOOLEAN           -> boolean
 *   STRING            -> string
 *   DATE              -> ISO date string
 *   ENUM              -> option code (string)
 *   MULTI_ENUM        -> option codes (string[])
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  Input,
  Select,
  Switch,
  DatePicker,
} from '@desavii/ui/components/form-controls';
import NumberStepperField from './controls/NumberStepperField.jsx';
import { METADATA_TEXT_VALUE_MAX_LENGTH } from '../../constants/textLimits.js';

const NUMERIC_DATA_TYPES = ['INTEGER', 'DECIMAL'];

export default function MetadataFieldRenderer({
  namespace,
  definition,
  value = undefined,
  onChange,
  error = undefined,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const label = t(
    `partner.listingWizard.${namespace}.${definition.code}`,
    definition.code,
  );

  const resolveOptionLabel = (optionCode) =>
    t(
      `partner.listingWizard.options.${definition.code}.${optionCode}`,
      optionCode,
    );

  if (definition.data_type === 'BOOLEAN') {
    return (
      <Switch
        label={label}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  if (NUMERIC_DATA_TYPES.includes(definition.data_type)) {
    return (
      <NumberStepperField
        label={label}
        unit={
          definition.unit
            ? t(
                `partner.listingWizard.units.${definition.unit}`,
                definition.unit,
              )
            : undefined
        }
        min={definition.min ?? undefined}
        max={definition.max ?? undefined}
        step={definition.data_type === 'DECIMAL' ? 0.1 : 1}
        value={value}
        onChange={onChange}
        error={error}
        required={definition.is_required}
        integerOnly={definition.data_type === 'INTEGER'}
        decreaseAriaLabel={t('partner.listingWizard.decrease', { label })}
        increaseAriaLabel={t('partner.listingWizard.increase', { label })}
      />
    );
  }

  if (definition.data_type === 'DATE') {
    return (
      <DatePicker
        label={label}
        value={value ?? null}
        onChange={onChange}
        error={error}
        required={definition.is_required}
        locale={locale}
        placeholder={t('partner.listingWizard.datePicker.selectDate')}
        previousMonthLabel={t('partner.listingWizard.datePicker.previousMonth')}
        nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
      />
    );
  }

  if (definition.data_type === 'ENUM') {
    return (
      <Select
        label={label}
        placeholder={t('partner.listingWizard.selectPlaceholder')}
        options={definition.options.map((option) => ({
          value: option.code,
          label: resolveOptionLabel(option.code),
        }))}
        value={value ?? null}
        onChange={onChange}
        error={error}
        required={definition.is_required}
      />
    );
  }

  if (definition.data_type === 'MULTI_ENUM') {
    return (
      <Select
        label={label}
        placeholder={t('partner.listingWizard.selectPlaceholder')}
        multiple
        options={definition.options.map((option) => ({
          value: option.code,
          label: resolveOptionLabel(option.code),
        }))}
        value={value ?? []}
        onChange={onChange}
        error={error}
        required={definition.is_required}
      />
    );
  }

  // STRING — the fallback branch, per COMPONENT_LIBRARY.md's "Text
  // fields" bullet.
  return (
    <Input
      label={label}
      value={value ?? ''}
      maxLength={METADATA_TEXT_VALUE_MAX_LENGTH}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      required={definition.is_required}
    />
  );
}

const optionShape = PropTypes.shape({
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  code: PropTypes.string.isRequired,
});

MetadataFieldRenderer.propTypes = {
  namespace: PropTypes.oneOf(['attributes', 'policies', 'pricingModels'])
    .isRequired,
  definition: PropTypes.shape({
    code: PropTypes.string.isRequired,
    data_type: PropTypes.string.isRequired,
    unit: PropTypes.string,
    min: PropTypes.number,
    max: PropTypes.number,
    is_required: PropTypes.bool,
    options: PropTypes.arrayOf(optionShape),
  }).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- value's shape depends on definition.data_type (string/number/boolean/array)
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
};
