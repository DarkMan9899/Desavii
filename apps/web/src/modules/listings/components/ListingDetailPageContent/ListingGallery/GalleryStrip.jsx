/**
 * GalleryStrip — the phone gallery: one photo at a time at the locked 4:3
 * ratio, swiped sideways (`useGalleryCarousel`), with an "N / total"
 * counter. Tapping a photo opens it in the lightbox. Only the first photo
 * loads eagerly (it is the phone's LCP candidate); the rest load lazily.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Images } from 'lucide-react';
import useGalleryCarousel from './useGalleryCarousel.js';
import { galleryItemShape } from './galleryPropTypes.js';
import styles from './ListingGallery.module.scss';

export default function GalleryStrip({ items, onOpen }) {
  const { t } = useTranslation();
  const { viewportRef, selectedIndex } = useGalleryCarousel();
  const total = items.length;

  return (
    <div
      className={styles.strip}
      role="region"
      aria-roledescription="carousel"
      aria-label={t('pages.listingDetail.gallery.heading')}
    >
      <div className={styles.stripViewport} ref={viewportRef}>
        <ul className={styles.stripTrack}>
          {items.map((item, index) => (
            <li
              key={item.id}
              className={styles.stripSlide}
              aria-roledescription="slide"
              aria-label={t('pages.listingDetail.gallery.imageCounter', {
                current: index + 1,
                total,
              })}
            >
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
                  src={item.type === 'VIDEO' ? item.thumbnailUrl : item.url}
                  alt={item.alt}
                  className={styles.tileMedia}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime does not map the camelCase `fetchPriority`; the lowercase attribute passes straight through.
                  fetchpriority={index === 0 ? 'high' : undefined}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {total > 1 && (
        <p className={styles.stripCounter} aria-hidden="true">
          <Images size={14} />
          {t('pages.listingDetail.gallery.imageCounter', {
            current: selectedIndex + 1,
            total,
          })}
        </p>
      )}
    </div>
  );
}

GalleryStrip.propTypes = {
  items: PropTypes.arrayOf(galleryItemShape).isRequired,
  onOpen: PropTypes.func.isRequired,
};
