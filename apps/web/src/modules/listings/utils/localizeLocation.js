/**
 * localizeLocation — a listing's place in the visitor's language: the
 * city and country names from the location's `name_translations` (the API
 * returns every language it has, like `translations`), falling back to the
 * stored base names. Nothing else about the place changes — a private
 * stay's point stays the approximate one the API sent.
 *
 * @param {object|null} location - the Listing Detail `location`.
 * @param {string} locale - `hy` | `en` | `ru`.
 * @returns {object|null}
 */
export function localizeLocation(location, locale) {
  if (!location) return null;
  const names = (location.name_translations ?? []).find(
    (entry) => entry.language_code === locale,
  );
  return {
    ...location,
    city_name: names?.city_name || location.city_name,
    country_name: names?.country_name || location.country_name,
  };
}

export default localizeLocation;
