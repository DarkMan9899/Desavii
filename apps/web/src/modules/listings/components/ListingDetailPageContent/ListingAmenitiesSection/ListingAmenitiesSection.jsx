/**
 * ListingAmenitiesSection — Phase 18 (Premium Listing Detail): redesigned
 * onto the shared `FeatureGrid` primitive (icon + grouping + collapse),
 * replacing the earlier flat, icon-less `Badge` list. Still matches the
 * listing's `amenity_ids` (numeric ids) against `metadata.amenity_groups
 * [].amenities[].value` (also the numeric id — `AmenitiesStep.jsx`'s exact
 * wizard-side pairing convention), grouped by `amenity_groups[].code`
 * (translated via the existing `partner.listingWizard.amenityGroups.
 * {code}` keys — reused, never duplicated). An amenity's own `.code` here
 * is already the locale-resolved display name (`listing_amenity_
 * translations`, Phase 5), not a machine code — only the GROUP code is
 * stable, so the icon is resolved per group, not per individual amenity
 * (see `amenityGroupIcons.js`'s own header for why).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FeatureGrid } from '@desavii/ui/components/data-display';
import { Section } from '@desavii/ui/components/layout';
import { resolveAmenityFeatureGroups } from '../../../utils/resolveAmenityFeatureGroups.js';

export default function ListingAmenitiesSection({
  amenityGroups = [],
  amenityIds = [],
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  if (!amenityGroups || amenityGroups.length === 0) return null;

  const groups = resolveAmenityFeatureGroups(amenityGroups, amenityIds, t);

  if (groups.length === 0) return null;

  return (
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.amenities.heading')}
    >
      <h2 id={sectionId}>{t('pages.listingDetail.amenities.heading')}</h2>
      <FeatureGrid
        groups={groups}
        showAllLabel={t('pages.listingDetail.amenities.showAll')}
        showLessLabel={t('pages.listingDetail.amenities.showLess')}
      />
    </Section>
  );
}

ListingAmenitiesSection.propTypes = {
  amenityGroups: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      amenities: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.number.isRequired,
          code: PropTypes.string.isRequired,
        }),
      ).isRequired,
    }),
  ),
  amenityIds: PropTypes.arrayOf(PropTypes.number),
  sectionId: PropTypes.string,
};
