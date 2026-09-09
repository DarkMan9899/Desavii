/**
 * PartnerBookingsList — loading/empty/error/pagination states for the
 * Partner Dashboard's Booking Management list, mirroring `bookings`'s own
 * `BookingsList.jsx` exactly. Reuses `BookingCard` with
 * `hrefBase="partner/bookings"` and `audience="partner"` rather than a
 * parallel card — the row content (listing, status, price) is identical
 * to the customer "My Trips" list, only the destination route and the
 * one status label those two props affect differ.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { Stack } from '@desavii/ui/components/layout';
import { BookingCard } from '../../../bookings/index.js';
import styles from './PartnerBookingsList.module.scss';

const SKELETON_COUNT = 4;

export default function PartnerBookingsList({
  bookings,
  isPending,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  // Sprint F (Manager Workspace): reused unmodified by
  // `ManagerBookingsPageContent` — only the card's destination route
  // differs (`manager/bookings` vs `partner/bookings`). Defaults preserve
  // every existing Partner caller's behavior exactly.
  hrefBase = 'partner/bookings',
  audience = 'partner',
}) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <Stack gap="3">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} variant="rect" height={104} />
        ))}
      </Stack>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.bookings.error.title')}
        retryLabel={t('partner.bookings.error.retry')}
        onRetry={onRetry}
      />
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        title={t('partner.bookings.empty.title')}
        description={t('partner.bookings.empty.description')}
      />
    );
  }

  return (
    <Stack gap="3">
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          hrefBase={hrefBase}
          audience={audience}
        />
      ))}
      {hasNextPage && (
        <div className={styles.loadMore}>
          <Button
            variant="secondary"
            onClick={onLoadMore}
            loading={isFetchingNextPage}
          >
            {t('partner.bookings.loadMore')}
          </Button>
        </div>
      )}
    </Stack>
  );
}

PartnerBookingsList.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  bookings: PropTypes.arrayOf(PropTypes.object).isRequired,
  isPending: PropTypes.bool.isRequired,
  isError: PropTypes.bool.isRequired,
  onRetry: PropTypes.func.isRequired,
  hasNextPage: PropTypes.bool.isRequired,
  isFetchingNextPage: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
  hrefBase: PropTypes.string,
  audience: PropTypes.oneOf(['customer', 'partner']),
};
