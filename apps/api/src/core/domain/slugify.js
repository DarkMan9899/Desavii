/**
 * Pure slug-generation function shared by any module that needs a
 * URL-safe identifier derived from free text (Listings first; Partners
 * will reuse this once that module is implemented — `partners.slug`
 * already exists in the schema, migration 0003).
 *
 * Domain layer (`core` may depend only on `core`) — no database access,
 * no uniqueness check (that is a Repository/Service concern, since it
 * requires a database read).
 */

export const MAX_SLUG_LENGTH = 180; // matches listings.slug / partners.slug column width

// Combining diacritical marks (U+0300-U+036F) left behind after NFD
// normalization splits an accented character into base + mark.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(text, { maxLength = MAX_SLUG_LENGTH } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('slugify() requires a string input.');
  }

  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, ''); // trim a hyphen exposed by truncation
}

export default slugify;
