/**
 * buildCategoryCardMeta — the shared "flat listing card DTO -> card
 * metadata" step: the category, its real facts (`listingCardFacts.js`) and
 * the price basis. Lives in dependency-free top-level `utils/` (alongside
 * `categoryCardConfig.js`) because `modules/search` already depends on
 * `modules/favorites` (`SearchResultCard` renders `FavoriteButton`), so a
 * helper both reach must sit outside either module.
 *
 * Works against the flat card DTOs the API returns (`searchDto.js`,
 * `favoriteDto.js`, `partnerDto.js`), which share the card-facts fields
 * (`listingCardFactsDto.js`).
 */

import { resolveCardConfig } from './categoryCardConfig.js';
import { resolvePricingModelBasis } from './pricingModelBasis.js';
import { resolveCardFacts } from './listingCardFacts.js';

/**
 * @param {string|null|undefined} result.category_slug
 * @param {string|null|undefined} result.listing_type
 * @returns {string|undefined} the real category slug, falling back to
 *   the coarser `listing_type` for a row shape that predates the field.
 */
export function resolveCategoryVisualKey(result) {
  return result.category_slug ?? result.listing_type?.toLowerCase();
}

/**
 * @returns {{categoryVisualKey: string|undefined, facts: Array, priceUnitKey: string|null}}
 */
export function buildCategoryCardMeta(result, t) {
  const categoryVisualKey = resolveCategoryVisualKey(result);
  const facts = resolveCardFacts(result, categoryVisualKey, t);
  // Step L6.2H1: the listing's own pricing model decides the price basis
  // (the same one its detail page shows); the category default only covers
  // a row with no listing-level pricing model. A model with no basis
  // (legacy PER_HOUR) shows the price without one. How the amount is
  // worded (e.g. a restaurant's average spend) is the card model's job
  // (`listingCardModel.js`).
  const priceUnitKey = result.pricing_model
    ? resolvePricingModelBasis(result.pricing_model)
    : resolveCardConfig(categoryVisualKey).priceUnitKey;

  return { categoryVisualKey, facts, priceUnitKey };
}

export default { resolveCategoryVisualKey, buildCategoryCardMeta };
