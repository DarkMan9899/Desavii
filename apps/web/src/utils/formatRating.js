/**
 * formatRating — a guest rating as the visitor's language writes it: one
 * decimal through the shared Armenian-safe number formatter
 * (`createNumberFormatter`), so "4.5" reads "4,5" in Armenian and Russian,
 * and the accessible name of a star rating ("Rated 4,5 out of 5 from 12
 * reviews") in the page language instead of the UI package's English
 * default.
 */

import { createNumberFormatter } from '@desavii/ui/utils/numberFormat';

const RATING_FRACTION_DIGITS = 1;

/** "4.5" / "4,5" — always one decimal, rounded. */
export function formatRatingAverage(value, locale) {
  return createNumberFormatter(locale, {
    minimumFractionDigits: RATING_FRACTION_DIGITS,
    maximumFractionDigits: RATING_FRACTION_DIGITS,
  }).format(value);
}

/**
 * The accessible name for `RatingStars`, with or without a review count.
 *
 * @param {Function} t - i18next `t`
 * @param {string} locale - `i18n.language`
 * @param {number} value - 0..5
 * @param {number} [reviewCount]
 */
export function ratingLabel(t, locale, value, reviewCount = undefined) {
  const rating = formatRatingAverage(value, locale);
  return reviewCount === undefined
    ? t('rating.label', { rating })
    : t('rating.labelWithCount', { rating, count: reviewCount });
}
