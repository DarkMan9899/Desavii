/**
 * PartnerBookingDetailContent — `/:locale/partner/bookings/:id` (Partner
 * Dashboard). NOT a reuse of the customer-facing `BookingDetailPageContent`
 * — the action set differs (Confirm/Reject for `PENDING_VENDOR`, Cancel
 * for `CONFIRMED`, vs. the customer's Cancel-only), and this view adds a
 * timeline derived from the booking's own lifecycle timestamps
 * (`requested_at`/`confirmed_at`/`rejected_at`/`cancelled_at`/
 * `completed_at` — already returned by `GET /bookings/:id`, no new
 * endpoint or fake data). Field layout/404-vs-retryable-error split
 * otherwise mirrors that component's established pattern.
 *
 * Confirm/Reject/Cancel all reuse the same confirm-then-mutate-then-toast
 * shape `BookingDetailPageContent`'s own Cancel action already
 * established. Reject, like the customer Cancel flow, doesn't collect a
 * reason through a new form — `ConfirmContext` is a plain yes/no dialog,
 * and building a reason-capturing variant is out of this phase's scope.
 *
 * Booking summary/items/contact, notes, and the timeline each sit in
 * their own shared `Card` panel (Phase 10 redesign), matching the
 * customer-facing `BookingDetailPageContent`'s same treatment — this
 * page previously rendered them as bare, unstyled `Stack`s.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Spinner,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Button, Card } from '@desavii/ui/components/primitives';
import { PriceTag } from '@desavii/ui/components/data-display';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import {
  useBookingQuery,
  useConfirmBookingMutation,
  useRejectBookingMutation,
  useCancelBookingMutation,
  useCompleteBookingMutation,
  useMarkNoShowMutation,
  BookingStatusBadge,
} from '../../../bookings/index.js';
import { useCreateConversationMutation } from '../../../messaging/index.js';
import { BookingPaymentSection } from '../../../payments/index.js';
import { computeNights } from '../../../bookings/utils/computeNights.js';
import { formatTimeRange } from '../../../../utils/formatTimeRange.js';

const CANCELLABLE_STATUSES = ['CONFIRMED'];
const TIMELINE_FIELDS = [
  { field: 'requested_at', labelKey: 'requested' },
  { field: 'confirmed_at', labelKey: 'confirmed' },
  { field: 'rejected_at', labelKey: 'rejected' },
  { field: 'cancelled_at', labelKey: 'cancelled' },
  { field: 'completed_at', labelKey: 'completed' },
];

export default function PartnerBookingDetailContent({
  // Sprint F (Manager Workspace): reused unmodified for
  // `/manager/bookings/:id` — `basePath` redirects every internal link
  // (breadcrumbs, not-found back-link) to `/manager/...` instead of
  // `/partner/...`, and `readOnly` hides Confirm/Reject/Cancel/Complete/
  // No-show (Manager gets booking VISIBILITY only, spec §17 — those
  // mutations stay owner/admin-only server-side regardless, this just
  // avoids offering a button that would always 403). Defaults preserve
  // the existing Partner route's exact behavior.
  basePath = 'partner',
  readOnly = false,
} = {}) {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const bookingId = Number(id);

  const {
    data: booking,
    isPending,
    isError,
    error,
    refetch,
  } = useBookingQuery(bookingId);
  const confirmMutation = useConfirmBookingMutation(bookingId);
  const rejectMutation = useRejectBookingMutation(bookingId);
  const cancelMutation = useCancelBookingMutation(bookingId);
  const completeMutation = useCompleteBookingMutation(bookingId);
  const noShowMutation = useMarkNoShowMutation(bookingId);
  const createConversationMutation = useCreateConversationMutation();

  if (isPending) {
    return (
      <Section aria-label={t('partner.bookings.detail.loading')}>
        <Spinner label={t('partner.bookings.detail.loading')} />
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
          onAction={() => navigate(`/${locale}/${basePath}/bookings`)}
        />
      );
    }
    return (
      <Section>
        <ErrorState
          title={t('partner.bookings.detail.error.title')}
          retryLabel={t('partner.bookings.detail.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const heading = t('partner.bookings.detail.heading', {
    reference: booking.booking_reference,
  });
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const canConfirmOrReject = !readOnly && booking.status === 'PENDING_VENDOR';
  const canCancel = !readOnly && CANCELLABLE_STATUSES.includes(booking.status);
  const canCompleteOrNoShow = !readOnly && booking.status === 'CONFIRMED';
  const timeline = TIMELINE_FIELDS.filter(({ field }) => booking[field]);

  async function handleConfirm() {
    try {
      await confirmMutation.mutateAsync();
      showToast(t('partner.bookings.detail.confirmSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.bookings.detail.confirmError'), {
        variant: 'danger',
      });
    }
  }

  async function handleReject() {
    const confirmed = await confirm({
      title: t('partner.bookings.detail.rejectConfirmTitle'),
      description: t('partner.bookings.detail.rejectConfirmDescription'),
      confirmLabel: t('partner.bookings.detail.rejectConfirmAction'),
      cancelLabel: t('partner.bookings.detail.rejectConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await rejectMutation.mutateAsync();
      showToast(t('partner.bookings.detail.rejectSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.bookings.detail.rejectError'), {
        variant: 'danger',
      });
    }
  }

  async function handleCancel() {
    const confirmed = await confirm({
      title: t('partner.bookings.detail.cancelConfirmTitle'),
      description: t('partner.bookings.detail.cancelConfirmDescription'),
      confirmLabel: t('partner.bookings.detail.cancelConfirmAction'),
      cancelLabel: t('partner.bookings.detail.cancelConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await cancelMutation.mutateAsync();
      showToast(t('partner.bookings.detail.cancelSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.bookings.detail.cancelError'), {
        variant: 'danger',
      });
    }
  }

  async function handleComplete() {
    const confirmed = await confirm({
      title: t('partner.bookings.detail.completeConfirmTitle'),
      description: t('partner.bookings.detail.completeConfirmDescription'),
      confirmLabel: t('partner.bookings.detail.completeConfirmAction'),
      cancelLabel: t('partner.bookings.detail.completeConfirmDismiss'),
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await completeMutation.mutateAsync();
      showToast(t('partner.bookings.detail.completeSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.bookings.detail.completeError'), {
        variant: 'danger',
      });
    }
  }

  async function handleNoShow() {
    const confirmed = await confirm({
      title: t('partner.bookings.detail.noShowConfirmTitle'),
      description: t('partner.bookings.detail.noShowConfirmDescription'),
      confirmLabel: t('partner.bookings.detail.noShowConfirmAction'),
      cancelLabel: t('partner.bookings.detail.noShowConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await noShowMutation.mutateAsync();
      showToast(t('partner.bookings.detail.noShowSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.bookings.detail.noShowError'), {
        variant: 'danger',
      });
    }
  }

  // Reuses the same context-scoped conversation every time (the backend
  // makes `POST /messaging/conversations` idempotent per
  // (contextType, contextId, principal) — see `conversationService.js`),
  // so clicking this more than once always reopens the SAME thread
  // instead of spawning duplicates.
  async function handleMessageCustomer() {
    try {
      const result = await createConversationMutation.mutateAsync({
        participantUserIds: [booking.customer_user_id],
        contextType: 'booking',
        contextId: booking.id,
      });
      navigate(`/${locale}/partner/messages/${result.data.id}`);
    } catch {
      showToast(t('partner.bookings.detail.messageCustomerError'), {
        variant: 'danger',
      });
    }
  }

  return (
    <Section spacing="default">
      <PageHeader
        title={heading}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          {
            label: t(`${basePath}.nav.dashboard`),
            href: `/${locale}/${basePath}`,
          },
          {
            label: t('partner.bookings.heading'),
            href: `/${locale}/${basePath}/bookings`,
          },
          {
            label: heading,
            href: `/${locale}/${basePath}/bookings/${booking.id}`,
          },
        ]}
      />
      <Stack gap="4">
        <Card as="div" padding="lg">
          <Stack gap="4">
            <Inline gap="3" align="center">
              <BookingStatusBadge status={booking.status} audience="partner" />
              <PriceTag
                amount={booking.total_amount}
                currencyCode={booking.currency}
                suffix={t('bookings.detail.total')}
              />
            </Inline>

            <Stack gap="3">
              {booking.items.map((item) => {
                const nights = computeNights(item);
                return (
                  <div key={item.id}>
                    {item.unit_label && (
                      <p>
                        {t('bookings.detail.roomType')}: {item.unit_label}
                      </p>
                    )}
                    <p>
                      {t('bookings.detail.dates')}:{' '}
                      {dateFormatter.format(new Date(item.date_from))} –{' '}
                      {dateFormatter.format(new Date(item.date_to))}
                    </p>
                    {formatTimeRange(item.start_time, item.end_time) && (
                      <p>
                        {t('bookings.detail.time')}:{' '}
                        {formatTimeRange(item.start_time, item.end_time)}
                      </p>
                    )}
                    {/* Sprint B (Car Rental Pickup/Return Interval): the
                        exact fulfillment-critical detail a partner needs
                        for a vehicle booking — only ever populated for a
                        VEHICLE item, so every Hotel/Tour booking view here
                        is unaffected. */}
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
              <h2>{t('partner.bookings.detail.notes')}</h2>
              <p>{booking.customer_notes}</p>
            </Stack>
          </Card>
        )}

        {timeline.length > 0 && (
          <Card as="div" padding="lg">
            <Stack gap="1">
              <h2>{t('partner.bookings.detail.timeline.heading')}</h2>
              {timeline.map(({ field, labelKey }) => (
                <p key={field}>
                  {t(`partner.bookings.detail.timeline.${labelKey}`)}:{' '}
                  {dateTimeFormatter.format(new Date(booking[field]))}
                </p>
              ))}
            </Stack>
          </Card>
        )}

        <Inline gap="3">
          <Button
            variant="secondary"
            onClick={() => handleMessageCustomer()}
            loading={createConversationMutation.isPending}
          >
            {t('partner.bookings.detail.messageCustomerAction')}
          </Button>
        </Inline>

        {(canConfirmOrReject || canCancel || canCompleteOrNoShow) && (
          <Inline gap="3" wrap>
            {canConfirmOrReject && (
              <Button
                variant="primary"
                onClick={() => handleConfirm()}
                loading={confirmMutation.isPending}
              >
                {t('partner.bookings.detail.confirmAction')}
              </Button>
            )}
            {canConfirmOrReject && (
              <Button
                variant="destructive"
                onClick={() => handleReject()}
                loading={rejectMutation.isPending}
              >
                {t('partner.bookings.detail.rejectAction')}
              </Button>
            )}
            {canCompleteOrNoShow && (
              <Button
                variant="primary"
                onClick={() => handleComplete()}
                loading={completeMutation.isPending}
              >
                {t('partner.bookings.detail.completeAction')}
              </Button>
            )}
            {canCompleteOrNoShow && (
              <Button
                variant="destructive"
                onClick={() => handleNoShow()}
                loading={noShowMutation.isPending}
              >
                {t('partner.bookings.detail.noShowAction')}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                onClick={() => handleCancel()}
                loading={cancelMutation.isPending}
              >
                {t('partner.bookings.detail.cancelAction')}
              </Button>
            )}
          </Inline>
        )}
      </Stack>
    </Section>
  );
}

PartnerBookingDetailContent.propTypes = {
  basePath: PropTypes.string,
  readOnly: PropTypes.bool,
};
