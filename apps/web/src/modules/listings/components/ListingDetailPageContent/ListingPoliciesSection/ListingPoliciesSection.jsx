/**
 * ListingPoliciesSection — the listing's rules as one compact list
 * (`PolicyList`: icon · short title · short value), the "Things to know"
 * pattern (docs/LISTING_DETAIL_FIELD_GAP.md §3) instead of one large card
 * per one-word value.
 *
 * Values are the stored policy values, formatted by the same
 * `formatMetadataValue` the rest of the page uses; a yes/no rule reads
 * "Allowed" / "Not allowed" rather than "Yes" / "No" next to a short
 * title ("Pets", not "Pets allowed"). Rules read in a fixed order —
 * arrival and departure first — whatever order the category declares.
 *
 * P2.1 integrity check: `cancellation_policy`'s label (Flexible/Moderate/
 * Strict) is collected and displayed only, never consulted by the refund
 * decision (`cancellationRefundPolicy.js`: every customer cancellation is
 * reviewed manually). Its row says so in its expandable explanation; no
 * refund percentage or window is invented here.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { PolicyList } from '@desavii/ui/components/data-display';
import { Section } from '@desavii/ui/components/layout';
import { fromPolicyValuesResponse } from '../../../utils/policyValueMapping.js';
import { formatMetadataValue } from '../MetadataValueDisplay.jsx';
import resolvePolicyIcon from '../../../utils/policyIcons.js';

const POLICY_ORDER = [
  'check_in_time',
  'check_out_time',
  'cancellation_policy',
  'children_allowed',
  'pets_allowed',
  'smoking_allowed',
  'parties_allowed',
  'fuel_policy',
];

function orderOf(code) {
  const index = POLICY_ORDER.indexOf(code);
  return index === -1 ? POLICY_ORDER.length : index;
}

export default function ListingPoliciesSection({
  policies = [],
  listing,
  headingKey = 'pages.listingDetail.policies.heading',
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  if (!policies || policies.length === 0) return null;

  const valuesByCode = fromPolicyValuesResponse(
    policies,
    listing.policy_values,
  );
  const rules = policies
    .map((definition) => ({
      definition,
      value: valuesByCode[definition.code],
    }))
    .filter(
      ({ value }) => value !== undefined && value !== null && value !== '',
    )
    .sort((a, b) => orderOf(a.definition.code) - orderOf(b.definition.code))
    .map(({ definition, value }) => ({
      icon: resolvePolicyIcon(definition.code),
      title: t(`pages.listingDetail.policies.titles.${definition.code}`, {
        defaultValue: t(`partner.listingWizard.policies.${definition.code}`, {
          defaultValue: definition.code,
        }),
      }),
      description:
        definition.data_type === 'BOOLEAN'
          ? t(
              value
                ? 'pages.listingDetail.policies.allowed'
                : 'pages.listingDetail.policies.notAllowed',
            )
          : formatMetadataValue(definition, value, t),
      details:
        definition.code === 'cancellation_policy'
          ? t('pages.listingDetail.policies.cancellationDisclaimer')
          : undefined,
    }));

  if (rules.length === 0) return null;

  const heading = t(headingKey);
  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      <PolicyList policies={rules} />
    </Section>
  );
}

const optionShape = PropTypes.shape({
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  code: PropTypes.string.isRequired,
});

ListingPoliciesSection.propTypes = {
  policies: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      data_type: PropTypes.string.isRequired,
      unit: PropTypes.string,
      options: PropTypes.arrayOf(optionShape),
    }),
  ),
  listing: PropTypes.shape({
    policy_values: PropTypes.arrayOf(
      PropTypes.shape({
        code: PropTypes.string.isRequired,
        value: PropTypes.string,
      }),
    ),
  }).isRequired,
  // "Policies", or a category's own wording ("House rules").
  headingKey: PropTypes.string,
  sectionId: PropTypes.string,
};
