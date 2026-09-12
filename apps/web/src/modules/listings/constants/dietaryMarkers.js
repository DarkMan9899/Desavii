/**
 * `dietaryMarkers` — mirrors the backend's closed set exactly
 * (`restaurantMenuValidators.js`'s `DIETARY_MARKERS` Zod enum,
 * migration 0045's own comment: "a JSON array rather than a new lookup
 * table... i18n/display labels resolve client-side from these stable
 * codes"). Labels come from the already-existing
 * `pages.listingDetail.menu.dietaryMarkers.*` keys the public Menu
 * display uses — same concept, never a duplicate translation set.
 */

export const DIETARY_MARKERS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'spicy',
  'nuts',
];

export default DIETARY_MARKERS;
