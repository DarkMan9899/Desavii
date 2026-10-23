/**
 * listingSectionHeadings — each category's own wording for a shared
 * section (docs/LISTING_DETAIL_FIELD_GAP.md §3): a car's attributes are its
 * "Vehicle specifications" and its location the "Pickup location", a
 * home's rules its "House rules". Same components, same data; only the
 * heading's i18n key differs. A section a category does not name keeps
 * the generic heading.
 */

const ACCOMMODATION_HEADINGS = {
  policies: 'pages.listingDetail.policies.headingHouseRules',
};

const HEADING_KEYS_BY_CATEGORY = {
  hotels: {
    ...ACCOMMODATION_HEADINGS,
    attributes: 'pages.listingDetail.attributes.headingProperty',
  },
  apartments: {
    ...ACCOMMODATION_HEADINGS,
    attributes: 'pages.listingDetail.attributes.headingSpace',
  },
  villas: {
    ...ACCOMMODATION_HEADINGS,
    attributes: 'pages.listingDetail.attributes.headingSpace',
  },
  'guest-houses': {
    ...ACCOMMODATION_HEADINGS,
    attributes: 'pages.listingDetail.attributes.headingSpace',
  },
  restaurants: {
    attributes: 'pages.listingDetail.attributes.headingRestaurant',
  },
  tours: {
    attributes: 'pages.listingDetail.attributes.headingTour',
  },
  'car-rentals': {
    attributes: 'pages.listingDetail.attributes.headingVehicle',
    amenities: 'pages.listingDetail.amenities.headingVehicle',
    location: 'pages.listingDetail.location.headingPickup',
    policies: 'pages.listingDetail.policies.headingRental',
  },
  attractions: {
    attributes: 'pages.listingDetail.attributes.headingVisit',
  },
  'entertainment-venues': {
    attributes: 'pages.listingDetail.attributes.headingVenue',
  },
};

const DEFAULT_HEADING_KEYS = {
  attributes: 'pages.listingDetail.attributes.heading',
  amenities: 'pages.listingDetail.amenities.heading',
  location: 'pages.listingDetail.location.heading',
  policies: 'pages.listingDetail.policies.heading',
};

/**
 * @param {string} categoryVisualKey - `categoryPresentation.js`
 * @param {'attributes'|'amenities'|'location'|'policies'} section
 * @returns {string} the i18n key of that section's heading
 */
export function resolveSectionHeadingKey(categoryVisualKey, section) {
  return (
    HEADING_KEYS_BY_CATEGORY[categoryVisualKey]?.[section] ??
    DEFAULT_HEADING_KEYS[section]
  );
}

export default resolveSectionHeadingKey;
