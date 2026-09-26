/**
 * Maximum lengths of Partner-entered listing text — mirrors the backend
 * validators exactly (each of which already matches its DB column), so a
 * field's `maxLength` never claims a different limit than the API enforces.
 */

// listingValidators.js translationSchema (listing_translations).
export const LISTING_TITLE_MAX_LENGTH = 255;
export const LISTING_SUMMARY_MAX_LENGTH = 500;
export const LISTING_DESCRIPTION_MAX_LENGTH = 20000;

// listingValidators.js attribute/policy values
// (listing_attribute_values_string.value, listing_policy_values.value).
export const METADATA_TEXT_VALUE_MAX_LENGTH = 255;

// listingValidators.js rich-content schemas (migration 0026).
export const HIGHLIGHT_TEXT_MAX_LENGTH = 150;
export const ITINERARY_TITLE_MAX_LENGTH = 150;
export const ITINERARY_DESCRIPTION_MAX_LENGTH = 2000;
export const INCLUDED_ITEM_TEXT_MAX_LENGTH = 200;
export const FAQ_QUESTION_MAX_LENGTH = 255;
export const FAQ_ANSWER_MAX_LENGTH = 2000;

// restaurantMenuValidators.js (migration 0045).
export const MENU_NAME_MAX_LENGTH = 150;
export const MENU_DESCRIPTION_MAX_LENGTH = 2000;
export const MENU_SECTION_TITLE_MAX_LENGTH = 150;
export const MENU_ITEM_TITLE_MAX_LENGTH = 150;
export const MENU_ITEM_DESCRIPTION_MAX_LENGTH = 1000;
