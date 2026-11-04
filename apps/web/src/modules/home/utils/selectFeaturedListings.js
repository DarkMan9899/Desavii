/**
 * selectFeaturedListings — what Home's featured rail shows, and why each
 * card is there. Every card is a real published listing, shown once; the
 * reason travels with it so the card can say it truthfully.
 *
 * 1. `promoted` — the active Home placements (`GET /advertising/public/
 *    home-featured`), in promotion order. They always come first and
 *    always carry the TOP badge; when there are at least
 *    `FEATURED_RAIL_SIZE` of them, nothing else is added.
 * 2. `rated` — "Top guest rating": an approved-review average of at least
 *    `TOP_RATING_MIN` from at least `TOP_RATING_MIN_REVIEWS` approved
 *    reviews, best average first (`GET /search?sort=rating_desc`). 4.5 is
 *    the highest "N or better" step of the Search page's own guest-rating
 *    filter; the review minimum keeps one or two reviews from earning the
 *    label. The card shows the exact average and count, so the claim can
 *    be checked. Nothing here measures popularity.
 * 3. `newest` — the newest listing of each category the rail does not
 *    show yet, from the same response (its tie order is newest first), so
 *    the rail spans the catalogue instead of repeating one vertical.
 *
 * Steps 2–3 only fill the rail up to `FEATURED_RAIL_SIZE`; they never
 * displace a promotion, never repeat a listing and never invent one. With
 * no candidates the rail is just the promotions — possibly one card.
 */

export const FEATURED_RAIL_SIZE = 8;

export const FEATURED_SOURCES = Object.freeze({
  PROMOTED: 'promoted',
  RATED: 'rated',
  NEWEST: 'newest',
});

/** The Search guest-rating filter's highest step ("4.5 or better"). */
export const TOP_RATING_MIN = 4.5;
/** Fewest approved reviews behind a "Top guest rating" label. */
export const TOP_RATING_MIN_REVIEWS = 3;

const isTopRated = (listing) =>
  listing.rating_average != null &&
  Number(listing.rating_average) >= TOP_RATING_MIN &&
  Number(listing.review_count) >= TOP_RATING_MIN_REVIEWS;

/**
 * @param {object[]} promoted - active Home promotions, in order.
 * @param {object[]} candidates - `sort=rating_desc` search results.
 * @param {number} [size]
 * @returns {{listing: object, source: string}[]}
 */
export function selectFeaturedListings(
  promoted,
  candidates,
  size = FEATURED_RAIL_SIZE,
) {
  const picked = [];
  const seen = new Set();
  const add = (listing, source) => {
    if (seen.has(listing.id)) return;
    seen.add(listing.id);
    picked.push({ listing, source });
  };

  promoted.forEach((listing) => add(listing, FEATURED_SOURCES.PROMOTED));
  if (picked.length >= size) return picked;

  candidates
    .filter(isTopRated)
    .forEach(
      (listing) => picked.length < size && add(listing, FEATURED_SOURCES.RATED),
    );

  const shownTypes = new Set(picked.map(({ listing }) => listing.listing_type));
  candidates.forEach((listing) => {
    if (picked.length >= size || shownTypes.has(listing.listing_type)) return;
    shownTypes.add(listing.listing_type);
    add(listing, FEATURED_SOURCES.NEWEST);
  });

  return picked;
}

/** True when promotions alone cannot fill the rail (the fill query runs). */
export const needsFeaturedFill = (promotedCount, size = FEATURED_RAIL_SIZE) =>
  promotedCount < size;
