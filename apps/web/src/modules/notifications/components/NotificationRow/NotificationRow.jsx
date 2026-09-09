/**
 * NotificationRow — one notification, shared by `NotificationDropdown`
 * (compact) and `NotificationsPageContent` (full list). Renders its
 * message via `notificationCopy.js` — the backend stores only
 * `event_type` + `payload`, never rendered text (Phase 4.2's "i18n owns
 * all labels" rule).
 *
 * P2.2E: a booking-lifecycle notification now links to the booking it's
 * about. `resolveBookingId` reads whichever field actually carries it —
 * `notificationListener.js` puts the booking's own id on
 * `resource_type`/`resource_id` for BOOKING_* events (the row's own
 * `resourceType: 'booking', resourceId: booking.id`), but on
 * `payload.bookingId` for PAYMENT_ and REFUND_ events (those set
 * `resourceType: 'payment'`/`'refund'` instead, pointing at a DIFFERENT
 * record) — never both, so checking `resource_type` first and falling
 * back to the payload is exhaustive, not a guess. Every other category
 * (REVIEW/FAVORITE/PARTNER/LISTING/ADMIN) has neither field set and stays
 * a plain, non-navigable row exactly as before.
 *
 * `audience` picks which of the three booking-detail pages this
 * recipient should land on — mirrors `BookingCard.jsx`'s own
 * `hrefBase`/`audience` prop convention exactly, threaded down from
 * whichever layout mounted `NotificationBell`/`NotificationsPageContent`
 * (a customer's own notification always resolves to *their* booking
 * view; the same booking id would 404/403 under the wrong audience's
 * route for anyone who isn't also that booking's partner/admin).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  Calendar,
  Star,
  Heart,
  Building2,
  Home,
  Megaphone,
  Bell,
  MessageSquare,
  CreditCard,
  Check,
  Archive,
  Trash2,
} from 'lucide-react';
import { Icon, Button } from '@desavii/ui/components/primitives';
import RouterLink from '../../../../components/RouterLink.jsx';
import { getNotificationCopy } from '../../constants/notificationCopy.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';
import styles from './NotificationRow.module.scss';

const CATEGORY_ICONS = {
  BOOKING: Calendar,
  REVIEW: Star,
  FAVORITE: Heart,
  PARTNER: Building2,
  LISTING: Home,
  MESSAGE: MessageSquare,
  PAYMENT: CreditCard,
  ADMIN: Megaphone,
  // Sprint E (TOP/Featured Listings + Promotion Engine).
  PROMOTION: Megaphone,
};

const BOOKING_HREF_BASE = {
  customer: 'account/bookings',
  partner: 'partner/bookings',
  admin: 'admin/bookings',
};

function resolveBookingId(notification) {
  if (notification.resource_type === 'booking') {
    return notification.resource_id ?? null;
  }
  return notification.payload?.bookingId ?? null;
}

export default function NotificationRow({
  notification,
  audience = 'customer',
  onMarkRead,
  onArchive,
  onDelete,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const copy = getNotificationCopy(
    notification.event_type,
    notification.payload,
  );
  const IconComponent = CATEGORY_ICONS[notification.category] ?? Bell;
  const bookingId = resolveBookingId(notification);
  const bookingHref = bookingId
    ? `/${locale}/${BOOKING_HREF_BASE[audience]}/${bookingId}`
    : null;
  const message = copy.isAnnouncement ? (
    <>
      <strong>{copy.title}</strong>
      {copy.body && <span> — {copy.body}</span>}
    </>
  ) : (
    t(copy.key, copy.params)
  );

  return (
    <li
      className={[styles.row, !notification.is_read && styles['row--unread']]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.iconWrap}>
        <Icon icon={IconComponent} size="md" />
        {!notification.is_read && (
          <span
            className={styles.unreadDot}
            role="img"
            aria-label={t('notifications.a11y.unread')}
          />
        )}
      </span>
      <div className={styles.body}>
        <p className={styles.message}>
          {bookingHref ? (
            <RouterLink href={bookingHref}>{message}</RouterLink>
          ) : (
            message
          )}
        </p>
        <span className={styles.timestamp}>
          {formatRelativeTime(notification.created_at, locale)}
        </span>
      </div>
      <div className={styles.actions}>
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="sm"
            ariaLabel={t('notifications.actions.markAsRead')}
            iconLeft={<Check size={16} aria-hidden="true" />}
            onClick={() => onMarkRead(notification.id)}
          />
        )}
        {!notification.is_archived && (
          <Button
            variant="ghost"
            size="sm"
            ariaLabel={t('notifications.actions.archive')}
            iconLeft={<Archive size={16} aria-hidden="true" />}
            onClick={() => onArchive(notification.id)}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          ariaLabel={t('notifications.actions.delete')}
          iconLeft={<Trash2 size={16} aria-hidden="true" />}
          onClick={() => onDelete(notification.id)}
        />
      </div>
    </li>
  );
}

NotificationRow.propTypes = {
  // Real GET /notifications row shape (FRONTEND_ARCHITECTURE.md §10.8's
  // normalized-but-untyped response), not a hand-authored prop contract.
  // eslint-disable-next-line react/forbid-prop-types
  notification: PropTypes.object.isRequired,
  audience: PropTypes.oneOf(['customer', 'partner', 'admin']),
  onMarkRead: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
