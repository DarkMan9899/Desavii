/**
 * BookingDetailPageContent — `/:locale/account/bookings/:id`. Full detail
 * for one booking (items/guest-contact-snapshot/notes/total), with a
 * status-gated Cancel action. Cancellable states mirror
 * `bookingStatusTransitions.js`'s domain rule exactly: only `PENDING_VENDOR`
 * and `CONFIRMED` can transition to a cancelled state; every other status
 * is terminal (`REJECTED`, `CANCELLED_BY_*`, `COMPLETED`, `NO_SHOW`,
 * `EXPIRED`) and the action is hidden rather than shown-then-rejected.
 *
 * 404 vs. retryable-error split, and `useDocumentMeta`-free page-title
 * approach, mirror `ListingDetailPageContent.jsx`'s own established
 * pattern from Phase 6.
 *
 * 2026 Customer Account redesign: a `DestinationArt`/photo band + a
 * status stepper (`StatusStepper`, below — built from `booking.status`
 * only, no new data) replace the previous bare-`Card` header. Every
 * mutation, query, and conditional below is unchanged from before the
 * redesign — this file only changes what wraps them.
 */

import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Moon, Hash, Users2 } from 'lucide-react';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Skeleton,
  ErrorState,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Button, Card } from '@desavii/ui/components/primitives';
import { PriceTag } from '@desavii/ui/components/data-display';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { formatTimeRange } from '../../../../utils/formatTimeRange.js';
import { useBookingQuery } from '../../queries/useBookingQuery.js';
import { useCancelBookingMutation } from '../../mutations/useCancelBookingMutation.js';
import BookingStatusBadge from '../BookingStatusBadge/BookingStatusBadge.jsx';
import {
  ReviewForm,
  useReviewForBookingQuery,
} from '../../../reviews/index.js';
import { useCreateConversationMutation } from '../../../messaging/index.js';
import { AskAiButton } from '../../../ai/index.js';
import { BookingPaymentSection } from '../../../payments/index.js';
import { useListingQuery } from '../../../listings/queries/useListingQuery.js';
import getLocalizedTranslation from '../../../listings/utils/getLocalizedTranslation.js';
import { computeNights } from '../../utils/computeNights.js';
import StatusStepper from '../StatusStepper/StatusStepper.jsx';
import styles from './BookingDetailPageContent.module.scss';

// Mirrors `bookingStatusTransitions.js`'s domain rule exactly:
// `PENDING_VENDOR` may only become CONFIRMED/REJECTED/EXPIRED — never a
// cancelled state — so a still-pending request has no customer-initiated
// withdrawal path today; only a CONFIRMED booking can transition to
// CANCELLED_BY_CUSTOMER. Showing Cancel here for PENDING_VENDOR and
// letting the server reject it would be a worse experience than simply
// not offering an action that can never succeed.
const CANCELLABLE_STATUSES = ['CONFIRMED'];

