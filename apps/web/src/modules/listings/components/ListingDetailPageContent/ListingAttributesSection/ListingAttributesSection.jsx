/**
 * ListingAttributesSection — the read side of `DynamicAttributesStep`'s
 * category-driven attribute set. Reuses `fromAttributeValuesResponse`
 * (Phase 5's own wizard mapping utility, unmodified) to turn the
 * listing's wire-shape `attribute_values` into the same `{code:
 * domainValue}` map `MetadataFieldRenderer` renders from, then hands it
 * to `MetadataValueDisplay` for the actual label+value formatting.
 * Never branches on category — `metadata.attributes` is whatever the
 * category declares, nothing here names one. A conditional attribute
 * whose condition no longer holds (`depends_on`) is not shown.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section } from '@desavii/ui/components/layout';
import {
  fromAttributeValuesResponse,
  isAttributeApplicable,
} from '../../../utils/attributeValueMapping.js';
import MetadataValueDisplay from '../MetadataValueDisplay.jsx';

export default function ListingAttributesSection({
  attributes = [],
  listing,
  excludeCodes = [],
  headingKey = 'pages.listingDetail.attributes.heading',
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  if (!attributes || attributes.length === 0) return null;

  const valuesByCode = fromAttributeValuesResponse(
    attributes,
    listing.attribute_values,
  );
  const excluded = new Set(excludeCodes);
  const applicable = attributes.filter((definition) =>
    isAttributeApplicable(definition, valuesByCode),
  );
  const hasAnyValue = applicable.some((definition) => {
    if (excluded.has(definition.code)) return false;
    const value = valuesByCode[definition.code];
    return (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0)
    );
  });
  if (!hasAnyValue) return null;

  const heading = t(headingKey);
  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      <MetadataValueDisplay
        namespace="attributes"
        definitions={applicable}
        valuesByCode={valuesByCode}
        excludeCodes={excludeCodes}
      />
    </Section>
  );
}

const optionShape = PropTypes.shape({
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  code: PropTypes.string.isRequired,
});

ListingAttributesSection.propTypes = {
  attributes: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      data_type: PropTypes.string.isRequired,
      unit: PropTypes.string,
      options: PropTypes.arrayOf(optionShape),
    }),
  ),
  listing: PropTypes.shape({
    // eslint-disable-next-line react/forbid-prop-types -- passthrough to fromAttributeValuesResponse, whose own entry shape varies by data_type
    attribute_values: PropTypes.array,
  }).isRequired,
  // Codes the key facts strip already shows; the public page passes them,
  // Admin (which wants every value) does not.
  excludeCodes: PropTypes.arrayOf(PropTypes.string),
  // "Details", or a category's own wording ("Vehicle specifications").
  headingKey: PropTypes.string,
  sectionId: PropTypes.string,
};
