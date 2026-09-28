/**
 * AdminBookingDetailContent — `/:locale/admin/bookings/:id` (Stage 11.4:
 * Booking Operations). Composes the booking itself
 * (`useAdminBookingDetailQuery`) and its real status-history timeline
 * (`useAdminBookingHistoryQuery`, the first read path onto the
 * previously write-only `booking_status_history` table) — two
 * independent reads, same "one failure shouldn't block the other"
 * reasoning `AdminUserDetailContent`/`AdminPartnerDetailContent` already
 * document, though in practice both come from the exact same permission
 * check (`booking.view_all`) so they succeed/fail together.
 *
 * Action set follows `bookingStatusTransitions.js`'s state machine
 * exactly, never a raw status overwrite: `PENDING_VENDOR` offers
 * Confirm/Reject, `CONFIRMED` offers Cancel/Complete/Mark no-show, every
 * other status (including every terminal one) offers nothing. Reject/
 * Cancel now collect the optional `reason` the backend already accepts,
 * via the same local-`Modal`-with-`Textarea` pattern established for
 * Listings/Partners/Reviews moderation — previously this screen only
 * offered a plain yes/no confirm and silently sent no reason at all.
 *
 * The listing/customer/partner this booking is for are resolved via
 * their own existing admin detail queries (real names/titles, real
 * links) rather than the raw ids the booking summary/detail DTO itself
 * carries — the same "detail page fetches related entities via their
 * own admin query" pattern `AdminListingDetailContent` established for
 * its Partner card.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Spinner,
  ErrorState,
  EmptyState,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import { Button, Card } from '@desavii/ui/components/primitives';
import { Textarea } from '@desavii/ui/components/form-controls';
import { PriceTag } from '@desavii/ui/components/data-display';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useAdminBookingDetailQuery } from '../../queries/useAdminBookingDetailQuery.js';
import { useAdminBookingHistoryQuery } from '../../queries/useAdminBookingHistoryQuery.js';
import { useAdminUserDetailQuery } from '../../queries/useAdminUserDetailQuery.js';
import { useAdminPartnerDetailQuery } from '../../queries/useAdminPartnerDetailQuery.js';
import { useAdminListingDetailQuery } from '../../queries/useAdminListingDetailQuery.js';
import { useAdminConfirmBookingMutation } from '../../mutations/useAdminConfirmBookingMutation.js';
import { useAdminRejectBookingMutation } from '../../mutations/useAdminRejectBookingMutation.js';
import { useAdminCancelBookingMutation } from '../../mutations/useAdminCancelBookingMutation.js';
import { useAdminCompleteBookingMutation } from '../../mutations/useAdminCompleteBookingMutation.js';
import { useAdminMarkNoShowMutation } from '../../mutations/useAdminMarkNoShowMutation.js';
import { useAdminResolveRefundReviewMutation } from '../../mutations/useAdminResolveRefundReviewMutation.js';
import { BookingStatusBadge } from '../../../bookings/index.js';
import { formatTimeRange } from '../../../../utils/formatTimeRange.js';
import { BookingPaymentSection } from '../../../payments/index.js';
import { computeNights } from '../../../bookings/utils/computeNights.js';
import { resolveUnitNounKey } from '../../../bookings/utils/resolveUnitNounKey.js';

const DATE_RANGE_LABEL_BY_BOOKING_TYPE = {
  HOTEL_ROOM_BOOKING: 'checkInOut',
  PROPERTY_BOOKING: 'checkInOut',
  CAR_RENTAL_BOOKING: 'rentalDates',
  TOUR_BOOKING: 'departureDate',
  RESTAURANT_RESERVATION: 'reservationDate',
};

export default function AdminBookingDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const bookingId = Number(id);
  const canConfirm = permissions.includes('booking.confirm');
  const canReject = permissions.includes('booking.reject');
  const canCancelAny = permissions.includes('booking.cancel_any');
  const canResolveRefundReview = permissions.includes('payment.refund');

  const {
    data: booking,
    isPending,
    isError,
    error,
    refetch,
  } = useAdminBookingDetailQuery(bookingId);
  const historyQuery = useAdminBookingHistoryQuery(bookingId);
  const customerQuery = useAdminUserDetailQuery(booking?.customer_user_id);
  const partnerQuery = useAdminPartnerDetailQuery(booking?.partner_id);
  const listingQuery = useAdminListingDetailQuery(booking?.listing_id);

  const confirmMutation = useAdminConfirmBookingMutation();
  const rejectMutation = useAdminRejectBookingMutation();
  const cancelMutation = useAdminCancelBookingMutation();
  const completeMutation = useAdminCompleteBookingMutation();
  const noShowMutation = useAdminMarkNoShowMutation();
  const resolveRefundReviewMutation = useAdminResolveRefundReviewMutation();

  const [reasonDialog, setReasonDialog] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const closeReasonDialog = useCallback(() => setReasonDialog(null), []);

  if (isPending) {
    return (
      <Section aria-label={t('admin.bookingDetail.loading')}>
        <Spinner label={t('admin.bookingDetail.loading')} />
      </Section>
    );
  }

  if (isError) {
    if (error.status === 404) {
      return (
        <EmptyState
          title={t('errors.notFound.title')}
          description={t('errors.notFound.description')}
          actionLabel={t('errors.notFound.action')}
          onAction={() => navigate(`/${locale}/admin/bookings`)}
        />
      );
    }
    return (
      <Section>
        <ErrorState
          title={t('admin.bookingDetail.error.title')}
          retryLabel={t('admin.bookingDetail.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const heading = t('admin.bookingDetail.heading', {
    reference: booking.booking_reference,
  });
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  // The `bookings.status.partner.*` override exists because the default
  // copy is written from the customer's point of view ("Cancelled by
  // you") — just as wrong for an admin looking at someone else's booking
  // history (see BookingStatusBadge.jsx).
  function statusLabel(status) {
    return status === 'CANCELLED_BY_CUSTOMER'
      ? t('bookings.status.partner.CANCELLED_BY_CUSTOMER')
      : t(`bookings.status.${status}`, { defaultValue: status });
  }
  const canConfirmOrReject = booking.status === 'PENDING_VENDOR';
  const canActOnConfirmed = booking.status === 'CONFIRMED';
  const showConfirm = canConfirmOrReject && canConfirm;
  const showReject = canConfirmOrReject && canReject;
  const showComplete = canActOnConfirmed && canConfirm;
  const showNoShow = canActOnConfirmed && canConfirm;
  const showCancel = canActOnConfirmed && canCancelAny;
  const showResolveRefundReview =
    booking.refund_status === 'REQUIRES_MANUAL_REVIEW' &&
    canResolveRefundReview;
  const history = historyQuery.data ?? [];

  async function handleConfirm() {
    try {
      await confirmMutation.mutateAsync({ id: bookingId });
      showToast(t('admin.bookingDetail.confirmSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.bookingDetail.actionError'), { variant: 'danger' });
    }
  }

  function openReasonDialog(type) {
    setReasonText('');
    setReasonDialog({ type });
  }

  async function handleConfirmReasonDialog() {
    const trimmed = reasonText.trim();
    try {
      if (reasonDialog.type === 'reject') {
        await rejectMutation.mutateAsync({
          id: bookingId,
          reason: trimmed || undefined,
        });
        showToast(t('admin.bookingDetail.rejectSuccess'), {
          variant: 'success',
        });
      } else if (reasonDialog.type === 'cancel') {
        await cancelMutation.mutateAsync({
          id: bookingId,
          reason: trimmed || undefined,
        });
        showToast(t('admin.bookingDetail.cancelSuccess'), {
          variant: 'success',
        });
      } else if (reasonDialog.type === 'resolveRefundReview') {
        await resolveRefundReviewMutation.mutateAsync({
          id: bookingId,
          reason: trimmed,
        });
        showToast(t('admin.bookingDetail.resolveRefundReviewSuccess'), {
          variant: 'success',
        });
      }
    } catch {
      showToast(t('admin.bookingDetail.actionError'), { variant: 'danger' });
    } finally {
      setReasonDialog(null);
    }
  }

  async function handleComplete() {
    const confirmed = await confirm({
      title: t('admin.bookingDetail.completeConfirmTitle'),
      description: t('admin.bookingDetail.completeConfirmDescription'),
      confirmLabel: t('admin.bookingDetail.completeAction'),
      cancelLabel: t('common.cancel'),
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await completeMutation.mutateAsync({ id: bookingId });
      showToast(t('admin.bookingDetail.completeSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.bookingDetail.actionError'), { variant: 'danger' });
    }
  }

  async function handleNoShow() {
    const confirmed = await confirm({
      title: t('admin.bookingDetail.noShowConfirmTitle'),
      description: t('admin.bookingDetail.noShowConfirmDescription'),
      confirmLabel: t('admin.bookingDetail.noShowAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await noShowMutation.mutateAsync({ id: bookingId });
      showToast(t('admin.bookingDetail.noShowSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.bookingDetail.actionError'), { variant: 'danger' });
    }
  }

  return (
    <Section spacing="default">
      <PageHeader
        title={heading}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.bookings.heading'),
            href: `/${locale}/admin/bookings`,
          },
          {
            label: heading,
            href: `/${locale}/admin/bookings/${booking.id}`,
          },
        ]}
      />
      <Stack gap="4">
        <Card as="div" padding="lg">
          <Stack gap="4">
            <Inline gap="3" align="center">
              {/* audience="partner": reuses the third-person "cancelled by
                  the customer" override — see AdminBookingsPageContent's
                  identical comment on why the customer-audience default
                  ("Cancelled by you") is wrong here too. */}
              <BookingStatusBadge status={booking.status} audience="partner" />
              <PriceTag
                amount={booking.total_amount}
                currencyCode={booking.currency}
                suffix={t('bookings.detail.total')}
              />
            </Inline>

            <Stack gap="1">
              <p>
                {t('admin.bookingDetail.customer')}:{' '}
                <RouterLink
                  href={`/${locale}/admin/users/${booking.customer_user_id}`}
                >
                  {customerQuery.data
                    ? [
                        customerQuery.data.first_name,
                        customerQuery.data.last_name,
                      ]
                        .filter(Boolean)
                        .join(' ') || customerQuery.data.email
                    : t('admin.bookings.table.customerLink', {
                        id: booking.customer_user_id,
                      })}
                </RouterLink>
              </p>
              <p>
                {t('admin.bookingDetail.partner')}:{' '}
                <RouterLink
                  href={`/${locale}/admin/partners/${booking.partner_id}`}
                >
                  {partnerQuery.data?.display_name ??
                    t('admin.bookings.table.partnerLink', {
                      id: booking.partner_id,
                    })}
                </RouterLink>
              </p>
              <p>
                {t('admin.bookingDetail.listing')}:{' '}
                {listingQuery.data ? (
                  <RouterLink
                    href={`/${locale}/admin/listings/${booking.listing_id}`}
                  >
                    {listingQuery.data.translations?.find(
                      (row) => row.language_code === locale,
                    )?.title ??
                      listingQuery.data.translations?.[0]?.title ??
                      t('admin.bookingDetail.listingId', {
                        id: booking.listing_id,
                      })}
                  </RouterLink>
                ) : (
                  t('admin.bookingDetail.listingId', {
                    id: booking.listing_id,
                  })
                )}
              </p>
              {booking.refund_status &&
                booking.refund_status !== 'NOT_APPLICABLE' && (
                  <p>
                    {t('admin.bookingDetail.refundStatus')}:{' '}
                    {t(
                      `admin.bookingDetail.refundStatusValue.${booking.refund_status}`,
                      {
                        defaultValue: booking.refund_status,
                      },
                    )}
                  </p>
                )}
              {showResolveRefundReview && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openReasonDialog('resolveRefundReview')}
                >
                  {t('admin.bookingDetail.resolveRefundReviewAction')}
                </Button>
              )}
            </Stack>

            <Stack gap="3">
              {booking.items.map((item) => {
                const nights = computeNights(item);
                const dateRangeLabelKey =
                  DATE_RANGE_LABEL_BY_BOOKING_TYPE[booking.booking_type] ??
                  'dates';
                return (
                  <div key={item.id}>
                    {item.unit_label && (
                      <p>
                        {t(
                          resolveUnitNounKey(
                            item.bookable_unit_type,
                            'bookings.detail.roomType',
                          ),
                        )}
                        : {item.unit_label}
                      </p>
                    )}
                    <p>
                      {t(
                        `admin.bookingDetail.dateRangeLabel.${dateRangeLabelKey}`,
                      )}
                      : {dateFormatter.format(new Date(item.date_from))} –{' '}
                      {dateFormatter.format(new Date(item.date_to))}
                    </p>
                    {formatTimeRange(item.start_time, item.end_time) && (
                      <p>
                        {t('bookings.detail.time')}:{' '}
                        {formatTimeRange(item.start_time, item.end_time)}
                      </p>
                    )}
                    {/* Sprint B (Car Rental Pickup/Return Interval): only
                        ever populated for a VEHICLE item — every
                        Hotel/Tour booking view here is unaffected. */}
                    {item.pickup_location && (
                      <p>
                        {t('bookings.detail.pickupLocation')}:{' '}
                        {item.pickup_location}
                      </p>
                    )}
                    {item.return_location && (
                      <p>
                        {t('bookings.detail.returnLocation')}:{' '}
                        {item.return_location}
                      </p>
                    )}
                    {nights !== null && (
                      <p>
                        {t('bookings.detail.nights')}: {nights}
                      </p>
                    )}
                    <p>
                      {t('bookings.detail.quantity')}: {item.quantity}
                    </p>
                    {item.guests.length > 0 && (
                      <p>
                        {t('bookings.detail.guests')}: {item.guests.length}
                      </p>
                    )}
                  </div>
                );
              })}
            </Stack>

            <Stack gap="1">
              <p>
                {t('bookings.detail.contactName')}:{' '}
                {booking.guest_contact_snapshot.fullName}
              </p>
              <p>
                {t('bookings.detail.contactEmail')}:{' '}
                {booking.guest_contact_snapshot.email}
              </p>
              {booking.guest_contact_snapshot.phone && (
                <p>
                  {t('bookings.detail.contactPhone')}:{' '}
                  {booking.guest_contact_snapshot.phone}
                </p>
              )}
            </Stack>

            {booking.cancellation_reason && (
              <p>
                {t('bookings.detail.cancellationReason')}:{' '}
                {booking.cancellation_reason}
              </p>
            )}
          </Stack>
        </Card>

        <BookingPaymentSection booking={booking} readOnly />

        {booking.customer_notes && (
          <Card as="div" padding="lg">
            <Stack gap="1">
              <h2>{t('admin.bookingDetail.notes')}</h2>
              <p>{booking.customer_notes}</p>
            </Stack>
          </Card>
        )}

        <Card as="div" padding="lg">
          <Stack gap="2">
            <h2>{t('admin.bookingDetail.history.heading')}</h2>
            {historyQuery.isPending && (
              <span>{t('admin.bookingDetail.history.loading')}</span>
            )}
            {!historyQuery.isPending && history.length === 0 && (
              <EmptyState title={t('admin.bookingDetail.history.empty')} />
            )}
            {!historyQuery.isPending && history.length > 0 && (
              <Stack gap="1">
                {history.map((entry) => (
                  <p key={entry.id}>
                    {entry.from_status
                      ? statusLabel(entry.from_status)
                      : t('admin.bookingDetail.history.created')}{' '}
                    → {statusLabel(entry.to_status)} —{' '}
                    {dateTimeFormatter.format(new Date(entry.changed_at))}
                  </p>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>

        {(showConfirm ||
          showReject ||
          showComplete ||
          showNoShow ||
          showCancel) && (
          <Inline gap="3" wrap>
            {showConfirm && (
              <Button
                variant="primary"
                onClick={() => handleConfirm()}
                loading={confirmMutation.isPending}
              >
                {t('admin.bookingDetail.confirmAction')}
              </Button>
            )}
            {showReject && (
              <Button
                variant="destructive"
                onClick={() => openReasonDialog('reject')}
              >
                {t('admin.bookingDetail.rejectAction')}
              </Button>
            )}
            {showComplete && (
              <Button
                variant="primary"
                onClick={() => handleComplete()}
                loading={completeMutation.isPending}
              >
                {t('admin.bookingDetail.completeAction')}
              </Button>
            )}
            {showNoShow && (
              <Button
                variant="destructive"
                onClick={() => handleNoShow()}
                loading={noShowMutation.isPending}
              >
                {t('admin.bookingDetail.noShowAction')}
              </Button>
            )}
            {showCancel && (
              <Button
                variant="destructive"
                onClick={() => openReasonDialog('cancel')}
              >
                {t('admin.bookingDetail.cancelAction')}
              </Button>
            )}
          </Inline>
        )}
      </Stack>

      {reasonDialog && (
        <Modal
          isOpen
          onClose={closeReasonDialog}
          title={t(
            `admin.bookingDetail.reasonDialog.${reasonDialog.type}.title`,
          )}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={closeReasonDialog}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmReasonDialog()}
                loading={
                  rejectMutation.isPending ||
                  cancelMutation.isPending ||
                  resolveRefundReviewMutation.isPending
                }
                disabled={
                  reasonDialog.type === 'resolveRefundReview' &&
                  reasonText.trim().length === 0
                }
              >
                {t(
                  `admin.bookingDetail.reasonDialog.${reasonDialog.type}.confirmAction`,
                )}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <span>
              {t(
                `admin.bookingDetail.reasonDialog.${reasonDialog.type}.description`,
              )}
            </span>
            <Textarea
              label={t(
                reasonDialog.type === 'resolveRefundReview'
                  ? 'admin.bookingDetail.reasonDialog.reasonLabelRequired'
                  : 'admin.bookingDetail.reasonDialog.reasonLabelOptional',
              )}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              rows={4}
            />
          </Stack>
        </Modal>
      )}
    </Section>
  );
}
