/**
 * MetadataValueDisplay — the read-only counterpart to `PartnerListingWizard/
 * MetadataFieldRenderer.jsx`: given a category's metadata `definitions`
 * (attributes or policies, `GET /listings/metadata`'s shape) and an
 * already-mapped `valuesByCode` domain-value map (built by the *existing*
 * `fromAttributeValuesResponse`/`fromPolicyValuesResponse` — reused
 * as-is, never re-derived here), renders one label+value row per
 * definition the listing actually has a value for. Same `data_type`
 * dispatch, same i18n key convention (`partner.listingWizard.
 * {namespace}.{code}` for labels, `partner.listingWizard.options.
 * {code}.{optionCode}` for ENUM/MULTI_ENUM option labels,
 * `partner.listingWizard.units.{unit}` for number suffixes) as the
 * write-side renderer — this is deliberately a sibling, not a
 * modification, of that file, since the write side keeps owning
 * editable-control concerns (min/max, required, onChange) this read-only
 * version has no use for.
 *
 * A definition the listing has no value for (visible in the category's
 * metadata but never filled in by the partner) is skipped — this section
 * lists what the listing DOES say, not every field a listing of this
 * category COULD have.
 *
 * Listing Detail & Admin Information rebuild: an icon specification grid
 * (label above value) instead of a bare `<dl>` stack, skipping any code
 * the key facts strip already shows (`excludeCodes`).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { resolveAttributeIcon } from '../../utils/attributeIcons.js';
import styles from './MetadataValueDisplay.module.scss';

const NUMERIC_DATA_TYPES = ['INTEGER', 'DECIMAL'];

/**
 * Pure formatting logic, extracted so `ListingPoliciesSection`'s
 * `PolicyList` cards (Phase 18) can format the exact same domain value
 * this `<dl>` renderer does, without a second implementation of the
 * BOOLEAN/ENUM/MULTI_ENUM/numeric-unit dispatch.
 */
export function formatMetadataValue(definition, value, t) {
  const resolveOptionLabel = (attributeCode, optionCode) =>
    t(`partner.listingWizard.options.${attributeCode}.${optionCode}`, {
      defaultValue: optionCode,
    });

  if (definition.data_type === 'BOOLEAN') {
    return value ? t('pages.listingDetail.yes') : t('pages.listingDetail.no');
  }
  if (definition.data_type === 'MULTI_ENUM') {
    return (value ?? [])
      .map((optionCode) => resolveOptionLabel(definition.code, optionCode))
      .join(', ');
  }
  if (definition.data_type === 'ENUM') {
    return resolveOptionLabel(definition.code, value);
  }
  if (NUMERIC_DATA_TYPES.includes(definition.data_type) && definition.unit) {
    const unitLabel = t(`partner.listingWizard.units.${definition.unit}`, {
      count: value,
      defaultValue: definition.unit,
    });
    return `${value} ${unitLabel}`;
  }
  return String(value);
}

export default function MetadataValueDisplay({
  namespace,
  definitions,
  valuesByCode,
  excludeCodes = [],
}) {
  const { t } = useTranslation();
  const excluded = new Set(excludeCodes);

  const rows = definitions
    .filter((definition) => !excluded.has(definition.code))
    .map((definition) => ({
      definition,
      value: valuesByCode[definition.code],
    }))
    .filter(
      ({ value }) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    );

  if (rows.length === 0) return null;

  return (
    <dl className={styles.grid}>
      {rows.map(({ definition, value }) => {
        const Icon = resolveAttributeIcon(definition.code);
        return (
          // A `<dl>` group holds only its `<dt>`/`<dd>`; the icon sits
          // inside the term, positioned beside both lines by the styles.
          <div className={styles.row} key={definition.code}>
            <dt className={styles.label}>
              <Icon
                className={styles.icon}
                aria-hidden="true"
                focusable="false"
              />
              {t(`partner.listingWizard.${namespace}.${definition.code}`, {
                defaultValue: definition.code,
              })}
            </dt>
            <dd className={styles.value}>
              {formatMetadataValue(definition, value, t)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

const optionShape = PropTypes.shape({
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  code: PropTypes.string.isRequired,
});

MetadataValueDisplay.propTypes = {
  namespace: PropTypes.oneOf(['attributes', 'policies']).isRequired,
  definitions: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      data_type: PropTypes.string.isRequired,
      unit: PropTypes.string,
      options: PropTypes.arrayOf(optionShape),
    }),
  ).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- domain value shape varies by data_type (string/number/boolean/array), same as MetadataFieldRenderer's own `value` prop
  valuesByCode: PropTypes.object.isRequired,
  // Codes already shown elsewhere on the page (the key facts strip).
  excludeCodes: PropTypes.arrayOf(PropTypes.string),
};
