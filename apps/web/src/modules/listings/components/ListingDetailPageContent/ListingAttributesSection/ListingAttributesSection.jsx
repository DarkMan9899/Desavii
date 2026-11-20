/**
 * ListingAttributesSection — every category attribute a listing has a
 * value for, as one flat list: the Admin listing review, which checks all
 * of them at once. The public page shows the same values grouped by what
 * a traveller weighs (`listingFactGroups.js`, `ListingFactGroupsSection`).
 *
 * Reuses `fromAttributeValuesResponse` (the Wizard's own mapping) to turn
 * the wire-shape `attribute_values` into the `{code: domainValue}` map
 * `MetadataValueDisplay` renders. Never branches on category — the
 * attributes are whatever the category declares. A conditional attribute
 * whose condition no longer holds (`depends_on`) is not shown.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section } from '@desavii/ui/components/layout';
import {
  fromAttributeValuesResponse,
  isAttributeApplicable,
} from '../../../utils/attributeValueMapping.js';
import { hasMetadataValue } from '../../../utils/metadataValueFormat.js';
import MetadataValueDisplay from '../MetadataValueDisplay.jsx';

export default function ListingAttributesSection({
  attributes = [],
  listing,
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  if (!attributes || attributes.length === 0) return null;

  const valuesByCode = fromAttributeValuesResponse(
    attributes,
    listing.attribute_values,
  );
  const applicable = attributes.filter((definition) =>
    isAttributeApplicable(definition, valuesByCode),
  );
  if (
    !applicable.some((definition) =>
      hasMetadataValue(valuesByCode[definition.code]),
    )
  ) {
    return null;
  }

  const heading = t('pages.listingDetail.attributes.heading');
  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      <MetadataValueDisplay
        namespace="attributes"
        definitions={applicable}
        valuesByCode={valuesByCode}
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
  sectionId: PropTypes.string,
};
