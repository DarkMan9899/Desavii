/**
 * CategoryCard — one category as a photograph of that kind of place in
 * Armenia (a hotel on Republic Square, Tatev for tours, Garni for
 * attractions…), its name and its real number of listings, linking to
 * the category page.
 *
 * Home rebuild (docs/HOME_REBUILD.md): replaces the icon-on-gradient tile.
 * A category without a photo yet (one added later) keeps the navy panel
 * and its icon rather than a stock picture that might not be true to it.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import RouterLink from '../../../../components/RouterLink.jsx';
import { getCategoryIcon } from '../../../../utils/categoryIcons.js';
import { categoryImageKey, getHomeImage } from '../../constants/homeImages.js';
import HomePicture from '../HomePicture/HomePicture.jsx';
import styles from './CategoryCard.module.scss';

// The grid draws a featured tile at about half the content width and the
// others at a quarter (a full-width row of two on a phone).
const SIZES = {
  featured: '(min-width: 1024px) 50vw, 100vw',
  regular: '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw',
};

export default function CategoryCard({ category, featured = false }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const image = getHomeImage(categoryImageKey(category.slug));
  const Icon = getCategoryIcon(category.slug);

  return (
    <RouterLink
      href={`/${locale}/categories/${category.slug}`}
      className={[styles.card, featured && styles['card--featured']]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.media} aria-hidden="true">
        {image ? (
          <HomePicture
            image={image}
            sizes={featured ? SIZES.featured : SIZES.regular}
            className={styles.photo}
          />
        ) : (
          <span className={styles.fallback}>
            <Icon size={32} />
          </span>
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.text}>
          <span className={styles.name}>{category.name}</span>
          {category.listing_count > 0 && (
            <span className={styles.count}>
              {t('home.categories.listingCount', {
                count: category.listing_count,
              })}
            </span>
          )}
        </span>
        <span className={styles.arrow} aria-hidden="true">
          <ArrowUpRight size={18} />
        </span>
      </span>
    </RouterLink>
  );
}

CategoryCard.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    slug: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    listing_count: PropTypes.number,
  }).isRequired,
  featured: PropTypes.bool,
};
