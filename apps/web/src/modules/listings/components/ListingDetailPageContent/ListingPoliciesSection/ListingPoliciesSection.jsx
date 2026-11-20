/**
 * ListingPoliciesSection — the listing's rules as one compact list
 * (`PolicyList`: icon · short title · short value), the "Things to know"
 * pattern (docs/LISTING_DETAIL_FIELD_GAP.md §3) instead of one large card
 * per one-word value.
 *
 * Which rules exist, their order and their wording are decided by
 * `listingRules.js` — the same function the in-page navigation asks, so
 * the section and its link always agree: the partner's policies plus the
 * booking rules the reservation panel enforces (minimum / maximum stay,
 * advance notice).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { PolicyList } from '@desavii/ui/components/data-display';
import { Section } from '@desavii/ui/components/layout';
import { resolveListingRules } from '../../../utils/listingRules.js';

export default function ListingPoliciesSection({
  policies = [],
  listing,
  headingKey = 'pages.listingDetail.policies.heading',
  sectionId = undefined,
}) {
  const { t, i18n } = useTranslation();
  const rules = resolveListingRules(
    { policies, listing, locale: i18n.language },
    t,
  );
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
    listing_type: PropTypes.string,
    policy_values: PropTypes.arrayOf(
      PropTypes.shape({
        code: PropTypes.string.isRequired,
        value: PropTypes.string,
      }),
    ),
    booking_rules: PropTypes.shape({
      minimum_stay_nights: PropTypes.number,
      maximum_stay_nights: PropTypes.number,
      advance_booking_min_hours: PropTypes.number,
    }),
  }).isRequired,
  // "Policies", or a category's own wording ("House rules").
  headingKey: PropTypes.string,
  sectionId: PropTypes.string,
};
