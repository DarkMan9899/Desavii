/**
 * `listings` module public export surface (FRONTEND_ARCHITECTURE.md
 * §6.2) — the ONLY entry point another module may import from
 * (§6.3's cross-module rule).
 */

export { default as useListingQuery } from './queries/useListingQuery.js';
export { default as useListingMetadataQuery } from './queries/useListingMetadataQuery.js';
export { default as useListingCategoriesQuery } from './queries/useListingCategoriesQuery.js';
export { default as useListingBookableUnitsQuery } from './queries/useListingBookableUnitsQuery.js';
export { default as listingKeys } from './constants/queryKeys.js';
export { default as ListingDetailPageContent } from './components/ListingDetailPageContent/ListingDetailPageContent.jsx';
export { default as PartnerListingWizard } from './components/PartnerListingWizard/PartnerListingWizard.jsx';
export { default as PartnerListingRoomsPageContent } from './components/PartnerListingRoomsPageContent/PartnerListingRoomsPageContent.jsx';
export { default as PartnerListingMenuPageContent } from './components/PartnerListingMenuPageContent/PartnerListingMenuPageContent.jsx';
export { default as PartnerListingOpeningHoursPageContent } from './components/PartnerListingOpeningHoursPageContent/PartnerListingOpeningHoursPageContent.jsx';
export {
  PRESENTATION_GROUPS,
  resolvePresentationGroup,
} from './utils/categoryPresentation.js';

// Phase 5 (Partner Listing Wizard) mutations.
export { default as useCreateListingMutation } from './mutations/useCreateListingMutation.js';
export { default as useUpdateListingMutation } from './mutations/useUpdateListingMutation.js';
export { default as usePublishListingMutation } from './mutations/usePublishListingMutation.js';
export { default as useUnpublishListingMutation } from './mutations/useUnpublishListingMutation.js';
export { default as useAttachListingMediaMutation } from './mutations/useAttachListingMediaMutation.js';
export { default as useUpdateListingMediaMutation } from './mutations/useUpdateListingMediaMutation.js';
export { default as useRemoveListingMediaMutation } from './mutations/useRemoveListingMediaMutation.js';

// Phase 9 (Partner Dashboard).
export { default as useMyListingsQuery } from './queries/useMyListingsQuery.js';
export { default as useArchiveListingMutation } from './mutations/useArchiveListingMutation.js';
export { default as useDeleteListingMutation } from './mutations/useDeleteListingMutation.js';
export { default as useListingCalendarQuery } from './queries/useListingCalendarQuery.js';
export { default as useSetAvailabilityMutation } from './mutations/useSetAvailabilityMutation.js';
export { default as ListingStatusBadge } from './components/ListingStatusBadge/ListingStatusBadge.jsx';
export { LISTING_STATUS_KEYS } from './constants/listingStatuses.js';

// P2.1 (Admin Listing Detail): the read-only Listing Detail sections,
// exposed so the admin module can render the same metadata-driven
// attribute/amenity/policy/itinerary/content display a customer sees,
// rather than a second, duplicated rendering of the same data.
export { default as ListingAttributesSection } from './components/ListingDetailPageContent/ListingAttributesSection/ListingAttributesSection.jsx';
export { default as ListingAmenitiesSection } from './components/ListingDetailPageContent/ListingAmenitiesSection/ListingAmenitiesSection.jsx';
export { default as ListingPoliciesSection } from './components/ListingDetailPageContent/ListingPoliciesSection/ListingPoliciesSection.jsx';
export { default as ListingItinerarySection } from './components/ListingDetailPageContent/ListingItinerarySection/ListingItinerarySection.jsx';
export { default as ListingIncludedSection } from './components/ListingDetailPageContent/ListingIncludedSection/ListingIncludedSection.jsx';
export { default as ListingFaqSection } from './components/ListingDetailPageContent/ListingFaqSection/ListingFaqSection.jsx';
export { default as ListingLocationSection } from './components/ListingDetailPageContent/ListingLocationSection/ListingLocationSection.jsx';
export { default as ListingAboutSection } from './components/ListingDetailPageContent/ListingAboutSection/ListingAboutSection.jsx';
export { default as getLocalizedTranslation } from './utils/getLocalizedTranslation.js';
export {
  default as getLocalizedItems,
  DEFAULT_CONTENT_LOCALE,
  getLocalizedItemsExact,
} from './utils/getLocalizedItems.js';
export { default as resolveHighlightIcon } from './utils/highlightIcons.js';
export { default as AuthoringLocaleTabs } from './components/PartnerListingWizard/AuthoringLocaleTabs/AuthoringLocaleTabs.jsx';
