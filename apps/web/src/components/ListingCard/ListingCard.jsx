/**
 * ListingCard — the one Desavii listing card (docs/LISTING_CARDS.md). Every
 * listing card surface renders it from a `buildListingCardModel` model:
 * Search results, Category and Destination pages, Company profiles, the
 * Home rails, Related listings, Favorites, the account dashboard and the
 * Search map preview.
 *
 * Two layouts, both the same card:
 * - `grid` (default): image first at the locked 4:3 ratio (with the badge
 *   and favourite), then the decision layer in the order a traveller reads
 *   it — the title in the display face, category · city, the rating with
 *   its approved-review count (or an honest "No reviews yet"), up to three
 *   real category facts, and a footer with the price and a ringed arrow
 *   cue. Rails only set the width; the card never changes shape for a
 *   context.
 * - `compact`: a horizontal summary (the map preview), image beside text,
 *   with the two most decisive facts.
 *
 * Semantics: an `<article>` named by its title. The title's link is the
 * card's one link and stretches over the whole card (click anywhere,
 * middle-click / new tab, one tab stop, an accessible name that is just the
 * title); the favourite button sits above it, outside the link, so the two
 * never nest. With `ctaLabel` (the map preview, where the action is spelled
 * out) the footer link is the one link instead. A badge says why the card is special (TOP placement, top
 * guest rating, new) and nothing else.
 *
 * Takes resolved values, never a DTO, and renders text as text: no HTML is
 * ever injected, and `imageUrl` has already been through `safeMediaUrl`.
 */

import { forwardRef, useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Images } from 'lucide-react';
import DestinationArt from '../DestinationArt/DestinationArt.jsx';
import ListingPrice, {
  listingPriceShape,
} from '../ListingPrice/ListingPrice.jsx';
import ListingRating, {
  listingRatingShape,
} from '../ListingRating/ListingRating.jsx';
import styles from './ListingCard.module.scss';

export const BADGE_TONES = Object.freeze(['top', 'accent', 'neutral']);

/** Between category and city for a screen reader; the dot is drawn. */
const SPOKEN_PLACE_SEPARATOR = ', ';

/** The map preview's narrow text column fits two facts. */
const COMPACT_FACT_LIMIT = 2;

const ListingCard = forwardRef(function ListingCard(
  {
    href,
    title,
    typeLabel,
    cityName = null,
    locationNote = null,
    imageUrl = null,
    mediaCount = 0,
    facts = [],
    rating = null,
    price = null,
    badge = null,
    favoriteButton = null,
    locale = undefined,
    categoryVisualKey = undefined,
    artSeed = undefined,
    priorityImage = false,
    layout = 'grid',
    headingLevel = 3,
    onClick = undefined,
    ctaLabel = null,
    titleId: titleIdProp = undefined,
  },
  ref,
) {
  const { t } = useTranslation();
  const ownTitleId = useId();
  const titleId = titleIdProp ?? ownTitleId;
  const [imageFailed, setImageFailed] = useState(false);
  const Heading = `h${headingLevel}`;
  const visibleFacts =
    layout === 'compact' ? facts.slice(0, COMPACT_FACT_LIMIT) : facts;

  return (
    <article
      ref={ref}
      className={[styles.card, styles[`card--${layout}`]].join(' ')}
      aria-labelledby={titleId}
      data-category={categoryVisualKey}
      data-badge={badge?.tone}
    >
      <div className={styles.media}>
        {imageUrl && !imageFailed ? (
          <img
            className={styles.image}
            src={imageUrl}
            alt=""
            loading={priorityImage ? 'eager' : 'lazy'}
            decoding="async"
            // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime does not map the camelCase `fetchPriority`; the lowercase attribute passes straight through.
            fetchpriority={priorityImage ? 'high' : undefined}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <DestinationArt seed={artSeed ?? title} className={styles.image} />
        )}
        {badge && (
          <span
            className={[styles.badge, styles[`badge--${badge.tone}`]].join(' ')}
          >
            {badge.label}
            {badge.description && (
              <span className={styles.visuallyHidden}>{badge.description}</span>
            )}
          </span>
        )}
        {favoriteButton && (
          <span className={styles.favorite}>{favoriteButton}</span>
        )}
        {mediaCount > 1 && layout === 'grid' && (
          <span className={styles.gallery}>
            <Images size={14} aria-hidden="true" />
            <span aria-hidden="true">{mediaCount}</span>
            <span className={styles.visuallyHidden}>
              {t('listingCard.photos', { count: mediaCount })}
            </span>
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.heading}>
          {ctaLabel ? (
            // An explicit action instead of a whole-card link: the title is
            // plain text, focusable for the container that opens the card.
            <Heading id={titleId} className={styles.title} tabIndex={-1}>
              {title}
            </Heading>
          ) : (
            <Heading id={titleId} className={styles.title}>
              <Link className={styles.link} to={href} onClick={onClick}>
                {title}
              </Link>
            </Heading>
          )}
          <p className={styles.place}>
            <span>{typeLabel}</span>
            {cityName && (
              <>
                <span aria-hidden="true" className={styles.dot} />
                {/* Spoken as "Hotel, Yerevan"; the dot is only drawn. */}
                <span className={styles.visuallyHidden}>
                  {SPOKEN_PLACE_SEPARATOR}
                </span>
                <span>{cityName}</span>
              </>
            )}
            {locationNote && (
              <span className={styles.placeNote}>{locationNote}</span>
            )}
          </p>
        </div>
        <p className={styles.rating}>
          <ListingRating rating={rating} />
        </p>

        {visibleFacts.length > 0 && (
          <ul className={styles.facts}>
            {visibleFacts.map((fact) => (
              <li key={fact.key} className={styles.fact}>
                {fact.icon && (
                  <fact.icon
                    size={14}
                    aria-hidden="true"
                    className={styles.factIcon}
                  />
                )}
                <span>{fact.label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.footer}>
          <ListingPrice price={price} locale={locale} />
          {ctaLabel ? (
            <Link className={styles.cta} to={href} onClick={onClick}>
              {ctaLabel}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <span className={styles.cue} aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
});

/* eslint-disable react/require-default-props -- defaults live in the
   forwardRef render function's destructuring (same precedent as
   `@desavii/ui`'s Input.jsx). */
ListingCard.propTypes = {
  href: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  typeLabel: PropTypes.string.isRequired,
  cityName: PropTypes.string,
  /** A short qualifier after the city, e.g. "approximate location". */
  locationNote: PropTypes.string,
  imageUrl: PropTypes.string,
  mediaCount: PropTypes.number,
  facts: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.node.isRequired,
      icon: PropTypes.elementType,
    }),
  ),
  rating: listingRatingShape,
  price: listingPriceShape,
  badge: PropTypes.shape({
    tone: PropTypes.oneOf(BADGE_TONES).isRequired,
    label: PropTypes.string.isRequired,
    /** Spoken after the label, e.g. "(promoted listing)". */
    description: PropTypes.string,
  }),
  favoriteButton: PropTypes.node,
  locale: PropTypes.string,
  categoryVisualKey: PropTypes.string,
  artSeed: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  priorityImage: PropTypes.bool,
  layout: PropTypes.oneOf(['grid', 'compact']),
  headingLevel: PropTypes.oneOf([2, 3, 4]),
  onClick: PropTypes.func,
  /** An explicit action link (map preview); the title is then not a link. */
  ctaLabel: PropTypes.string,
  /** Use a given id for the title (a container that labels/focuses it). */
  titleId: PropTypes.string,
};
/* eslint-enable react/require-default-props */

export default ListingCard;