export default function BookingDetailPageContent() {
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
  const cancelMutation = useCancelBookingMutation(bookingId);
  // Called unconditionally (Rules of Hooks) even before `booking` itself
  // has loaded — cheap, and only ever rendered once the booking is known
  // to be COMPLETED, below.
  const reviewQuery = useReviewForBookingQuery(bookingId);
  const createConversationMutation = useCreateConversationMutation();
  // P2.2E: same "follow up with the listing module's own query" tradeoff
  // `BookingCard.jsx` already documents — `enabled: Boolean(id)` makes
  // this a no-op until `booking` itself has loaded.
  const { data: listing } = useListingQuery(booking?.listing_id);

  if (isPending) {
    return (
      <Section
        spacing="default"
        aria-busy="true"
        aria-label={t('bookings.detail.loading')}
      >
        <Skeleton variant="text" width="40%" height={32} />
        <Stack gap="4">
          <Skeleton variant="rect" height={200} />
          <Card as="div" padding="lg">
            <Stack gap="4">
              <Inline gap="3" align="center">
                <Skeleton variant="rect" width={100} height={28} />
                <Skeleton variant="text" width={120} />
              </Inline>
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width="50%" />
            </Stack>
          </Card>
        </Stack>
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
          onAction={() => navigate(`/${locale}/account/bookings`)}
        />
      );
    }
    return (
      <Section>
        <ErrorState
          title={t('bookings.detail.error.title')}
          retryLabel={t('bookings.detail.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const heading = t('bookings.detail.heading', {
    reference: booking.booking_reference,
  });
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  });
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
  const translation = listing
    ? getLocalizedTranslation(listing.translations, locale)
    : null;
  const listingTitle = listing ? (translation?.title ?? listing.slug) : null;
  const coverMedia =
    listing?.media?.find((media) => media.is_cover) ?? listing?.media?.[0];

  async function handleCancel() {
    const confirmed = await confirm({
      title: t('bookings.detail.cancelConfirmTitle'),
      description: t('bookings.detail.cancelConfirmDescription'),
      confirmLabel: t('bookings.detail.cancelConfirmAction'),
      cancelLabel: t('bookings.detail.cancelConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await cancelMutation.mutateAsync();
      showToast(t('bookings.detail.cancelSuccess'), { variant: 'success' });
    } catch {
      showToast(t('bookings.detail.cancelError'), { variant: 'danger' });
    }
  }

  // Reuses the same context-scoped conversation every time (the backend
  // makes `POST /messaging/conversations` idempotent per
  // (contextType, contextId, principal) — see `conversationService.js`),
  // so clicking this more than once always reopens the SAME thread
  // instead of spawning duplicates.
  async function handleMessagePartner() {
    try {
      const result = await createConversationMutation.mutateAsync({
        participantUserIds: [booking.partner_owner_user_id],
        contextType: 'booking',
        contextId: booking.id,
      });
      navigate(`/${locale}/account/messages/${result.data.id}`);
    } catch {
      showToast(t('bookings.detail.messagePartnerError'), {
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
            label: t('bookings.list.heading'),
            href: `/${locale}/account/bookings`,
          },
          {
            label: heading,
            href: `/${locale}/account/bookings/${booking.id}`,
          },
        ]}
      />
      <Stack gap="4">
        <Card as="div" padding="none" elevated className={styles.headerCard}>
          <div className={styles.headerMedia}>
            {coverMedia ? (
              <img src={coverMedia.url} alt="" className={styles.headerImage} />
            ) : (
              <DestinationArt
                seed={booking.listing_id}
                className={styles.headerImagePlaceholder}
              />
            )}
          </div>
          <div className={styles.headerBody}>
            <Inline gap="3" align="center" wrap>
              <BookingStatusBadge status={booking.status} />
              <PriceTag
                amount={booking.total_amount}
                currencyCode={booking.currency}
                locale={i18n.language}
                suffix={t('bookings.detail.total')}
                size="lg"
              />
            </Inline>

            {listingTitle && (
              <h2 className={styles.listingTitle}>
                <RouterLink href={`/${locale}/listings/${listing.slug}`}>
                  {listingTitle}
                </RouterLink>
              </h2>
            )}

            <StatusStepper status={booking.status} />

            {/* A plain list of per-item facts (dates, nights, guests), not
                term/definition pairs — `<dl>`/`<dt>`/`<dd>` was a semantic
                misuse (each entry rendered as a `<p>`, which `<dl>` doesn't
                allow as a direct child), flagged by the axe accessibility
                suite's `only-dlitems` rule. `<ul>`/`<li>` matches what this
                content actually is. */}
            <ul className={styles.metaGrid}>
              {booking.items.map((item) => {
                const nights = computeNights(item);
                return (
                  <li key={item.id} className={styles.metaItem}>
                    {item.unit_label && (
                      <p className={styles.metaLine}>
                        <Hash aria-hidden="true" focusable="false" />
                        <span>
                          {t(
                            booking.booking_type === 'RESTAURANT_RESERVATION'
                              ? 'bookings.detail.tableLabel'
                              : 'bookings.detail.roomType',
                          )}
                          : {item.unit_label}
                        </span>
                      </p>
                    )}
                    {/* Sprint B (Car Rental Pickup/Return Interval):
                        `pickup_location`/`return_location` are only ever
                        non-null for a VEHICLE booking item. Pass 5 (owner
                        issue #12): a vehicle's `date_from`+`start_time` and
                        `date_to`+`end_time` are two DIFFERENT calendar days
                        (migration 0039's own design) — showing one combined
                        date range followed by one combined time range, as
                        every other vertical does, left it ambiguous which
                        date each time belonged to. Pairing each date with
                        its own time, right next to its own pickup/return
                        location, removes that ambiguity; every other
                        vertical's booking (a single-day stay or a
                        same-day timed session) keeps the original combined
                        rendering below, unchanged. */}
                    {item.pickup_location || item.return_location ? (
                      <>
                        <p className={styles.metaLine}>
                          <Calendar aria-hidden="true" focusable="false" />
                          <span>
                            {t('bookings.detail.pickupLocation')}:{' '}
                            {dateFormatter.format(new Date(item.date_from))}
                            {item.start_time ? ` · ${item.start_time}` : ''}
                            {item.pickup_location
                              ? ` · ${item.pickup_location}`
                              : ''}
                          </span>
                        </p>
                        <p className={styles.metaLine}>
                          <Calendar aria-hidden="true" focusable="false" />
                          <span>
                            {t('bookings.detail.returnLocation')}:{' '}
                            {dateFormatter.format(new Date(item.date_to))}
                            {item.end_time ? ` · ${item.end_time}` : ''}
                            {item.return_location
                              ? ` · ${item.return_location}`
                              : ''}
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={styles.metaLine}>
                          <Calendar aria-hidden="true" focusable="false" />
                          <span>
                            {dateFormatter.format(new Date(item.date_from))} –{' '}
                            {dateFormatter.format(new Date(item.date_to))}
                          </span>
                        </p>
                        {formatTimeRange(item.start_time, item.end_time) && (
                          <p className={styles.metaLine}>
                            <Clock aria-hidden="true" focusable="false" />
                            <span>
                              {formatTimeRange(item.start_time, item.end_time)}
                            </span>
                          </p>
                        )}
                      </>
                    )}
                    {nights !== null && (
                      <p className={styles.metaLine}>
                        <Moon aria-hidden="true" focusable="false" />
                        <span>
                          {t('bookings.detail.nights')}: {nights}
                        </span>
                      </p>
                    )}
                    {item.guests.length > 0 && (
                      <p className={styles.metaLine}>
                        <Users2 aria-hidden="true" focusable="false" />
                        <span>
                          {t('bookings.detail.quantity')}: {item.quantity} ·{' '}
                          {t('bookings.detail.guests')}: {item.guests.length}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

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
          </div>
        </Card>

        <BookingPaymentSection booking={booking} />

        {booking.customer_notes && (
          <Card as="div" padding="lg">
            <Stack gap="1">
              <h2>{t('bookings.detail.notes')}</h2>
              <p>{booking.customer_notes}</p>
            </Stack>
          </Card>
        )}

        <Inline gap="3">
          <AskAiButton
            label={t('ai.contextButtons.askAboutBooking')}
            contextType="booking"
            contextId={booking.id}
            initialMessage={t('ai.contextButtons.bookingInitialMessage')}
            variant="ghost"
            size="sm"
          />
        </Inline>

        {(canCancel || booking.partner_owner_user_id) && (
          <Inline gap="3">
            {booking.partner_owner_user_id && (
              <Button
                variant="secondary"
                onClick={() => handleMessagePartner()}
                loading={createConversationMutation.isPending}
              >
                {t('bookings.detail.messagePartnerAction')}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                onClick={() => handleCancel()}
                loading={cancelMutation.isPending}
              >
                {t('bookings.detail.cancelAction')}
              </Button>
            )}
          </Inline>
        )}

        {booking.status === 'COMPLETED' && !reviewQuery.isPending && (
          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('bookings.detail.review.heading')}</h2>
              {reviewQuery.data ? (
                <p>{t('bookings.detail.review.alreadySubmitted')}</p>
              ) : (
                <ReviewForm
                  bookingId={booking.id}
                  listingId={booking.listing_id}
                />
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </Section>
  );
}
