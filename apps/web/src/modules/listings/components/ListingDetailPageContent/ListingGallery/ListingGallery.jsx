/**
 * ListingGallery — the one gallery for a listing's photos (the Detail
 * hero) and a room's photos (`RoomDetailModal`).
 *
 * `variant="hero"`:
 * - tablet and up: a mosaic whose composition follows the photo count —
 *   one photo reads as a deliberate wide frame, two as a pair, three or
 *   more as a lead photo with supporting tiles (up to five shown) — plus
 *   "Show all N photos";
 * - phone: a swipeable strip (`GalleryStrip`) with a counter;
 * - no photos: a quiet, honest "No photos yet" panel with the listing's
 *   generated art, never a broken or empty block.
 * `variant="grid"`: a compact row of thumbnails (a room's photos).
 *
 * The phone strip and the lightbox load lazily (they carry the carousel
 * library); until the strip arrives, its lead photo already shows in the
 * same 4:3 frame, so neither the LCP nor the layout waits for it.
 *
 * Every photo opens `GalleryLightbox`. Media is untrusted: only safe URLs
 * render (`toGalleryItems`). Only the lead photo loads eagerly with high
 * priority (the page's LCP); everything else loads lazily, and the small
 * room tiles load thumbnails, never full-size photos.
 */

import { lazy, Suspense, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Images } from 'lucide-react';
import DestinationArt from '../../../../../components/DestinationArt/DestinationArt.jsx';
import useMediaQuery from '../../../../../hooks/useMediaQuery.js';
import { toGalleryItems } from '../../../utils/galleryItems.js';
import styles from './ListingGallery.module.scss';

// The carousel library (Embla) loads only where it is used — the phone
// strip and an opened lightbox — never in the first-load bundle.
const GalleryStrip = lazy(() => import('./GalleryStrip.jsx'));
const GalleryLightbox = lazy(() => import('./GalleryLightbox.jsx'));

const MOSAIC_MEDIA_QUERY = '(min-width: 768px)';
/** Tiles the hero mosaic shows; "Show all" opens the rest. */
const MOSAIC_TILE_LIMIT = 5;

function Tile({ item, index, total, onOpen, isLead, useThumbnail }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={() => onOpen(index)}
      aria-label={t('pages.listingDetail.gallery.viewImage', {
        index: index + 1,
        count: total,
      })}
    >
      <img
        src={
          useThumbnail || item.type === 'VIDEO' ? item.thumbnailUrl : item.url
        }
        alt={item.alt}
        className={styles.tileMedia}
        loading={isLead ? 'eager' : 'lazy'}
        decoding="async"
        // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime does not map the camelCase `fetchPriority`; the lowercase attribute passes straight through.
        fetchpriority={isLead ? 'high' : undefined}
      />
    </button>
  );
}

Tile.propTypes = {
  item: PropTypes.shape({
    type: PropTypes.string.isRequired,
    url: PropTypes.string.isRequired,
    thumbnailUrl: PropTypes.string.isRequired,
    alt: PropTypes.string.isRequired,
  }).isRequired,
  index: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  onOpen: PropTypes.func.isRequired,
  isLead: PropTypes.bool.isRequired,
  /** Small tiles (a room's photos) load the thumbnail, never the full photo. */
  useThumbnail: PropTypes.bool.isRequired,
};

export default function ListingGallery({
  media = [],
  title,
  variant = 'grid',
  artSeed = undefined,
}) {
  const { t } = useTranslation();
  const isWide = useMediaQuery(MOSAIC_MEDIA_QUERY);
  const [openIndex, setOpenIndex] = useState(null);
  const items = toGalleryItems(media, title, t);
  const total = items.length;

  if (total === 0) {
    if (variant !== 'hero') return null;
    return (
      <div className={styles.empty}>
        <DestinationArt seed={artSeed ?? title} className={styles.emptyArt} />
        <p className={styles.emptyLabel}>
          {t('pages.listingDetail.gallery.noPhotos')}
        </p>
      </div>
    );
  }

  let body;
  if (variant === 'hero' && !isWide) {
    body = (
      <Suspense
        fallback={
          <div className={styles.stripViewport}>
            <div className={styles.stripSlide}>
              <Tile
                item={items[0]}
                index={0}
                total={total}
                onOpen={setOpenIndex}
                isLead
                useThumbnail={false}
              />
            </div>
          </div>
        }
      >
        <GalleryStrip items={items} onOpen={setOpenIndex} />
      </Suspense>
    );
  } else {
    const visible =
      variant === 'hero' ? items.slice(0, MOSAIC_TILE_LIMIT) : items;
    body = (
      <div
        className={variant === 'hero' ? styles.mosaic : styles.grid}
        data-count={visible.length}
      >
        {visible.map((item, index) => (
          <Tile
            key={item.id}
            item={item}
            index={index}
            total={total}
            onOpen={setOpenIndex}
            isLead={variant === 'hero' && index === 0}
            useThumbnail={variant !== 'hero'}
          />
        ))}
        {variant === 'hero' && total > 1 && (
          <button
            type="button"
            className={styles.showAll}
            onClick={() => setOpenIndex(0)}
          >
            <Images size={16} aria-hidden="true" />
            {t('pages.listingDetail.gallery.viewAllPhotos', { count: total })}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {body}
      {openIndex !== null && (
        <Suspense fallback={null}>
          <GalleryLightbox
            items={items}
            startIndex={openIndex}
            title={title}
            onClose={() => setOpenIndex(null)}
          />
        </Suspense>
      )}
    </>
  );
}

ListingGallery.propTypes = {
  media: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      media_type: PropTypes.string.isRequired,
      url: PropTypes.string,
      thumbnail_url: PropTypes.string,
      alt_text: PropTypes.string,
      caption: PropTypes.string,
      position: PropTypes.number,
    }),
  ),
  title: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(['hero', 'grid']),
  /** Seeds the generated art shown when there are no photos. */
  artSeed: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
