/**
 * HomePicture — one Home photo as a responsive `<picture>`: AVIF first,
 * WebP otherwise, each at the widths generated for it (`homeImages.js`),
 * with `sizes` telling the browser how wide it will be drawn so it
 * downloads only what that viewport needs.
 *
 * Below the fold images load lazily; `priority` (the hero alone) loads it
 * at once with high fetch priority, since it is the page's largest paint.
 * The photos sit behind text that already names what they show, so the
 * default `alt` is empty (decorative); pass `alt` when the image carries
 * meaning of its own.
 */

import PropTypes from 'prop-types';
import styles from './HomePicture.module.scss';

export default function HomePicture({
  image,
  sizes,
  alt = '',
  priority = false,
  className = undefined,
}) {
  return (
    <picture className={[styles.picture, className].filter(Boolean).join(' ')}>
      <source type="image/avif" srcSet={image.avifSrcSet} sizes={sizes} />
      <source type="image/webp" srcSet={image.webpSrcSet} sizes={sizes} />
      <img
        className={styles.image}
        src={image.src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        // eslint-disable-next-line react/no-unknown-property -- this React version's JSX runtime doesn't yet know the camelCase `fetchPriority` DOM-property mapping; the lowercase spelling passes straight through as the real HTML attribute browsers read.
        fetchpriority={priority ? 'high' : undefined}
        decoding="async"
        draggable="false"
      />
    </picture>
  );
}

HomePicture.propTypes = {
  image: PropTypes.shape({
    avifSrcSet: PropTypes.string.isRequired,
    webpSrcSet: PropTypes.string.isRequired,
    src: PropTypes.string.isRequired,
  }).isRequired,
  sizes: PropTypes.string.isRequired,
  alt: PropTypes.string,
  priority: PropTypes.bool,
  className: PropTypes.string,
};
