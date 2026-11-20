/**
 * RatingStars — COMPONENT_LIBRARY.md Part II §5 "Rating".
 *
 * Display mode only (no `onChange`/interactive input mode — no
 * consumer in this codebase collects a rating through this primitive
 * yet; review submission uses its own control). Rendered as a single
 * `role="img"` with a full "X out of 5 stars, Y reviews" accessible
 * name, per the spec's explicit "never five separate unlabeled icons"
 * rule.
 *
 * The rating is written by the shared Armenian-safe number formatter in
 * `locale` ("4.5", "4,5"). The accessible name comes from the caller in the
 * page language (`label`); the English composition below is only this
 * package's no-locale default, as `PriceTag`'s `locale` defaults to `en`.
 */

import PropTypes from 'prop-types';
import { createNumberFormatter } from '../../../utils/numberFormat.js';
import styles from './RatingStars.module.scss';

const RATING_FRACTION_DIGITS = 1;

const SIZES = ['sm', 'md', 'lg'];

function StarIcon({ fillFraction }) {
  const gradientId = `rating-star-fill-${Math.round(fillFraction * 100)}`;
  return (
    <svg
      viewBox="0 0 20 20"
      className={styles.star}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${fillFraction * 100}%`} stopColor="currentColor" />
          <stop offset={`${fillFraction * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.77l-5.18 2.67.99-5.77-4.19-4.08 5.79-.84L10 1.5z"
        fill={`url(#${gradientId})`}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
StarIcon.propTypes = { fillFraction: PropTypes.number.isRequired };

export default function RatingStars({
  value,
  reviewCount = undefined,
  size = 'md',
  showCount = true,
  locale = 'en',
  label = undefined,
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const rounded = createNumberFormatter(locale, {
    minimumFractionDigits: RATING_FRACTION_DIGITS,
    maximumFractionDigits: RATING_FRACTION_DIGITS,
  }).format(clamped);
  const defaultLabel =
    reviewCount === undefined
      ? `${rounded} out of 5 stars`
      : `${rounded} out of 5 stars, ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`;

  const stars = Array.from({ length: 5 }, (_, index) =>
    Math.max(0, Math.min(1, clamped - index)),
  );

  return (
    <span
      role="img"
      aria-label={label ?? defaultLabel}
      className={[styles.ratingStars, styles[`ratingStars--${size}`]].join(' ')}
    >
      <span className={styles.stars} aria-hidden="true">
        {stars.map((fillFraction, index) => (
          // eslint-disable-next-line react/no-array-index-key -- five fixed star positions, never reordered
          <StarIcon key={index} fillFraction={fillFraction} />
        ))}
      </span>
      {showCount && reviewCount !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {rounded} {reviewCount > 0 && `(${reviewCount})`}
        </span>
      )}
    </span>
  );
}

RatingStars.propTypes = {
  value: PropTypes.number.isRequired,
  reviewCount: PropTypes.number,
  size: PropTypes.oneOf(SIZES),
  showCount: PropTypes.bool,
  /** BCP 47 tag (`i18n.language`) the rating is written in. */
  locale: PropTypes.string,
  /** The accessible name in the page language ("Rated 4,5 out of 5 …"). */
  label: PropTypes.string,
};

export { SIZES as RATING_STARS_SIZES };
