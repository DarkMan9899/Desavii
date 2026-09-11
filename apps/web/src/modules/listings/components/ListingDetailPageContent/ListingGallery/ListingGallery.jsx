/**
 * ListingGallery — thumbnail grid + full-screen lightbox for
 * `listing.media` (`listingDto.js`'s `toMediaResponse` shape). Only
 * `IMAGE`/`VIDEO` media types render here (`DOCUMENT` — the third
 * `media_types` code — has no place in a visual gallery). The lightbox
 * reuses `Modal` (`@desavii/ui`, `size="full"`) rather than a bespoke
 * overlay, so it inherits that component's existing portal/focus-trap/
 * Escape/scroll-lock behavior for free; only the prev/next arrow-key
 * navigation is this component's own addition.
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import styles from './ListingGallery.module.scss';

const VISUAL_MEDIA_TYPES = ['IMAGE', 'VIDEO'];

// Phase 20 (SEO) §17: prefer the partner-provided `alt_text`, then
// `caption`, then a `{title} — image N of total` fallback so every image
// always has meaningful (never keyword-stuffed, never empty) alt text.
function resolveAltText(item, index, total, title, t) {
  if (item.alt_text) return item.alt_text;
  if (item.caption) return item.caption;
  return t('pages.listingDetail.gallery.imageAltFallback', {
    title,
    index: index + 1,
    total,
  });
}

export default function ListingGallery({ media = [], title = undefined }) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState(null);

  const items = media
    .filter((item) => VISUAL_MEDIA_TYPES.includes(item.media_type))
    .slice()
    .sort((a, b) => a.position - b.position);

  const isOpen = openIndex !== null;
  const total = items.length;

  function showPrevious() {
    setOpenIndex((current) => (current - 1 + total) % total);
  }

  function showNext() {
    setOpenIndex((current) => (current + 1) % total);
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'ArrowLeft') showPrevious();
      if (event.key === 'ArrowRight') showNext();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showPrevious/showNext close over `total`, which is stable for the lifetime of a mounted gallery
  }, [isOpen]);

  if (items.length === 0) return null;

  const activeItem = isOpen ? items[openIndex] : null;

  return (
    <>
      <div className={styles.grid}>
        {items.map((item, index) => {
          // The grid itself only ever displays the hero + 4 more tiles
          // (ListingGallery.module.scss's `:nth-child(n + 6)` rule) — the
          // 5th tile (index 4) is the last one visible, so that's where
          // a "+N more" overlay belongs when the listing has more photos
          // than fit.
          const isLastVisible = index === 4 && total > 5;
          return (
            <button
              key={item.id}
              type="button"
              className={styles.thumbnailButton}
              onClick={() => setOpenIndex(index)}
              aria-label={
                isLastVisible
                  ? t('pages.listingDetail.gallery.viewAllPhotos', {
                      count: total,
                    })
                  : t('pages.listingDetail.gallery.viewImage', {
                      index: index + 1,
                      count: total,
                    })
              }
            >
              {item.media_type === 'VIDEO' ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- a decorative silent thumbnail preview, not the primary viewing experience (the lightbox's <video controls> is)
                <video
                  src={item.url}
                  className={styles.thumbnail}
                  muted
                  aria-hidden="true"
                />
              ) : (
                <img
                  src={item.thumbnail_url ?? item.url}
                  alt={resolveAltText(item, index, total, title, t)}
                  className={styles.thumbnail}
                  // 2026 SEO/performance audit: the first tile is this
                  // page's LCP candidate (the largest above-the-fold
                  // image) — lazy-loading it actively delays LCP, the
                  // opposite of what `loading="lazy"` is for. Only the
                  // remaining, below-the-fold tiles defer.
                  loading={index === 0 ? 'eager' : 'lazy'}
                  // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime doesn't yet know the camelCase `fetchPriority` DOM-property mapping; the lowercase spelling passes straight through as the real HTML attribute browsers read.
                  fetchpriority={index === 0 ? 'high' : undefined}
                />
              )}
              {isLastVisible && (
                <span className={styles.moreOverlay} aria-hidden="true">
                  {t('pages.listingDetail.gallery.morePhotos', {
                    count: total - 5,
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setOpenIndex(null)}
        size="full"
        ariaLabel={title}
        closeLabel={t('pages.listingDetail.gallery.closeLightbox')}
      >
        {activeItem ? (
          <div className={styles.lightbox}>
            <Button
              variant="ghost"
              ariaLabel={t('pages.listingDetail.gallery.previousImage')}
              iconLeft={<ChevronLeft aria-hidden="true" />}
              onClick={() => showPrevious()}
              disabled={total <= 1}
            />
            {activeItem.media_type === 'VIDEO' ? (
              <video
                src={activeItem.url}
                className={styles.lightboxMedia}
                controls
              >
                <track kind="captions" />
              </video>
            ) : (
              <img
                src={activeItem.url}
                alt={resolveAltText(activeItem, openIndex, total, title, t)}
                className={styles.lightboxMedia}
              />
            )}
            <Button
              variant="ghost"
              ariaLabel={t('pages.listingDetail.gallery.nextImage')}
              iconLeft={<ChevronRight aria-hidden="true" />}
              onClick={() => showNext()}
              disabled={total <= 1}
            />
            <p className={styles.counter} aria-live="polite">
              {t('pages.listingDetail.gallery.imageCounter', {
                current: openIndex + 1,
                total,
              })}
            </p>
          </div>
        ) : // No active item yet (closed, or between transitions) — Modal's
        // `children` is optional for exactly this reason.
        null}
      </Modal>
    </>
  );
}

ListingGallery.propTypes = {
  media: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      media_type: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
      thumbnail_url: PropTypes.string,
      alt_text: PropTypes.string,
      caption: PropTypes.string,
      position: PropTypes.number,
    }),
  ),
  title: PropTypes.string,
};
