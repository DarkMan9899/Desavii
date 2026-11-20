/**
 * listingDetailSections — which sections a listing's Detail page has, in
 * its category's reading order (`categoryPresentation.js`), with the label
 * the in-page navigation shows. A section is present only when the listing
 * has real content for it — never an empty decorative shell. The facts and
 * rules sections are decided by the same resolvers that render them
 * (`listingFactGroups.js`, `listingRules.js`), so a navigation link never
 * points at a section that shows nothing.
 *
 * Always present: Reviews (with an honest "No reviews yet" when there are
 * none) and Availability (a status the navigation does not link to).
 */

import { reorderSections } from './categoryPresentation.js';
import { resolveSectionHeadingKey } from './listingSectionHeadings.js';
import { resolveAmenityFeatureGroups } from './resolveAmenityFeatureGroups.js';

export const SECTION_IDS = Object.freeze({
  ABOUT: 'about',
  ROOMS: 'rooms',
  ITINERARY: 'itinerary',
  INCLUDED: 'included',
  GUEST_NOTES: 'guestNotes',
  MEETING: 'meeting',
  ATTRIBUTES: 'attributes',
  AMENITIES: 'amenities',
  POLICIES: 'policies',
  AVAILABILITY: 'availability',
  LOCATION: 'location',
  REVIEWS: 'reviews',
  PARTNER: 'partner',
  FAQ: 'faq',
  MENU: 'menu',
  OPENING_HOURS: 'openingHours',
});

// A status next to the facts it qualifies, not a destination.
const UNLISTED = new Set([SECTION_IDS.AVAILABILITY]);

/**
 * @returns {{ordered: Array<{id: string, label: string}>, navigable: Array<{id: string, label: string}>, headingKey: (section: string) => string}}
 */
export function buildListingDetailSections({
  listing,
  metadata,
  content,
  description,
  units,
  menus,
  weeklyHours,
  factGroups,
  rules,
  categoryVisualKey,
  t,
}) {
  const headingKey = (section) =>
    resolveSectionHeadingKey(categoryVisualKey, section);
  const hasHotelRooms = (units ?? []).some(
    (unit) => unit.bookable_unit_type === 'HOTEL_ROOM',
  );
  const hasAmenities =
    resolveAmenityFeatureGroups(
      metadata?.amenity_groups,
      listing.amenity_ids,
      t,
    ).length > 0;

  const candidates = [
    description && [SECTION_IDS.ABOUT, t('pages.listingDetail.about.heading')],
    hasHotelRooms && [
      SECTION_IDS.ROOMS,
      t('pages.listingDetail.rooms.heading'),
    ],
    content.itinerarySteps.length > 0 && [
      SECTION_IDS.ITINERARY,
      t('pages.listingDetail.itinerary.heading'),
    ],
    (menus ?? []).some((menu) => menu.is_active) && [
      SECTION_IDS.MENU,
      t('pages.listingDetail.menu.heading'),
    ],
    (weeklyHours ?? []).length > 0 && [
      SECTION_IDS.OPENING_HOURS,
      t('pages.listingDetail.openingHours.heading'),
    ],
    content.includedItems.length > 0 && [
      SECTION_IDS.INCLUDED,
      t('pages.listingDetail.included.heading'),
    ],
    content.guestNotes.length > 0 && [
      SECTION_IDS.GUEST_NOTES,
      t('pages.listingDetail.guestNotes.heading'),
    ],
    factGroups.meeting.length > 0 && [
      SECTION_IDS.MEETING,
      t('pages.listingDetail.meeting.heading'),
    ],
    factGroups.attributes.length > 0 && [
      SECTION_IDS.ATTRIBUTES,
      t(headingKey('attributes')),
    ],
    hasAmenities && [SECTION_IDS.AMENITIES, t(headingKey('amenities'))],
    rules.length > 0 && [SECTION_IDS.POLICIES, t(headingKey('policies'))],
    [SECTION_IDS.AVAILABILITY, t('pages.listingDetail.availability.heading')],
    listing.location && [SECTION_IDS.LOCATION, t(headingKey('location'))],
    [SECTION_IDS.REVIEWS, t('pages.listingDetail.reviews.heading')],
    listing.company && [
      SECTION_IDS.PARTNER,
      t('pages.listingDetail.partner.heading'),
    ],
    content.faqs.length > 0 && [
      SECTION_IDS.FAQ,
      t('pages.listingDetail.faq.heading'),
    ],
  ]
    .filter(Boolean)
    .map(([id, label]) => ({ id, label }));

  const ordered = reorderSections(candidates, categoryVisualKey);
  return {
    ordered,
    navigable: ordered.filter((section) => !UNLISTED.has(section.id)),
    headingKey,
  };
}

export default buildListingDetailSections;
