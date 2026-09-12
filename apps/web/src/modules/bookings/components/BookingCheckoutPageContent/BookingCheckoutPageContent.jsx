/**
 * BookingCheckoutPageContent — `/:locale/booking/checkout`. Converts an
 * active reservation hold (created by `ListingReservationWidget`,
 * carried here via router `state` — no server-side "cart" concept
 * exists, `POST /booking-holds`'s own response has everything this page
 * needs) into a real `PENDING_VENDOR` booking via `POST /bookings`.
 *
 * A page refresh (or any direct navigation without the router state)
 * loses that in-memory hand-off — this is a legitimate, honest empty
 * state (`noActiveHold`), not an error, since the hold itself may still
 * be valid server-side; the customer simply needs to re-select dates
 * from the listing page to resume (the same "eventual consistency,
 * never silently wrong" ethos the rest of this phase follows).
 *
 * The countdown is a client-side re-render of the same `expires_at` the
 * server already returned — never trusted as the source of truth for
 * whether the hold is still valid; the authoritative check happens
 * server-side inside `POST /bookings`, which fails plainly (a normal,
 * surfaced error) if the hold already expired.
 *
 * 2026 public-frontend audit: visual pass only — every hook, mutation,
 * conditional, and handler above is unchanged. The bare `PageHeader` +
 * plain-text order summary is replaced with a compact breadcrumb, a
 * calm (not editorial-hero) heading — a transactional page should stay
 * quiet, not decorative — an urgency-aware countdown badge, and a sticky
 * `ListingCardBase`-language summary card reusing the listing's own
 * cover photo/`DestinationArt` fallback. This page deliberately never
 * collects payment (`PAYMENTS_ENABLED=false`; the flow here creates a
 * `PENDING_VENDOR` request, not a charge), so there's no payment-status
 * messaging to add — nothing was invented to fill that gap.
 *
 * Pass 8 (Multi-Currency / CBA FX Pricing) — this is the documented "FX
 * freeze point" (brief §27): the summary total renders through `<Money>`
 * (a LIVE conversion, so it may still move if the customer switches
 * currency before submitting), but `onSubmit` sends the customer's
 * current `currency` as `displayCurrencyCode` — the server resolves and
 * permanently snapshots the FX rate at that exact moment
 * (`bookingService.js#resolveDisplayFxSnapshot`), never a client-supplied
 * rate. After that, the booking's own stored snapshot is what every later
 * view shows, never a fresh live conversion (see
 * `resolveBookingDisplayAmount.js`).
 */

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Input, Textarea } from '@desavii/ui/components/form-controls';
import { Button, Card } from '@desavii/ui/components/primitives';
import { Alert, EmptyState } from '@desavii/ui/components/feedback-overlays';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import { Stack } from '@desavii/ui/components/layout';
import RouterLink from '../../../../components/RouterLink.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import Money from '../../../../components/Money/Money.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useCurrency } from '../../../../contexts/CurrencyContext.jsx';
import useNoIndex from '../../../../seo/useNoIndex.js';
import { formatTimeRange } from '../../../../utils/formatTimeRange.js';
import { useListingQuery } from '../../../listings/queries/useListingQuery.js';
import getLocalizedTranslation from '../../../listings/utils/getLocalizedTranslation.js';
import { useCreateBookingMutation } from '../../mutations/useCreateBookingMutation.js';
import { useReleaseBookingHoldMutation } from '../../mutations/useReleaseBookingHoldMutation.js';
import styles from './BookingCheckoutPageContent.module.scss';

const URGENT_THRESHOLD_MS = 2 * 60_000;

