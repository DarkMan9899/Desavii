/**
 * Gallery — COMPONENT_LIBRARY.md Part II §6 "Gallery". Thumbnail grid
 * entry point (Desktop) opening a focus-trapped, keyboard-navigable
 * lightbox — the Mobile swipeable-carousel variant is out of this
 * pass's scope (no shared carousel primitive exists yet); the lightbox
 * itself is used at every breakpoint.
 *
 * Sprint L fix: the lightbox is now actually focus-trapped — it used to
 * only close on Escape, with no initial-focus move into it, no Tab/
 * Shift+Tab trapping, no focus-return to the thumbnail that opened it,
 * and no `aria-hidden` on background content, despite the header comment
 * above (unchanged since this component's original build) already
 * claiming it was. Reuses the shared `useFocusTrap` hook that `Modal`/
 * `Drawer` are built on rather than re-implementing any of this —
 * `useFocusTrap` already owns Escape-to-close, so this component's own
 * keydown handler now only covers Left/Right image navigation, which the
 * hook doesn't know about.
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useFocusTrap from '../../../hooks/useFocusTrap.js';
import styles from './Gallery.module.scss';

const THUMBNAIL_LIMIT = 5;

export default function Gallery({
  media,
  viewImageLabel,
  viewAllLabel,
  closeLabel,
  previousLabel,
  nextLabel,
  initialIndex = 0,
}) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const lightboxRef = useRef(null);
  const isLightboxOpen = lightboxIndex !== null;

  useFocusTrap({
    containerRef: lightboxRef,
    isOpen: isLightboxOpen,
    onClose: () => setLightboxIndex(null),
  });

  useEffect(() => {
    if (!isLightboxOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'ArrowRight') {
        setLightboxIndex((current) => (current + 1) % media.length);
      }
      if (event.key === 'ArrowLeft') {
        setLightboxIndex(
          (current) => (current - 1 + media.length) % media.length,
        );
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, media.length]);

  const visibleThumbnails = media.slice(0, THUMBNAIL_LIMIT);
  const remainingCount = media.length - THUMBNAIL_LIMIT;

  const activeItem = lightboxIndex !== null ? media[lightboxIndex] : null;

  return (
    <div className={styles.gallery}>
      <div className={styles.grid}>
        {visibleThumbnails.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={styles.thumbnail}
            aria-label={
              index === THUMBNAIL_LIMIT - 1 && remainingCount > 0
                ? viewAllLabel(remainingCount)
                : viewImageLabel
            }
            // The cover tile opens the lightbox at `initialIndex` (0 by
            // default); every other visible thumbnail jumps straight to
            // itself.
            onClick={() => setLightboxIndex(index === 0 ? initialIndex : index)}
          >
            {item.mediaType === 'VIDEO' ? (
              <video src={item.url} className={styles.thumbnailMedia} muted />
            ) : (
              <img
                src={item.url}
                alt={item.alt}
                className={styles.thumbnailMedia}
                // 2026 SEO/performance audit: real Lighthouse trace
                // evidence (largest-contentful-paint-element +
                // lcp-lazy-loaded audits, against the real running page —
                // ListingHero is this component's only current consumer)
                // identified the FIRST/cover thumbnail as the actual LCP
                // element on Listing Detail, with Load Delay alone
                // accounting for 67% of a 4.9s LCP. It's this gallery's
                // cover tile — by definition the most prominent
                // above-the-fold image wherever `Gallery` is used — so
                // unconditional `loading="lazy"` was never correct for
                // it; every other thumbnail still defers.
                loading={index === 0 ? 'eager' : 'lazy'}
                // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime doesn't yet know the camelCase `fetchPriority` DOM-property mapping; the lowercase spelling passes straight through as the real HTML attribute browsers read.
                fetchpriority={index === 0 ? 'high' : undefined}
              />
            )}
            {index === THUMBNAIL_LIMIT - 1 && remainingCount > 0 && (
              <span className={styles.overlay} aria-hidden="true">
                +{remainingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeItem && (
        <div
          ref={lightboxRef}
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={viewImageLabel}
          tabIndex={-1}
        >
          <button
            type="button"
            className={styles.close}
            aria-label={closeLabel}
            onClick={() => setLightboxIndex(null)}
          >
            &times;
          </button>
          <button
            type="button"
            className={[styles.nav, styles['nav--previous']].join(' ')}
            aria-label={previousLabel}
            onClick={() =>
              setLightboxIndex(
                (current) => (current - 1 + media.length) % media.length,
              )
            }
          >
            &lsaquo;
          </button>
          <div className={styles.stage}>
            {activeItem.mediaType === 'VIDEO' ? (
              // No caption track exists: partner-uploaded listing videos
              // carry no transcript/subtitle data today, and playback is
              // user-initiated (no autoplay), not decorative content.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={activeItem.url}
                className={styles.stageMedia}
                controls
              />
            ) : (
              <img
                src={activeItem.url}
                alt={activeItem.alt}
                className={styles.stageMedia}
              />
            )}
          </div>
          <button
            type="button"
            className={[styles.nav, styles['nav--next']].join(' ')}
            aria-label={nextLabel}
            onClick={() =>
              setLightboxIndex((current) => (current + 1) % media.length)
            }
          >
            &rsaquo;
          </button>
        </div>
      )}
    </div>
  );
}

const mediaItemShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  url: PropTypes.string.isRequired,
  mediaType: PropTypes.oneOf(['IMAGE', 'VIDEO']),
  alt: PropTypes.string,
});

Gallery.propTypes = {
  media: PropTypes.arrayOf(mediaItemShape).isRequired,
  viewImageLabel: PropTypes.string.isRequired,
  viewAllLabel: PropTypes.func.isRequired,
  closeLabel: PropTypes.string.isRequired,
  previousLabel: PropTypes.string.isRequired,
  nextLabel: PropTypes.string.isRequired,
  initialIndex: PropTypes.number,
};
