/**
 * SearchResultCard — one `GET /search` result. Search's own DTO
 * (`apps/api/src/modules/search/dto/searchDto.js`) already returns a
 * flat, pre-localized card shape (`title`, `summary`, `cover_image_url`,
 * `city_name`) with no per-row follow-up call needed — this is why every
 * "browse a list of listings" surface in the app (search results,
 * related listings, the Home page's Featured Listings, a partner's own
 * listing management table) renders through this component/DTO rather
 * than a nested full-listing shape that would need one `GET
 * /listings/:id` per row to populate.
 *
 * Phase 12 (Product Polish): rebuilt on the shared `ListingCardBase`
 * (`components/ListingCardBase`) — the near-identical media/badge/title/
 * price markup this file used to restate independently now lives in one
 * place; this file's own job is purely extracting search's flat DTO into
 * `ListingCardBase`'s prop contract, plus the one genuinely
 * search-specific piece (the city/location line).
 * `rating_average`/`review_count` are additive DTO fields backed by the
 * Reviews module, rendered only when `review_count > 0`.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import ListingCardBase from '../../../../components/ListingCardBase/ListingCardBase.jsx';
import { FavoriteButton } from '../../../favorites/index.js';
import styles from './SearchResultCard.module.scss';

/**
 * P2.2D: carries the customer's own search selections forward into the
 * listing detail URL — `ListingReservationWidget` reads these same three
 * keys to prefill its date range/guest count (see
 * `reservationSearchContext.js`). Reads straight from this page's own
 * URL rather than threading new props through `SearchResults`/
 * `SearchPageContent`, since the search filters already ARE this page's
 * query params. Omits a key entirely when absent (a plain
 * `/listings/:id` visit, or a keyword-only search with no dates, stays a
 * bare URL — never a "?dateFrom=null"-style artifact).
 */
function buildSearchContextQuery(searchParams) {
  const query = new URLSearchParams();
  ['dateFrom', 'dateTo', 'guests'].forEach((key) => {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export default function SearchResultCard({
  result,
  hideTypeBadge = false,
  priorityImage = false,
  // Sprint E: set by a caller rendering a Home Featured/Category TOP
  // section — those endpoints only ever return actively promoted
  // listings, so the caller already knows the context; no per-row
  // "is promoted" field is needed from the backend for this.
  topBadgeLabel = undefined,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [searchParams] = useSearchParams();
  const typeLabel = t(`listings.type.${result.listing_type}`, {
    defaultValue: result.listing_type,
  });

  return (
    <ListingCardBase
      href={`/${locale}/listings/${result.slug ?? result.id}${buildSearchContextQuery(searchParams)}`}
      ariaLabel={t('search.card.viewDetails', { title: result.title })}
      imageUrl={result.cover_image_url}
      typeLabel={typeLabel}
      hideTypeBadge={hideTypeBadge}
      favoriteButton={<FavoriteButton listingId={result.id} />}
      galleryCount={result.media_count}
      title={result.title}
      location={
        result.city_name && (
          <p className={styles.location}>
            <MapPin size={14} aria-hidden="true" />
            {result.city_name}
          </p>
        )
      }
      summary={result.summary}
      ratingAverage={result.rating_average}
      reviewCount={result.review_count}
      priceAmount={result.price_amount}
      priceCurrencyCode={result.price_currency_code}
      // P2.2D: search's own price is always the cheapest currently known
      // rate (a per-listing MIN across real bookable-unit prices, or the
      // legacy listing-level fallback) — never a promise that every unit
      // costs exactly this, so every search-card price is labeled "from",
      // matching how it's actually computed rather than implying an
      // exact, guaranteed rate.
      pricePrefix={t('search.card.fromPrice')}
      locale={locale}
      priorityImage={priorityImage}
      topBadgeLabel={topBadgeLabel}
    />
  );
}

SearchResultCard.propTypes = {
  // Real `GET /search` row shape (FRONTEND_ARCHITECTURE.md §10.8's
  // normalized-but-untyped response), not a hand-authored prop contract.
  // eslint-disable-next-line react/forbid-prop-types
  result: PropTypes.object.isRequired,
  hideTypeBadge: PropTypes.bool,
  priorityImage: PropTypes.bool,
  topBadgeLabel: PropTypes.string,
};
