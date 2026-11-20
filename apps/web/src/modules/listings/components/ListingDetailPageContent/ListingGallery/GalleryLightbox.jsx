/**
 * GalleryLightbox — every photo full size, one at a time. Built on the
 * shared `Modal` (`@desavii/ui`), so it inherits the portal, focus trap,
 * Escape-to-close, scroll lock and focus return to the photo that opened
 * it; this adds swipe (`useGalleryCarousel`), previous / next buttons,
 * Left / Right arrow keys and a counter announced politely.
 *
 * Only mounted while open, so no full-size photo downloads before a
 * traveller asks for it; slides beyond the open one load lazily.
 */

import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import useGalleryCarousel from './useGalleryCarousel.js';
import { galleryItemShape } from './galleryPropTypes.js';
import styles from './GalleryLightbox.module.scss';

export default function GalleryLightbox({ items, startIndex, title, onClose }) {
  const { t } = useTranslation();
  const { viewportRef, selectedIndex, scrollPrev, scrollNext } =
    useGalleryCarousel({ startIndex });
  const total = items.length;
  const active = items[selectedIndex] ?? items[0];

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'ArrowLeft') scrollPrev();
      if (event.key === 'ArrowRight') scrollNext();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [scrollPrev, scrollNext]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="full"
      ariaLabel={t('pages.listingDetail.gallery.dialogLabel', { title })}
      closeLabel={t('pages.listingDetail.gallery.closeLightbox')}
    >
      <div className={styles.lightbox}>
        <div className={styles.viewport} ref={viewportRef}>
          <ul className={styles.track}>
            {items.map((item, index) => (
              <li
                key={item.id}
                className={styles.slide}
                aria-hidden={index !== selectedIndex}
              >
                {item.type === 'VIDEO' ? (
                  // Partner videos carry no caption track; playback is
                  // user-started, never autoplay.
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={item.url} className={styles.media} controls />
                ) : (
                  <img
                    src={item.url}
                    alt={item.alt}
                    className={styles.media}
                    loading={
                      Math.abs(index - startIndex) <= 1 ? 'eager' : 'lazy'
                    }
                    decoding="async"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.navButton}
            onClick={scrollPrev}
            disabled={selectedIndex === 0}
            aria-label={t('pages.listingDetail.gallery.previousImage')}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <p className={styles.counter} aria-live="polite">
            {t('pages.listingDetail.gallery.imageCounter', {
              current: selectedIndex + 1,
              total,
            })}
            {active?.caption && (
              <span className={styles.caption}>{active.caption}</span>
            )}
          </p>
          <button
            type="button"
            className={styles.navButton}
            onClick={scrollNext}
            disabled={selectedIndex === total - 1}
            aria-label={t('pages.listingDetail.gallery.nextImage')}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </Modal>
  );
}

GalleryLightbox.propTypes = {
  items: PropTypes.arrayOf(galleryItemShape).isRequired,
  startIndex: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};
