/**
 * MapListingGroup — the listings of a cluster that never splits (several
 * listings at one identical point): a plain list to pick one from, which
 * then opens its preview.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { mapMarkerShape } from './mapPropShapes.js';
import styles from './MapPreview.module.scss';

export default function MapListingGroup({
  listings,
  headingId,
  formatPrice,
  onSelect,
}) {
  const { t } = useTranslation();

  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.groupHeading} tabIndex={-1}>
        {t('search.map.clusterList')}
      </h3>
      <p className={styles.groupCount}>
        {t('search.map.cluster', { count: listings.length })}
      </p>
      <ul className={styles.groupList}>
        {listings.map((listing) => (
          <li key={listing.id}>
            <button
              type="button"
              className={styles.groupItem}
              onClick={() => onSelect(listing)}
            >
              <span className={styles.groupItemTitle}>{listing.title}</span>
              {listing.price_amount && (
                <span className={styles.groupItemPrice}>
                  {formatPrice(listing.price_amount)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

MapListingGroup.propTypes = {
  listings: PropTypes.arrayOf(mapMarkerShape).isRequired,
  headingId: PropTypes.string.isRequired,
  formatPrice: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};
