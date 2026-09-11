/**
 * ListingCardBase — Phase 12 (Product Polish): the shared visual
 * structure `modules/search`'s `SearchResultCard` and `favorites`'
 * `FavoritesPageContent` row rendering each need (media block with type/
 * favorite/gallery badges, title/rating/summary/price body). Lives in
 * shared `components/` per FRONTEND_ARCHITECTURE.md §3.1/§7 ("promoted
 * once a second consumer genuinely needs it"). Phase 21 retired the
 * original second consumer, `modules/listings`' `ListingCard` (it read a
 * nested full-listing shape that required an N+1 `GET /listings/:id`
 * follow-up per row to populate — every real caller now goes through
 * `SearchResultCard`'s flat `GET /search` DTO instead, which needs no
 * follow-up call).
 *
 * Deliberately takes already-resolved primitive props (a title string, a
 * cover image URL, a numeric price), never a raw `listing`/`result`
 * domain object — each caller's source DTO shape differs, and reshaping
 * into a single object contract would mean inventing fields to satisfy a
 * prop contract that doesn't match the source. Each caller still owns
 * its own data extraction; this component only owns the shared markup/
 * styling.
 *
 * Takes a `favoriteButton` node rather than importing `FavoriteButton`
 * itself: shared top-level `components/` may never import from a
 * `modules/*` directory (FRONTEND_ARCHITECTURE.md's layering rule,
 * `eslint-plugin-boundaries`-enforced) — and `favorites`' own barrel
 * also exports `FavoritesPageContent`, which itself reuses this exact
 * component, so importing `FavoriteButton` here would close a real
 * `search -> ListingCardBase -> favorites -> FavoritesPageContent ->
 * ListingCardBase` cycle. Each caller (`SearchResultCard`,
 * `FavoritesPageContent`'s own row rendering) renders its own
 * `<FavoriteButton listingId={...} />` and passes it down instead.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Images } from 'lucide-react';
import { Card, Badge, Icon } from '@desavii/ui/components/primitives';
import { PriceTag, RatingStars } from '@desavii/ui/components/data-display';
import RouterLink from '../RouterLink.jsx';
import DestinationArt from '../DestinationArt/DestinationArt.jsx';
import styles from './ListingCardBase.module.scss';

export default function ListingCardBase({
  href,
  ariaLabel = undefined,
  imageUrl = undefined,
  imageAlt = '',
  typeLabel,
  hideTypeBadge = false,
  favoriteButton = null,
  galleryCount = 0,
  title,
  location = null,
  summary = undefined,
  ratingAverage = undefined,
  reviewCount = 0,
  priceAmount = undefined,
  priceCurrencyCode = undefined,
  pricePrefix = null,
  locale = undefined,
  artSeed = undefined,
  priorityImage = false,
  // Sprint E (Promotion Engine): an active Home/Category promotion's
  // card gets this label — bottom-left, the one media-block corner
  // `typeBadge`/`favoriteButton`/`galleryBadge` don't already use. Text-
  // labeled (never a bare color swatch), so it reads correctly without
  // relying on color alone.
  topBadgeLabel = undefined,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  // A real photo (unlike the inline demo SVGs) has a visible network
  // fetch — fading it in on `onLoad` avoids a pop-in flash once it
  // arrives, rather than the browser's default abrupt paint.
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <Card
      as={RouterLink}
      href={href}
      padding="none"
      interactive
      elevated
      className={styles.card}
      aria-label={ariaLabel}
    >
      <div className={styles.media}>
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            // `priorityImage` renders at full opacity immediately — this
            // is the page's likely LCP element (see the comment below),
            // and an opacity:0 start would risk delaying when it counts
            // as painted for that metric. The fade-in is for every other,
            // lazily-loaded card only.
            className={[
              styles.image,
              (priorityImage || imageLoaded) && styles.imageLoaded,
            ]
              .filter(Boolean)
              .join(' ')}
            // 2026 SEO/performance audit: real Lighthouse trace evidence
            // (largest-contentful-paint-element + lcp-lazy-loaded audits)
            // identified the FIRST card's image as the actual LCP element
            // on Category pages, unconditionally lazy-loaded — Load Delay
            // alone was 70% of a 4.7s LCP. `priorityImage` lets the one
            // caller who knows it's rendering the first/likely-LCP card
            // (a grid's own index === 0) opt out of the default lazy
            // behavior; every other card is unaffected.
            loading={priorityImage ? 'eager' : 'lazy'}
            // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime doesn't yet know the camelCase `fetchPriority` DOM-property mapping; the lowercase spelling passes straight through as the real HTML attribute browsers read.
            fetchpriority={priorityImage ? 'high' : undefined}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <DestinationArt
            seed={artSeed ?? title}
            className={styles.imagePlaceholder}
          />
        )}
        {!hideTypeBadge && (
          <span className={styles.typeBadge}>
            <Badge variant="info" label={typeLabel} size="sm" />
          </span>
        )}
        {favoriteButton && (
          <span className={styles.favoriteButton}>{favoriteButton}</span>
        )}
        {galleryCount > 1 && (
          <span className={styles.galleryBadge}>
            <Icon icon={Images} size="sm" />
            {galleryCount}
          </span>
        )}
        {topBadgeLabel && (
          <span className={styles.topBadge}>
            <Badge variant="warning" label={topBadgeLabel} size="sm" />
          </span>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {reviewCount > 0 && (
          <RatingStars
            value={ratingAverage}
            reviewCount={reviewCount}
            size="sm"
          />
        )}
        {location}
        {summary && <p className={styles.summary}>{summary}</p>}
        {priceAmount && (
          <span className={styles.priceRow}>
            {pricePrefix && (
              <span className={styles.pricePrefix}>{pricePrefix}</span>
            )}
            <PriceTag
              amount={priceAmount}
              currencyCode={priceCurrencyCode}
              locale={locale}
              size="md"
            />
          </span>
        )}
      </div>
    </Card>
  );
}

ListingCardBase.propTypes = {
  href: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string,
  imageUrl: PropTypes.string,
  imageAlt: PropTypes.string,
  typeLabel: PropTypes.string.isRequired,
  hideTypeBadge: PropTypes.bool,
  favoriteButton: PropTypes.node,
  galleryCount: PropTypes.number,
  title: PropTypes.node.isRequired,
  location: PropTypes.node,
  summary: PropTypes.string,
  ratingAverage: PropTypes.number,
  reviewCount: PropTypes.number,
  priceAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  priceCurrencyCode: PropTypes.string,
  pricePrefix: PropTypes.node,
  locale: PropTypes.string,
  artSeed: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  priorityImage: PropTypes.bool,
  topBadgeLabel: PropTypes.string,
};
