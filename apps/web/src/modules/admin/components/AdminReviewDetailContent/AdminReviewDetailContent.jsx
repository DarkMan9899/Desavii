/**
 * AdminReviewDetailContent — `/:locale/admin/reviews/:id` (Admin Sprint
 * 4). Previously reviews had no real detail route — moderation happened
 * entirely from the queue, and a review's reports were only reachable
 * through a thin read-only modal (`ReviewReportsModal`, now removed)
 * that showed just `reason_name`/`details`, in raw English, with no
 * reporter identity or timestamp. This page reuses the exact same admin
 * detail endpoint that modal already called (`GET /reviews/admin/:id`,
 * `useAdminReviewDetailQuery` — real, already-shipped data, just not
 * previously given a real page) and surfaces the rest of what it always
 * returned: full report list with reporter/reason/date.
 *
 * Report `reason` is rendered via `admin.reviewModeration.reportReason.*`
 * (the real `review_report_reasons.code`), never the DTO's own
 * `reason_name` — that field is a fixed English label from the lookup
 * table, not translated per admin locale; using it directly was a real
 * localization bug the old reports modal had.
 *
 * There is no dedicated moderation-history table for reviews (unlike
 * Listings/Bookings) — `moderation_notes`/`moderated_by`/`moderated_at`
 * are single latest-value columns, overwritten on every action. This
 * page shows exactly that: the current moderation state, not an
 * invented timeline.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Card, Button } from '@desavii/ui/components/primitives';
import { Textarea } from '@desavii/ui/components/form-controls';
import { RatingStars } from '@desavii/ui/components/data-display';
import {
  Spinner,
  ErrorState,
  EmptyState,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useAdminReviewDetailQuery } from '../../queries/useAdminReviewDetailQuery.js';
import { useUpdateReviewModerationStatusMutation } from '../../mutations/useUpdateReviewModerationStatusMutation.js';
import { ReviewModerationStatusBadge } from '../../../reviews/index.js';
import { ratingLabel } from '../../../../utils/formatRating.js';

export default function AdminReviewDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const reviewId = Number(id);
  const canModerate = permissions.includes('review.moderate');

  const {
    data: review,
    isPending,
    isError,
    error,
    refetch,
  } = useAdminReviewDetailQuery(reviewId);

  const updateModerationMutation = useUpdateReviewModerationStatusMutation();
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const closeRejectDialog = useCallback(() => setIsRejectOpen(false), []);

  if (isPending) {
    return (
      <Section aria-label={t('admin.reviewDetail.loading')}>
        <Spinner label={t('admin.reviewDetail.loading')} />
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
          onAction={() => navigate(`/${locale}/admin/reviews`)}
        />
      );
    }
    return (
      <Section>
        <ErrorState
          title={t('admin.reviewModeration.error.title')}
          retryLabel={t('admin.reviewModeration.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const heading = review.title || t('admin.reviewDetail.headingFallback');
  const dateFormatter = createDateFormatter(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const reports = review.reports ?? [];

  async function handleApprove() {
    const confirmed = await confirm({
      title: t('admin.reviewModeration.approveConfirmTitle'),
      description: t('admin.reviewModeration.approveConfirmDescription'),
      confirmLabel: t('admin.reviewModeration.approveAction'),
      cancelLabel: t('common.cancel'),
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await updateModerationMutation.mutateAsync({
        id: reviewId,
        status: 'APPROVED',
      });
      showToast(t('admin.reviewModeration.approveSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.reviewModeration.statusError'), { variant: 'danger' });
    }
  }

  function openRejectDialog() {
    setRejectNotes('');
    setIsRejectOpen(true);
  }

  async function handleConfirmReject() {
    try {
      await updateModerationMutation.mutateAsync({
        id: reviewId,
        status: 'REJECTED',
        notes: rejectNotes.trim() || undefined,
      });
      showToast(t('admin.reviewModeration.rejectSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.reviewModeration.statusError'), { variant: 'danger' });
    } finally {
      setIsRejectOpen(false);
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
            label: t('admin.reviewModeration.heading'),
            href: `/${locale}/admin/reviews`,
          },
        ]}
      />
      <Stack gap="4">
        <Card as="div" padding="lg">
          <Stack gap="3">
            <Inline gap="3" align="center" wrap>
              <RatingStars
                value={review.rating}
                locale={i18n.language}
                label={ratingLabel(t, i18n.language, review.rating)}
              />
              <ReviewModerationStatusBadge status={review.status} />
            </Inline>
            {review.content && <p>{review.content}</p>}
            <span>{dateFormatter.format(new Date(review.created_at))}</span>
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="2">
            <h2>{t('admin.reviewDetail.author')}</h2>
            <RouterLink
              href={`/${locale}/admin/users/${review.customer_user_id}`}
            >
              {review.customer_display_name ??
                t('admin.reviewDetail.userLink', {
                  id: review.customer_user_id,
                })}
            </RouterLink>
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="2">
            <h2>{t('admin.reviewDetail.listing')}</h2>
            <RouterLink href={`/${locale}/admin/listings/${review.listing_id}`}>
              {review.listing_title ??
                t('admin.bookingDetail.listingId', { id: review.listing_id })}
            </RouterLink>
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('admin.reviewDetail.moderation')}</h2>
            {review.moderation_notes && (
              <p>
                {t('admin.reviewDetail.moderationNotes')}:{' '}
                {review.moderation_notes}
              </p>
            )}
            {review.moderated_by && (
              <p>
                {t('admin.reviewDetail.moderatedBy')}:{' '}
                <RouterLink
                  href={`/${locale}/admin/users/${review.moderated_by}`}
                >
                  {t('admin.reviewDetail.userLink', {
                    id: review.moderated_by,
                  })}
                </RouterLink>
                {review.moderated_at &&
                  ` — ${dateFormatter.format(new Date(review.moderated_at))}`}
              </p>
            )}
            {canModerate && (
              <Inline gap="2" wrap>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApprove()}
                  loading={
                    updateModerationMutation.isPending &&
                    updateModerationMutation.variables?.status === 'APPROVED'
                  }
                >
                  {t('admin.reviewModeration.approveAction')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openRejectDialog()}
                >
                  {t('admin.reviewModeration.rejectAction')}
                </Button>
              </Inline>
            )}
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('admin.reviewDetail.reports.heading')}</h2>
            {reports.length === 0 ? (
              <EmptyState title={t('admin.reviewDetail.reports.empty')} />
            ) : (
              reports.map((report) => (
                <Card key={report.id} padding="md">
                  <Stack gap="1">
                    <Inline justify="space-between" wrap align="center">
                      <strong>
                        {t(
                          `admin.reviewModeration.reportReason.${report.reason}`,
                          { defaultValue: report.reason },
                        )}
                      </strong>
                      <span>
                        {dateFormatter.format(new Date(report.created_at))}
                      </span>
                    </Inline>
                    <RouterLink
                      href={`/${locale}/admin/users/${report.reporter_user_id}`}
                    >
                      {t('admin.reviewDetail.userLink', {
                        id: report.reporter_user_id,
                      })}
                    </RouterLink>
                    {report.details && <p>{report.details}</p>}
                  </Stack>
                </Card>
              ))
            )}
          </Stack>
        </Card>
      </Stack>

      {isRejectOpen && (
        <Modal
          isOpen
          onClose={closeRejectDialog}
          title={t('admin.reviewModeration.rejectDialogTitle')}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={closeRejectDialog}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmReject()}
                loading={updateModerationMutation.isPending}
              >
                {t('admin.reviewModeration.rejectAction')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <span>{t('admin.reviewModeration.rejectDialogDescription')}</span>
            <Textarea
              label={t('admin.reviewModeration.notesLabel')}
              placeholder={t('admin.reviewModeration.notesPlaceholder')}
              value={rejectNotes}
              onChange={(event) => setRejectNotes(event.target.value)}
              rows={4}
            />
          </Stack>
        </Modal>
      )}
    </Section>
  );
}
