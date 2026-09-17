/**
 * buildCategoryCardMeta — the shared "flat listing-summary row -> card
 * metadata" logic, extracted from `SearchResultCard.jsx` during the
 * Favorites card-composition-closure fix so a second caller
 * (`FavoritesPageContent.jsx`) never has to reimplement the 9-category
 * chip-building switch itself. Lives in dependency-free top-level
 * `utils/` (alongside `categoryCardConfig.js`) for the same reason that
 * file does: `modules/search` already depends on `modules/favorites`
 * (`SearchResultCard` renders `FavoriteButton`), so `modules/favorites`
 * importing anything from `modules/search` would close a real import
 * cycle — a shared helper both can reach needs to sit outside either
 * module.
 *
 * Works against any flat row shape that carries the same fields
 * `mysqlSearchRepository.js`'s `CARD_METADATA_SELECT` mechanism
 * produces (`category_slug`, `cuisine`, `price_tier`, `star_rating`,
 * `transmission`, `bedrooms`, `duration_minutes`) — both `searchDto.js`
 * and `favoriteDto.js` return exactly this shape.
 */

import { Star, BedDouble, Clock, Settings2, Utensils } from 'lucide-react';
import { resolveCardConfig } from './categoryCardConfig.js';

/**
 * One real "headline" metadata fact per category — see
 * `mysqlSearchRepository.js`'s `CARD_METADATA_SELECT` for the backing
 * fields. Each entry is `null` whenever the attribute was never
 * authored for that listing — this function only ever renders what's
 * actually there, never a fabricated default.
 */
function buildHeadlineChip(result, categoryVisualKey, t) {
  switch (categoryVisualKey) {
    case 'hotels':
      return result.star_rating
        ? {
            key: 'headline-star-rating',
            icon: Star,
            label: t('search.card.starRating', {
              count: Number(result.star_rating),
            }),
          }
        : null;
    case 'apartments':
    case 'villas':
    case 'guest-houses':
      return result.bedrooms
        ? {
            key: 'headline-bedrooms',
            icon: BedDouble,
            label: t('search.card.bedroomsCount', { count: result.bedrooms }),
          }
        : null;
    case 'tours':
    case 'attractions':
    case 'entertainment-venues': {
      if (!result.duration_minutes) return null;
      const hours = Math.floor(result.duration_minutes / 60);
      const label =
        hours >= 1 && result.duration_minutes % 60 === 0
          ? t('search.card.durationHours', { count: hours })
          : t('search.card.durationMinutes', {
              count: result.duration_minutes,
            });
      return { key: 'headline-duration', icon: Clock, label };
    }
    case 'car-rentals':
      return result.transmission
        ? {
            key: 'headline-transmission',
            icon: Settings2,
            label: t(
              `search.dynamicFilters.options.${result.transmission}`,
              result.transmission,
            ),
          }
        : null;
    default:
      return null;
  }
}

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
 * @returns {{categoryVisualKey: string|undefined, cardConfig: object, metaChips: Array, priceSuffix: string|null}}
 */
export function buildCategoryCardMeta(result, t) {
  const categoryVisualKey = resolveCategoryVisualKey(result);
  const cardConfig = resolveCardConfig(categoryVisualKey);
  const headlineChip = buildHeadlineChip(result, categoryVisualKey, t);
  const metaChips = [
    ...(headlineChip ? [headlineChip] : []),
    ...(result.cuisine ?? []).map((code) => ({
      key: `cuisine-${code}`,
      icon: Utensils,
      label: t(`search.dynamicFilters.options.${code}`, code),
    })),
    ...(result.price_tier
      ? [
          {
            key: `price-tier-${result.price_tier}`,
            label: t(
              `search.dynamicFilters.options.${result.price_tier}`,
              result.price_tier,
            ),
          },
        ]
      : []),
  ];
  const priceSuffix = cardConfig.priceUnitKey
    ? t(`search.card.priceUnit.${cardConfig.priceUnitKey}`)
    : null;

  return { categoryVisualKey, cardConfig, metaChips, priceSuffix };
}

export default { resolveCategoryVisualKey, buildCategoryCardMeta };
