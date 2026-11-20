/**
 * AdminPartnerDetailContent — `/:locale/admin/partners/:id` (Partner
 * Management detail). Composes two independent reads (profile, recent
 * bookings) — each its own query/loading/error state, same reasoning
 * `AdminUserDetailContent` documents (a permission edge case on one
 * shouldn't block the other from rendering; a MODERATOR has
 * `partner.moderate` but not `booking.view_all`, so its bookings query
 * may legitimately fail while the profile still loads fine).
 *
 * Two independent action groups, matching the two independent status
 * columns this schema actually has (`partnerService.js`'s doc comment):
 * Verification (Approve/Reject, gated by `partner.verify`) and
 * Visibility/Moderation (Suspend/Restore, gated by `partner.moderate`).
 * Each group only renders for a role that actually holds its permission
 * (Phase 14.10 cleanup) — a role lacking both (e.g. SUPPORT) sees the
 * read-only profile with neither action group, rather than buttons that
 * always 403 on click.
 *
 * P1.2 (Master Roadmap): a third verification outcome, "Request
 * Changes" (NEEDS_CHANGES), only reachable from PENDING (see
 * `partnerService.js`'s `UNREVIEWABLE_STATUSES`/PENDING-only guard) —
 * DRAFT/NEEDS_CHANGES applications are still owned by the applicant and
 * have no reviewable verification action here at all, so the whole
 * Verification action group is hidden for those two statuses rather
 * than rendering buttons that would 409. The backend requires a
 * non-empty `reviewNote` for NEEDS_CHANGES, so that one action needs a
 * real text field — the shared `useConfirm()` (`ConfirmContext.jsx`) only
 * takes a plain title/description string and can't host one: its `Modal`
 * lives in `ConfirmProvider`, which snapshots `description` once into
 * its own `request` state at `confirm()`-call time, so a controlled
 * `Textarea` passed as that `description` would never re-render as the
 * admin types (its `value` prop is frozen to whatever it was at that one
 * snapshot). This action renders its own local `Modal` directly in this
 * component's tree instead, so the Textarea's `value`/`onChange` are
 * ordinary local state that re-renders normally on every keystroke.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Card, Badge, Button } from '@desavii/ui/components/primitives';
import { Textarea } from '@desavii/ui/components/form-controls';
import {
  Skeleton,
  EmptyState,
  ErrorState,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import { createNumberFormatter } from '@desavii/ui/utils/numberFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useAdminPartnerDetailQuery } from '../../queries/useAdminPartnerDetailQuery.js';
import { useAdminPartnerBookingsQuery } from '../../queries/useAdminPartnerBookingsQuery.js';
import { useUpdatePartnerVerificationStatusMutation } from '../../mutations/useUpdatePartnerVerificationStatusMutation.js';
import { useUpdatePartnerModerationStatusMutation } from '../../mutations/useUpdatePartnerModerationStatusMutation.js';

const VERIFICATION_BADGE_VARIANT = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  NEEDS_CHANGES: 'warning',
};

// PENDING is the only status a `partner.verify` holder may act on
// (`partnerService.js`'s `UNREVIEWABLE_STATUSES`) — DRAFT/NEEDS_CHANGES
// are still with the applicant, and APPROVED/REJECTED already have a
// decision (the existing free re-decision behavior below stays
// available from those two, matching `adminPartnerManagement.test.js`).
const VERIFICATION_ACTIONABLE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const MODERATION_BADGE_VARIANT = {
  APPROVED: 'success',
  FLAGGED: 'danger',
};

export default function AdminPartnerDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const { permissions } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canVerify = permissions.includes('partner.verify');
  const canModerate = permissions.includes('partner.moderate');

  const partnerQuery = useAdminPartnerDetailQuery(id);
  const canVerifyNow =
    canVerify &&
    VERIFICATION_ACTIONABLE_STATUSES.includes(
      partnerQuery.data?.verification_status,
    );
  const bookingsQuery = useAdminPartnerBookingsQuery(id);
  const verificationMutation = useUpdatePartnerVerificationStatusMutation();
  const moderationMutation = useUpdatePartnerModerationStatusMutation();

  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);
  const [reviewNoteValue, setReviewNoteValue] = useState('');
  // Reject's `reviewNote` is optional on the real backend contract
  // (`updateVerificationStatusSchema`) but was never wired up on this
  // page — it silently rejected with no reason recorded. Same local-
  // `Modal`-not-`useConfirm()` reasoning as Request Changes above (a
  // real Textarea needs real re-rendering state), just with an optional
  // field and no client-side non-empty guard.
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectNoteValue, setRejectNoteValue] = useState('');

  // Stable across renders on purpose: `Modal`'s focus trap
  // (`useFocusTrap.js`) re-runs its effect whenever `onClose`'s identity
  // changes, moving focus back to the dialog's first focusable element
  // each time — an inline arrow here would re-steal focus off the
  // Textarea on every keystroke (confirmed: typing beyond the first
  // character silently went nowhere).
  const handleCloseRequestChanges = useCallback(() => {
    setIsRequestChangesOpen(false);
  }, []);

  const handleCloseReject = useCallback(() => {
    setIsRejectOpen(false);
  }, []);

  if (partnerQuery.isError) {
    return (
      <Section spacing="default">
        <ErrorState
          title={t('admin.partnerDetail.error.title')}
          retryLabel={t('admin.partnerDetail.error.retry')}
          onRetry={partnerQuery.refetch}
        />
      </Section>
    );
  }

  const partner = partnerQuery.data;

  // Approve stays on the simple `useConfirm()` flow — the backend clears
  // `reviewNote` to null on APPROVED regardless ("nothing left to fix",
  // `partnerService.js`), so a text field here would collect input the
  // server discards.
  async function handleApprove() {
    const confirmed = await confirm({
      title: t('admin.partnerDetail.verification.approveConfirmTitle', {
        name: partner.display_name,
      }),
      description: t(
        'admin.partnerDetail.verification.approveConfirmDescription',
      ),
      confirmLabel: t('admin.partnerDetail.verification.approveAction'),
      cancelLabel: t('common.cancel'),
      variant: 'primary',
    });
    if (!confirmed) return;

    try {
      await verificationMutation.mutateAsync({
        id: partner.id,
        status: 'APPROVED',
      });
      showToast(t('admin.partnerDetail.verification.approveSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.partners.statusError'), { variant: 'danger' });
    }
  }

  function handleOpenReject() {
    setRejectNoteValue('');
    setIsRejectOpen(true);
  }

  async function handleConfirmReject() {
    const reviewNote = rejectNoteValue.trim();
    try {
      await verificationMutation.mutateAsync({
        id: partner.id,
        status: 'REJECTED',
        // Optional on the real backend contract — send it only when the
        // admin actually wrote one, never an empty string.
        ...(reviewNote ? { reviewNote } : {}),
      });
      setIsRejectOpen(false);
      showToast(t('admin.partnerDetail.verification.rejectSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.partners.statusError'), { variant: 'danger' });
    }
  }

  function handleOpenRequestChanges() {
    setReviewNoteValue('');
    setIsRequestChangesOpen(true);
  }

  async function handleConfirmRequestChanges() {
    const reviewNote = reviewNoteValue.trim();
    if (!reviewNote) {
      showToast(t('admin.partnerDetail.verification.reviewNoteRequired'), {
        variant: 'danger',
      });
      return;
    }

    try {
      await verificationMutation.mutateAsync({
        id: partner.id,
        status: 'NEEDS_CHANGES',
        reviewNote,
      });
      setIsRequestChangesOpen(false);
      showToast(t('admin.partnerDetail.verification.needsChangesSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.partners.statusError'), { variant: 'danger' });
    }
  }

  async function handleToggleModeration() {
    const nextStatus =
      partner.moderation_status === 'FLAGGED' ? 'APPROVED' : 'FLAGGED';
    const confirmed = await confirm({
      title: t(
        nextStatus === 'FLAGGED'
          ? 'admin.partners.suspendConfirmTitle'
          : 'admin.partners.restoreConfirmTitle',
        { name: partner.display_name },
      ),
      description: t(
        nextStatus === 'FLAGGED'
          ? 'admin.partners.suspendConfirmDescription'
          : 'admin.partners.restoreConfirmDescription',
      ),
      confirmLabel: t(
        nextStatus === 'FLAGGED'
          ? 'admin.partnerDetail.moderation.suspendAction'
          : 'admin.partnerDetail.moderation.restoreAction',
      ),
      cancelLabel: t('common.cancel'),
      variant: nextStatus === 'FLAGGED' ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    try {
      await moderationMutation.mutateAsync({
        id: partner.id,
        status: nextStatus,
      });
      showToast(
        t(
          nextStatus === 'FLAGGED'
            ? 'admin.partners.suspendSuccess'
            : 'admin.partners.restoreSuccess',
        ),
        { variant: 'success' },
      );
    } catch {
      showToast(t('admin.partners.statusError'), { variant: 'danger' });
    }
  }

  const bookings = bookingsQuery.data ?? [];

  return (
    <Section spacing="default">
      <PageHeader
        title={
          partner ? partner.display_name : t('admin.partnerDetail.loading')
        }
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.partners.heading'),
            href: `/${locale}/admin/partners`,
          },
        ]}
      />

      <Stack gap="6">
        <Card as="div" padding="lg">
          {partnerQuery.isPending ? (
            <Skeleton variant="text" width="60%" />
          ) : (
            <Stack gap="4">
              <Inline justify="space-between" align="center" wrap>
                <Stack gap="1">
                  <strong>{partner.email ?? '—'}</strong>
                  <span>
                    {t('admin.partnerDetail.owner')}:{' '}
                    {partner.owner
                      ? `${partner.owner.first_name} ${partner.owner.last_name} (${partner.owner.email})`
                      : t('admin.partnerDetail.noOwner')}
                  </span>
                  <span>
                    {t('admin.partnerDetail.stats.totalListings')}:{' '}
                    {partner.total_listing_count} ·{' '}
                    {t('admin.partnerDetail.stats.publishedListings')}:{' '}
                    {partner.published_listing_count}
                  </span>
                </Stack>
                <Inline gap="3" align="center" wrap>
                  <Badge
                    variant={
                      VERIFICATION_BADGE_VARIANT[partner.verification_status] ??
                      'neutral'
                    }
                    label={t(
                      `admin.partners.verificationStatus.${partner.verification_status}`,
                      { defaultValue: partner.verification_status },
                    )}
                  />
                  <Badge
                    variant={
                      MODERATION_BADGE_VARIANT[partner.moderation_status] ??
                      'neutral'
                    }
                    label={t(
                      `admin.partners.moderationStatus.${partner.moderation_status}`,
                      { defaultValue: partner.moderation_status },
                    )}
                  />
                </Inline>
              </Inline>

              {(partner.legal_name ||
                partner.phone ||
                partner.website ||
                partner.translations?.length > 0) && (
                <Card padding="md">
                  <Stack gap="1">
                    <strong>
                      {t('admin.partnerDetail.companyDetails.heading')}
                    </strong>
                    {partner.legal_name &&
                      partner.legal_name !== partner.display_name && (
                        <span>
                          {t('admin.partnerDetail.companyDetails.legalName')}:{' '}
                          {partner.legal_name}
                        </span>
                      )}
                    {partner.phone && (
                      <span>
                        {t('admin.partnerDetail.companyDetails.phone')}:{' '}
                        {partner.phone}
                      </span>
                    )}
                    {partner.website && (
                      <span>
                        {t('admin.partnerDetail.companyDetails.website')}:{' '}
                        <a
                          href={partner.website}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {partner.website}
                        </a>
                      </span>
                    )}
                    {(() => {
                      const description =
                        partner.translations?.find(
                          (row) => row.language_code === i18n.language,
                        )?.description ??
                        partner.translations?.[0]?.description;
                      return description ? <p>{description}</p> : null;
                    })()}
                  </Stack>
                </Card>
              )}

              {partner.review_note && (
                <Card padding="md">
                  <Stack gap="1">
                    <strong>
                      {t('admin.partnerDetail.verification.reviewNoteLabel')}
                    </strong>
                    <span>{partner.review_note}</span>
                  </Stack>
                </Card>
              )}

              {(canVerifyNow || canModerate) && (
                <Inline gap="3" wrap>
                  {canVerifyNow && (
                    <Stack gap="2">
                      <span>
                        {t('admin.partnerDetail.verification.heading')}
                      </span>
                      <Inline gap="2" wrap>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove()}
                          loading={verificationMutation.isPending}
                        >
                          {t('admin.partnerDetail.verification.approveAction')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleOpenReject()}
                        >
                          {t('admin.partnerDetail.verification.rejectAction')}
                        </Button>
                        {partner.verification_status === 'PENDING' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenRequestChanges()}
                          >
                            {t(
                              'admin.partnerDetail.verification.needsChangesAction',
                            )}
                          </Button>
                        )}
                      </Inline>
                    </Stack>
                  )}

                  {canModerate && (
                    <Stack gap="2">
                      <span>{t('admin.partnerDetail.moderation.heading')}</span>
                      <Button
                        variant={
                          partner.moderation_status === 'FLAGGED'
                            ? 'primary'
                            : 'destructive'
                        }
                        size="sm"
                        onClick={() => handleToggleModeration()}
                        loading={moderationMutation.isPending}
                      >
                        {t(
                          partner.moderation_status === 'FLAGGED'
                            ? 'admin.partnerDetail.moderation.restoreAction'
                            : 'admin.partnerDetail.moderation.suspendAction',
                        )}
                      </Button>
                    </Stack>
                  )}
                </Inline>
              )}
            </Stack>
          )}
        </Card>

        <Grid columns={2} gap="4">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('admin.partnerDetail.bookings.heading')}</h2>
              {bookingsQuery.isPending && (
                <Skeleton variant="text" width="80%" />
              )}
              {!bookingsQuery.isPending && bookings.length === 0 && (
                <EmptyState title={t('admin.partnerDetail.bookings.empty')} />
              )}
              {!bookingsQuery.isPending && bookings.length > 0 && (
                <Stack gap="2">
                  {bookings.map((booking) => (
                    <Inline
                      key={booking.id}
                      justify="space-between"
                      align="center"
                    >
                      <RouterLink
                        href={`/${locale}/admin/bookings/${booking.id}`}
                      >
                        {booking.booking_reference}
                      </RouterLink>
                      <Badge
                        variant="neutral"
                        size="sm"
                        // The `bookings.status.partner.*` override exists
                        // because the default copy is written from the
                        // customer's point of view ("Cancelled by you") —
                        // just as wrong for an admin looking at someone
                        // else's booking (see BookingStatusBadge.jsx).
                        label={
                          booking.status === 'CANCELLED_BY_CUSTOMER'
                            ? t('bookings.status.partner.CANCELLED_BY_CUSTOMER')
                            : t(`bookings.status.${booking.status}`, {
                                defaultValue: booking.status,
                              })
                        }
                      />
                      <span>
                        {createNumberFormatter(i18n.language).format(
                          booking.total_amount,
                        )}
                      </span>
                    </Inline>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>
      </Stack>

      {isRequestChangesOpen && (
        <Modal
          isOpen
          onClose={handleCloseRequestChanges}
          title={t(
            'admin.partnerDetail.verification.needsChangesConfirmTitle',
            {
              name: partner.display_name,
            },
          )}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={handleCloseRequestChanges}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmRequestChanges()}
                loading={verificationMutation.isPending}
              >
                {t('admin.partnerDetail.verification.needsChangesAction')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <p>
              {t(
                'admin.partnerDetail.verification.needsChangesConfirmDescription',
              )}
            </p>
            <Textarea
              label={t('admin.partnerDetail.verification.reviewNoteLabel')}
              value={reviewNoteValue}
              onChange={(event) => setReviewNoteValue(event.target.value)}
              placeholder={t(
                'admin.partnerDetail.verification.reviewNotePlaceholder',
              )}
              rows={4}
              required
            />
          </Stack>
        </Modal>
      )}

      {isRejectOpen && (
        <Modal
          isOpen
          onClose={handleCloseReject}
          title={t('admin.partnerDetail.verification.rejectConfirmTitle', {
            name: partner.display_name,
          })}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={handleCloseReject}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmReject()}
                loading={verificationMutation.isPending}
              >
                {t('admin.partnerDetail.verification.rejectAction')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <p>
              {t('admin.partnerDetail.verification.rejectConfirmDescription')}
            </p>
            <Textarea
              label={t('admin.partnerDetail.verification.reviewNoteLabel')}
              value={rejectNoteValue}
              onChange={(event) => setRejectNoteValue(event.target.value)}
              placeholder={t(
                'admin.partnerDetail.verification.rejectNotePlaceholder',
              )}
              helperText={t(
                'admin.partnerDetail.verification.reviewNoteOptionalHint',
              )}
              rows={4}
            />
          </Stack>
        </Modal>
      )}
    </Section>
  );
}
