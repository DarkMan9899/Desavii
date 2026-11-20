/**
 * ListingDetailSection — renders one Listing Detail section by id from the
 * page model (`useListingDetail`). Which sections a listing has, and in
 * what order, is decided by `listingDetailSections.js`; this only maps an
 * id to its component and the data it needs.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { SECTION_IDS } from '../../utils/listingDetailSections.js';
import ListingAboutSection from './ListingAboutSection/ListingAboutSection.jsx';
import ListingRoomsSection from './ListingRoomsSection/ListingRoomsSection.jsx';
import ListingItinerarySection from './ListingItinerarySection/ListingItinerarySection.jsx';
import ListingIncludedSection from './ListingIncludedSection/ListingIncludedSection.jsx';
import ListingGuestNotesSection from './ListingGuestNotesSection/ListingGuestNotesSection.jsx';
import ListingFactGroupsSection from './ListingFactGroupsSection/ListingFactGroupsSection.jsx';
import ListingAmenitiesSection from './ListingAmenitiesSection/ListingAmenitiesSection.jsx';
import ListingPoliciesSection from './ListingPoliciesSection/ListingPoliciesSection.jsx';
import ListingAvailabilitySection from './ListingAvailabilitySection/ListingAvailabilitySection.jsx';
import ListingLocationSection from './ListingLocationSection/ListingLocationSection.jsx';
import ListingReviewsSection from './ListingReviewsSection/ListingReviewsSection.jsx';
import ListingPartnerSection from './ListingPartnerSection/ListingPartnerSection.jsx';
import ListingFaqSection from './ListingFaqSection/ListingFaqSection.jsx';
import ListingMenuSection from './ListingMenuSection/ListingMenuSection.jsx';
import ListingOpeningHoursSection from './ListingOpeningHoursSection/ListingOpeningHoursSection.jsx';

export default function ListingDetailSection({ sectionId, model, locale }) {
  const { t } = useTranslation();
  const {
    listing,
    metadata,
    content,
    reservation,
    sections: { headingKey },
  } = model;

  switch (sectionId) {
    case SECTION_IDS.ABOUT:
      return (
        <ListingAboutSection
          description={model.description}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.ROOMS:
      return (
        <ListingRoomsSection
          listingId={listing.id}
          amenityGroups={metadata?.amenity_groups}
          pricing={listing.pricing}
          locale={locale}
          selectedUnitId={reservation.selectedUnitId}
          onSelectUnit={reservation.onSelectUnit}
          dateRange={reservation.dateRange}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.ITINERARY:
      return (
        <ListingItinerarySection
          steps={content.itinerarySteps}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.INCLUDED:
      return (
        <ListingIncludedSection
          items={content.includedItems}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.GUEST_NOTES:
      return (
        <ListingGuestNotesSection
          notes={content.guestNotes}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.MEETING:
      return (
        <ListingFactGroupsSection
          heading={t('pages.listingDetail.meeting.heading')}
          groups={model.factGroups.meeting}
          columns={2}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.ATTRIBUTES:
      return (
        <ListingFactGroupsSection
          heading={t(headingKey('attributes'))}
          groups={model.factGroups.attributes}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.AMENITIES:
      return metadata ? (
        <ListingAmenitiesSection
          amenityGroups={metadata.amenity_groups}
          amenityIds={listing.amenity_ids}
          headingKey={headingKey('amenities')}
          sectionId={sectionId}
        />
      ) : null;
    case SECTION_IDS.POLICIES:
      return (
        <ListingPoliciesSection
          policies={metadata?.policies}
          listing={listing}
          headingKey={headingKey('policies')}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.AVAILABILITY:
      return (
        <ListingAvailabilitySection
          listingId={listing.id}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.LOCATION:
      return (
        <ListingLocationSection
          location={model.location}
          title={model.title}
          headingKey={headingKey('location')}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.REVIEWS:
      return (
        <ListingReviewsSection
          listingId={listing.id}
          companySlug={listing.company?.slug}
          rating={model.header.rating}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.PARTNER:
      return (
        <ListingPartnerSection
          company={listing.company}
          locale={locale}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.FAQ:
      return <ListingFaqSection faqs={content.faqs} sectionId={sectionId} />;
    case SECTION_IDS.MENU:
      return (
        <ListingMenuSection
          menus={model.menus}
          locale={locale}
          sectionId={sectionId}
        />
      );
    case SECTION_IDS.OPENING_HOURS:
      return (
        <ListingOpeningHoursSection
          weeklyHours={model.weeklyHours}
          locale={locale}
          sectionId={sectionId}
        />
      );
    default:
      return null;
  }
}

ListingDetailSection.propTypes = {
  sectionId: PropTypes.oneOf(Object.values(SECTION_IDS)).isRequired,
  // The `useListingDetail` page model.
  // eslint-disable-next-line react/forbid-prop-types
  model: PropTypes.object.isRequired,
  locale: PropTypes.string.isRequired,
};
