/**
 * DestinationCard — one Armenian city or region as a tall photograph with
 * its name and its real number of listings, linking to its destination
 * page.
 *
 * Home rebuild (docs/HOME_REBUILD.md): a destination with a photo shows
 * that place (the Cascade for Yerevan, Sevanavank for Sevan…); one without
 * keeps its generated art (`DestinationArt`) rather than a picture of
 * somewhere else.
 *
 * Final design pass — the destination archetype (distinct from the
 * category tile and the listing card): an editorial caption — the real
 * listing count as a small label on a gold hairline, the place name large
 * in the display face — and a ringed arrow cue that fills on hover/focus
 * while the caption lifts slightly.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import RouterLink from '../../../../components/RouterLink.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import {
  destinationImageKey,
  getHomeImage,
} from '../../constants/homeImages.js';
import HomePicture from '../HomePicture/HomePicture.jsx';
import styles from './DestinationCard.module.scss';

// The carousel shows ~1.3 cards on a phone, ~2.4 on a tablet, ~4 above.
const SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 42vw, 80vw';

export default function DestinationCard({ destination }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const image = getHomeImage(destinationImageKey(destination.slug));

  return (
    <RouterLink
      href={`/${locale}/destinations/${destination.slug}`}
      className={styles.card}
    >
      <div className={styles.media} aria-hidden="true">
        {image ? (
          <HomePicture image={image} sizes={SIZES} className={styles.photo} />
        ) : (
          <DestinationArt seed={destination.id} className={styles.photo} />
        )}
      </div>
      <div className={styles.body}>
        {destination.listing_count > 0 && (
          <span className={styles.count}>
            {t('home.categories.listingCount', {
              count: destination.listing_count,
            })}
          </span>
        )}
        <div className={styles.row}>
          <h3 className={styles.name}>{destination.name}</h3>
          <span className={styles.cue} aria-hidden="true">
            <ArrowRight size={18} />
          </span>
        </div>
      </div>
    </RouterLink>
  );
}

DestinationCard.propTypes = {
  destination: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    slug: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    listing_count: PropTypes.number,
  }).isRequired,
};
