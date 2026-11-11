/**
 * listingCardModel — the one place a listing summary DTO becomes what a
 * Desavii listing card shows (`components/ListingCard`). Every card surface
 * (Search, Category, Destination, Company profile, Home rails, Related
 * listings, Favorites, the account dashboard and the Search map preview)
 * builds its card through `buildListingCardModel`, so price wording, the
 * rating line, category facts and badges follow the same rules everywhere.
 *
 * Works on the flat card DTOs the API returns (`searchDto.js`
 * `toSearchResultResponse` / `toSearchMapResultResponse`,
 * `favoriteDto.js`), which share field names. Only whitelisted fields are
 * read; anything else on the object is ignored.
 *
 * Truthfulness rules (docs/LISTING_CARDS.md):
 * - price: the DTO's own amount, labelled with the listing's own pricing
 *   basis. A card price is the cheapest real rate the API knows ("From"),
 *   except a restaurant's, which is an average spend per person ("Avg.").
 *   No amount → "Price not listed"; never an invented figure.
 * - rating: the approved-review average (one decimal) and count, only with
 *   at least one approved review; otherwise `null`, which the card shows
 *   as an honest "No reviews yet" — never a 0.0 or empty stars.
 * - "Top guest rating": an average of at least `TOP_RATING_MIN` from at
 *   least `TOP_RATING_MIN_REVIEWS` approved reviews — the top step of the
 *   Search guest-rating filter, with enough reviews to mean something.
 * - facts: up to `CARD_FACT_LIMIT` values the listing really has, in its
 *   category's own priority order (`listingCardFacts.js`).
 */

import { buildCategoryCardMeta } from './buildCategoryCardMeta.js';

/** The Search guest-rating filter's highest step ("4.5 or better"). */
export const TOP_RATING_MIN = 4.5;
/** Fewest approved reviews behind a "Top guest rating" label. */
export const TOP_RATING_MIN_REVIEWS = 3;

const RATING_DIGITS = 1;

/** An approved-review rating worth showing: at least one review and a real average. */
export function resolveCardRating(dto) {
  const count = Number(dto.review_count) || 0;
  const average = Number(dto.rating_average);
  if (count < 1 || dto.rating_average == null || !Number.isFinite(average)) {
    return null;
  }
  return { average: average.toFixed(RATING_DIGITS), count };
}

/** The objective "Top guest rating" rule (see the file header). */
export function isTopRated(dto) {
  const rating = resolveCardRating(dto);
  return (
    rating !== null &&
    Number(dto.rating_average) >= TOP_RATING_MIN &&
    rating.count >= TOP_RATING_MIN_REVIEWS
  );
}

/**
 * Media URLs come from the API, but a card still only renders a same-origin
 * path or an http(s) URL — never `javascript:`, `data:` or a malformed value.
 */
export function safeMediaUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const value = url.trim();
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/**
 * The card price: `null` when the listing has no listed amount. `lead` is
 * the word before the amount ('from' | 'average'); `basisLabel` the unit
 * after it ("/ night", "/ person"), or null when the basis is unknown.
 */
export function resolveCardPrice(dto, priceUnitKey, t) {
  if (dto.price_amount == null || dto.price_amount === '') return null;
  const amount = Number(dto.price_amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  // An amount without its currency is not a price anyone can read: the
  // card says "not listed" rather than guessing a currency.
  if (typeof dto.price_currency_code !== 'string' || !dto.price_currency_code) {
    return null;
  }
  // A restaurant's reservation is free; its amount is the average spend
  // per person, never a "from" booking price.
  const isRestaurant = dto.listing_type === 'RESTAURANT';
  return {
    amount: dto.price_amount,
    currencyCode: dto.price_currency_code,
    lead: isRestaurant ? 'average' : 'from',
    basisLabel: priceUnitKey
      ? t(`search.card.priceUnit.${priceUnitKey}`)
      : null,
  };
}

/**
 * @param {object} dto - a flat listing card DTO (see the file header).
 * @param {Function} t - i18next `t`.
 * @param {{ href: string }} options - the card's destination.
 */
export function buildListingCardModel(dto, t, { href }) {
  const { categoryVisualKey, facts, priceUnitKey } = buildCategoryCardMeta(
    dto,
    t,
  );
  const title = typeof dto.title === 'string' ? dto.title.trim() : '';
  return {
    href,
    title: title || t('listingCard.untitled'),
    // The precise category ("Villa", "Entertainment"), not the coarse
    // listing type ("Property", "Attraction") several categories share.
    typeLabel: t(`listingCard.category.${categoryVisualKey}`, {
      defaultValue: t(`listings.type.${dto.listing_type}`, {
        defaultValue: dto.listing_type ?? '',
      }),
    }),
    cityName: dto.city_name || null,
    imageUrl: safeMediaUrl(dto.cover_image_url),
    mediaCount: Number(dto.media_count) || 0,
    facts,
    rating: resolveCardRating(dto),
    topRated: isTopRated(dto),
    price: resolveCardPrice(dto, priceUnitKey, t),
    categoryVisualKey,
    artSeed: dto.id ?? title,
  };
}
