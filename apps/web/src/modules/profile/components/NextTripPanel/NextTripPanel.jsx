/**
 * NextTripPanel — Customer Dashboard redesign (2026): the single
 * soonest upcoming booking, given an editorial hero treatment instead of
 * sitting in a list of otherwise-identical `BookingCard`s (the brief's
 * "a user's next trip should be the visual focus"). Reuses `BookingCard`'s
 * own "follow up with the listing module's own query" tradeoff — no new
 * data path, same booking summary shape.
 *
 * Purely visual: renders the exact same `booking` object
 * `BookingCard`/`BookingDetailPageContent` already consume, links to the
 * same detail route, changes nothing about booking data or logic.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Card } from '@desavii/ui/components/primitives';
import { PriceTag } from '@desavii/ui/components/data-display';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import RouterLink from '../../../../components/RouterLink.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import { useListingQuery } from '../../../listings/queries/useListingQuery.js';
import getLocalizedTranslation from '../../../listings/utils/getLocalizedTranslation.js';
import BookingStatusBadge from '../../../bookings/components/BookingStatusBadge/BookingStatusBadge.jsx';
import styles from './NextTripPanel.module.scss';

export default function NextTripPanel({ booking }) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { data: listing, isPending } = useListingQuery(booking.listing_id);

  const translation = listing
    ? getLocalizedTranslation(listing.translations, locale)
    : null;
  const coverMedia =
    listing?.media?.find((media) => media.is_cover) ?? listing?.media?.[0];
  const title = translation?.title ?? listing?.slug ?? '';
  const dateFormatter = createDateFormatter(i18n.language, {
    dateStyle: 'medium',
  });
  const firstItem = booking.items?.[0];

  return (
    <Card
      as={RouterLink}
      href={`/${locale}/account/bookings/${booking.id}`}
      padding="none"
      interactive
      elevated
      className={styles.panel}
    >
      <div className={styles.backdrop}>
        {coverMedia ? (
          <img
            src={coverMedia.url}
            alt=""
            className={styles.image}
            loading="lazy"
          />
        ) : (
          <DestinationArt
            seed={booking.listing_id}
            className={styles.imagePlaceholder}
          />
        )}
        <div className={styles.scrim} aria-hidden="true" />
      </div>

      <div className={styles.content}>
        <span className={styles.eyebrow}>
          {t('dashboard.nextTrip.heading')}
        </span>
        {!isPending && title && <h2 className={styles.title}>{title}</h2>}
        <div className={styles.meta}>
          <BookingStatusBadge status={booking.status} />
          {firstItem?.date_from && (
            <span className={styles.dates}>
              {dateFormatter.format(new Date(firstItem.date_from))}
              {firstItem.date_to &&
                firstItem.date_to !== firstItem.date_from &&
                ` – ${dateFormatter.format(new Date(firstItem.date_to))}`}
            </span>
          )}
        </div>
        <div className={styles.footer}>
          <PriceTag
            amount={booking.total_amount}
            currencyCode={booking.currency}
            locale={i18n.language}
            suffix={t('bookings.list.total')}
            onDark
          />
          <span className={styles.cta}>
            {t('dashboard.nextTrip.viewDetails')}
          </span>
        </div>
      </div>
    </Card>
  );
}

NextTripPanel.propTypes = {
  booking: PropTypes.shape({
    id: PropTypes.number.isRequired,
    listing_id: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    currency: PropTypes.string.isRequired,
    total_amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
      .isRequired,
    items: PropTypes.arrayOf(
      PropTypes.shape({
        date_from: PropTypes.string,
        date_to: PropTypes.string,
      }),
    ),
  }).isRequired,
};