function useRemainingMs(expiresAt) {
  const [remainingMs, setRemainingMs] = useState(() =>
    expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0,
  );

  useEffect(() => {
    if (!expiresAt) return undefined;
    const interval = setInterval(() => {
      setRemainingMs(new Date(expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return Math.max(0, remainingMs);
}

export default function BookingCheckoutPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { currency: displayCurrency } = useCurrency();
  useNoIndex();

  const [bookingConflict, setBookingConflict] = useState(false);

  const holdState = location.state;
  const listingId = holdState?.listingId;
  const holdItem = holdState?.holdBatch?.items?.[0];
  const holdIds = holdItem?.hold_ids ?? [];
  const expiresAt = holdState?.holdBatch?.expires_at;
  const estimatedTotal = holdState?.estimatedTotal;
  // P2.2B: `ListingReservationWidget`'s own real-label resolution and the
  // customer's entered guest count, both carried through router state the
  // same way `estimatedTotal` already is — ephemeral, display/payload-only,
  // lost on a refresh same as everything else on this page (the persisted,
  // authoritative unit identity a customer sees afterward always comes
  // from the real booking response, not this hand-off).
  const unitLabel = holdState?.unitLabel;
  const guestCount = holdState?.guestCount;
  // Pass 6 (Restaurant vertical): same ephemeral, display-only hand-off
  // category as `unitLabel`/`guestCount` above — swaps this generic
  // summary's "Room / unit type" / "Guests" row labels for Restaurant-
  // appropriate wording, so the final confirmation step never re-shows
  // the hotel language the reservation widget itself already avoids.
  const isRestaurantReservation = Boolean(holdState?.isRestaurantReservation);
  // Sprint A (Time-Aware Booking Foundation): rides along the same way
  // `unitLabel` already does — display-only here; the customer/partner/
  // admin's own later view of this booking always reads the real,
  // persisted `start_time`/`end_time` snapshot instead (never this).
  const timeRange = formatTimeRange(
    holdState?.timeSlotStart,
    holdState?.timeSlotEnd,
  );
  // Sprint B (Car Rental Pickup/Return Interval): same ephemeral,
  // display-only hand-off category as `unitLabel`/`timeRange` above — the
  // authoritative pickup/return identity a customer sees afterward always
  // comes from the real booking response's own persisted fields.
  const isVehicleRental = Boolean(
    holdState?.pickupTime && holdState?.returnTime,
  );
  const rentalLocationLabel = holdState?.rentalLocationLabel;
  const nights =
    holdItem?.date_from && holdItem?.date_to
      ? Math.round(
          (new Date(holdItem.date_to) - new Date(holdItem.date_from)) /
            86_400_000,
        )
      : null;

  const remainingMs = useRemainingMs(expiresAt);
  const isExpired = Boolean(expiresAt) && remainingMs <= 0;

  const { data: listing } = useListingQuery(listingId);
  const translation = listing
    ? getLocalizedTranslation(listing.translations, locale)
    : null;
  const coverImageUrl =
    listing?.media?.find((item) => item.is_cover)?.thumbnail_url ??
    listing?.media?.[0]?.thumbnail_url;

  const createBookingMutation = useCreateBookingMutation();
  const releaseHoldMutation = useReleaseBookingHoldMutation();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      fullName: user
        ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
        : '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      notes: '',
    },
  });

  if (!holdState || !holdItem) {
    // P2.2E: this honest "no active hold" state (see this file's own
    // header comment) previously only offered "Browse listings" — no
    // path back to a booking that may have just succeeded (e.g. the
    // customer refreshed right after submitting). `EmptyState` only
    // supports one action, so a second, smaller action is composed
    // alongside it rather than changing that shared primitive.
    return (
      <Stack gap="3" align="center">
        <EmptyState
          title={t('bookings.checkout.noActiveHold.title')}
          description={t('bookings.checkout.noActiveHold.description')}
          actionLabel={t('bookings.checkout.noActiveHold.action')}
          onAction={() => navigate(`/${locale}`)}
        />
        {user && (
          <Button
            variant="ghost"
            onClick={() => navigate(`/${locale}/account/bookings`)}
          >
            {t('bookings.checkout.noActiveHold.viewBookingsAction')}
          </Button>
        )}
      </Stack>
    );
  }

  async function onSubmit(values) {
    try {
      const { data } = await createBookingMutation.mutateAsync({
        items: [{ holdIds, guests: [], guestCount }],
        guestContactSnapshot: {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone || undefined,
        },
        customerNotes: values.notes || undefined,
        // Pass 8 — the FX freeze point (see this file's own header
        // comment): the server resolves/snapshots the real rate itself,
        // this is only the customer's currency CHOICE, never a rate.
        displayCurrencyCode: displayCurrency,
      });
      showToast(t('bookings.checkout.successToast'), { variant: 'success' });
      navigate(`/${locale}/account/bookings/${data.id}`);
    } catch (err) {
      // Phase 17 §Checkout Revalidation (CRITICAL) — `POST /bookings` only
      // ever re-checks that the holds are still active
      // (`AvailabilityService#consumeHold`); it never re-decrements
      // capacity, since that already happened atomically at
      // hold-creation time. A hold going stale between this page loading
      // and submit (expired, or released/consumed by a concurrent
      // action) is exactly the "phone reservation while a customer is
      // checking out" scenario — surfaced here as a blocking, specific
      // conflict state (not just a toast) so the customer can't retry
      // into the same wall.
      if (err?.code === 'HOLD_EXPIRED') {
        setBookingConflict(true);
      } else {
        showToast(t('bookings.checkout.submitError'), { variant: 'danger' });
      }
    }
  }

  async function handleCancelHold() {
    try {
      await releaseHoldMutation.mutateAsync(holdIds);
    } finally {
      navigate(listingId ? `/${locale}/listings/${listingId}` : `/${locale}`);
    }
  }

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, '0');
  const isBlocked = bookingConflict || isExpired;
  const isUrgent =
    !isBlocked && remainingMs > 0 && remainingMs <= URGENT_THRESHOLD_MS;

  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    {
      label: t('bookings.checkout.heading'),
      href: `/${locale}/booking/checkout`,
    },
  ];

  return (
    <div className={styles.page}>
      <Breadcrumbs
        items={breadcrumbItems}
        linkComponent={RouterLink}
        className={styles.breadcrumbs}
      />
      <h1 className={styles.title}>{t('bookings.checkout.heading')}</h1>

      <div className={styles.layout}>
        <div className={styles.main}>
          {isBlocked && (
            <Alert variant="danger">
              {t(
                bookingConflict
                  ? 'bookings.checkout.conflictError'
                  : 'bookings.checkout.holdExpired',
              )}
            </Alert>
          )}
          {!isBlocked && (
            <div
              className={[
                styles.countdownBadge,
                isUrgent && styles['countdownBadge--urgent'],
              ]
                .filter(Boolean)
                .join(' ')}
              aria-live="polite"
            >
              <Clock size={16} aria-hidden="true" />
              {t('bookings.checkout.holdExpiresIn', { minutes, seconds })}
            </div>
          )}

          <Card
            as="form"
            padding="lg"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            elevated
            className={styles.formCard}
          >
            <Stack gap="4">
              <h2 className={styles.formHeading}>
                {t('bookings.checkout.guestContact.heading')}
              </h2>
              <Controller
                name="fullName"
                control={control}
                rules={{
                  required: t(
                    'bookings.checkout.guestContact.fullNameRequired',
                  ),
                }}
                render={({ field }) => (
                  <Input
                    label={t('bookings.checkout.guestContact.fullNameLabel')}
                    required
                    error={errors.fullName?.message}
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...field}
                  />
                )}
              />
              <Controller
                name="email"
                control={control}
                rules={{
                  required: t('bookings.checkout.guestContact.emailRequired'),
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: t('bookings.checkout.guestContact.emailInvalid'),
                  },
                }}
                render={({ field }) => (
                  <Input
                    type="email"
                    label={t('bookings.checkout.guestContact.emailLabel')}
                    required
                    error={errors.email?.message}
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...field}
                  />
                )}
              />
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <Input
                    type="tel"
                    label={t('bookings.checkout.guestContact.phoneLabel')}
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...field}
                  />
                )}
              />
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <Textarea
                    label={t('bookings.checkout.notesLabel')}
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...field}
                  />
                )}
              />

              <Button
                type="submit"
                variant="primary"
                disabled={isBlocked}
                loading={createBookingMutation.isPending}
              >
                {t('bookings.checkout.confirmAction')}
              </Button>
            </Stack>
          </Card>

          <Button
            variant="ghost"
            onClick={() => handleCancelHold()}
            loading={releaseHoldMutation.isPending}
          >
            {t('bookings.checkout.cancelHoldAction')}
          </Button>
        </div>

        <aside className={styles.summaryColumn}>
          <Card as="div" padding="none" elevated className={styles.summaryCard}>
            <div className={styles.summaryMedia}>
              {coverImageUrl ? (
                <img
                  src={coverImageUrl}
                  alt=""
                  className={styles.summaryImage}
                  loading="lazy"
                />
              ) : (
                <DestinationArt
                  seed={listingId ?? 'checkout'}
                  className={styles.summaryArt}
                />
              )}
            </div>
            <div className={styles.summaryBody}>
              <h2 className={styles.summaryTitle}>
                {t('bookings.checkout.summary.heading')}
              </h2>
              {translation && (
                <p className={styles.summaryListingTitle}>
                  {translation.title ?? listing.slug}
                </p>
              )}
              <dl className={styles.summaryList}>
                {unitLabel && (
                  <div className={styles.summaryRow}>
                    <dt>
                      {t(
                        isRestaurantReservation
                          ? 'bookings.checkout.summary.tableLabel'
                          : 'bookings.checkout.summary.roomType',
                      )}
                    </dt>
                    <dd>{unitLabel}</dd>
                  </div>
                )}
                {isVehicleRental ? (
                  <>
                    <div className={styles.summaryRow}>
                      <dt>{t('bookings.checkout.summary.pickup')}</dt>
                      <dd>
                        {[
                          rentalLocationLabel,
                          holdItem.date_from,
                          holdState.pickupTime,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </dd>
                    </div>
                    <div className={styles.summaryRow}>
                      <dt>{t('bookings.checkout.summary.return')}</dt>
                      <dd>
                        {[
                          rentalLocationLabel,
                          holdItem.date_to,
                          holdState.returnTime,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.summaryRow}>
                      <dt>{t('bookings.checkout.summary.dates')}</dt>
                      <dd>
                        {holdItem.date_from === holdItem.date_to
                          ? holdItem.date_from
                          : `${holdItem.date_from} – ${holdItem.date_to}`}
                      </dd>
                    </div>
                    {timeRange && (
                      <div className={styles.summaryRow}>
                        <dt>{t('bookings.checkout.summary.time')}</dt>
                        <dd>{timeRange}</dd>
                      </div>
                    )}
                    {/* Sprint A: a time-slot booking is never a nightly
                        stay by construction (no bookable unit is ever
                        both time-slot AND accommodation) — showing
                        "Nights: 0" for a same-day departure would be
                        exactly the meaningless empty-time-UI this phase
                        is meant to eliminate. */}
                    {nights !== null && !timeRange && (
                      <div className={styles.summaryRow}>
                        <dt>{t('bookings.checkout.summary.nights')}</dt>
                        <dd>{nights}</dd>
                      </div>
                    )}
                  </>
                )}
                {holdItem.quantity > 1 && (
                  <div className={styles.summaryRow}>
                    <dt>{t('bookings.checkout.summary.quantity')}</dt>
                    <dd>{holdItem.quantity}</dd>
                  </div>
                )}
                {guestCount && (
                  <div className={styles.summaryRow}>
                    <dt>
                      {t(
                        isRestaurantReservation
                          ? 'bookings.checkout.summary.partySize'
                          : 'bookings.checkout.summary.guests',
                      )}
                    </dt>
                    <dd>{guestCount}</dd>
                  </div>
                )}
              </dl>
              <div className={styles.summaryTotalRow}>
                <strong>{t('bookings.checkout.summary.total')}</strong>
                {estimatedTotal ? (
                  <Money
                    amountAmd={estimatedTotal.amount}
                    suffix={t('bookings.checkout.summary.estimateSuffix')}
                    locale={locale}
                  />
                ) : (
                  <span>{t('bookings.checkout.summary.unavailable')}</span>
                )}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
