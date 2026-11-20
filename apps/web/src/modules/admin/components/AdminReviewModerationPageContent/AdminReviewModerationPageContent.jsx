/**
 * AdminReviewModerationPageContent — `/:locale/admin/reviews` (P1.5,
 * Master Roadmap: Review Trust & Safety; Admin Sprint 4). Same
 * orchestrator shape as `AdminListingModerationPageContent`: URL-synced
 * moderationStatus/hasReports filters (`useAdminListFilters`) over the
 * `useAdminReviewsQuery` infinite query, rendered via the shared
 * `DataTable` primitive. Defaults to `moderationStatus=` (all) +
 * `hasReports=true` so landing on the page shows the actual queue that
 * needs attention — reviews someone flagged — not the full, mostly
 * already-fine review corpus.
 *
 * Approve needs no extra input (`useConfirm()`); Reject collects an
 * optional free-text reason via a small local controlled `Modal`, same
 * "`useConfirm()` can't host a controlled textarea" reasoning
 * `AdminListingModerationPageContent.jsx`'s own header comment explains.
 *
 * The Content column links to the new `AdminReviewDetailContent` page
 * (`/admin/reviews/:id`, Admin Sprint 4) — replaces the previous
 * reports-only modal, which duplicated a subset of what the real detail
 * page now shows properly (full text, reporter identity, localized
 * report reasons).
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select, Textarea } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Modal, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { RatingStars } from '@desavii/ui/components/data-display';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useAdminListFilters } from '../../hooks/useAdminListFilters.js';
import { useAdminReviewsQuery } from '../../queries/useAdminReviewsQuery.js';
import { useUpdateReviewModerationStatusMutation } from '../../mutations/useUpdateReviewModerationStatusMutation.js';
import { ReviewModerationStatusBadge } from '../../../reviews/index.js';
import { ratingLabel } from '../../../../utils/formatRating.js';

const DEFAULT_FILTERS = { moderationStatus: '', hasReports: 'true' };
const CONTENT_PREVIEW_LENGTH = 120;

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export default function AdminReviewModerationPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const { filters, updateFilters } = useAdminListFilters(DEFAULT_FILTERS);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminReviewsQuery({
    moderationStatus: filters.moderationStatus,
    hasReports: filters.hasReports === 'true',
  });
  const updateModerationMutation = useUpdateReviewModerationStatusMutation();

  const reviews = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const moderationOptions = [
    { value: '', label: t('admin.reviewModeration.filters.moderationAll') },
    {
      value: 'PENDING',
      label: t('admin.reviewModeration.moderationStatus.PENDING'),
    },
    {
      value: 'APPROVED',
      label: t('admin.reviewModeration.moderationStatus.APPROVED'),
    },
    {
      value: 'REJECTED',
      label: t('admin.reviewModeration.moderationStatus.REJECTED'),
    },
    {
      value: 'FLAGGED',
      label: t('admin.reviewModeration.moderationStatus.FLAGGED'),
    },
  ];
  const hasReportsOptions = [
    { value: 'true', label: t('admin.reviewModeration.filters.reportedOnly') },
    { value: 'false', label: t('admin.reviewModeration.filters.allReviews') },
  ];

  async function handleApprove(review) {
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
        id: review.id,
        status: 'APPROVED',
      });
      showToast(t('admin.reviewModeration.approveSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.reviewModeration.statusError'), {
        variant: 'danger',
      });
    }
  }

  function openRejectDialog(review) {
    setRejectNotes('');
    setRejectTarget(review);
  }

  const closeRejectDialog = useCallback(() => setRejectTarget(null), []);

  async function handleConfirmReject() {
    try {
      await updateModerationMutation.mutateAsync({
        id: rejectTarget.id,
        status: 'REJECTED',
        notes: rejectNotes.trim() || undefined,
      });
      showToast(t('admin.reviewModeration.rejectSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.reviewModeration.statusError'), {
        variant: 'danger',
      });
    } finally {
      setRejectTarget(null);
    }
  }

  const columns = [
    {
      key: 'listing',
      header: t('admin.reviewModeration.table.listing'),
      render: (review) => review.listing_title ?? '—',
    },
    {
      key: 'customer',
      header: t('admin.reviewModeration.table.customer'),
      render: (review) => review.customer_display_name,
    },
    {
      key: 'rating',
      header: t('admin.reviewModeration.table.rating'),
      render: (review) => (
        <RatingStars
          value={review.rating}
          size="sm"
          locale={i18n.language}
          label={ratingLabel(t, i18n.language, review.rating)}
        />
      ),
    },
    {
      key: 'content',
      header: t('admin.reviewModeration.table.content'),
      render: (review) =>
        review.content ? (
          <RouterLink href={`/${locale}/admin/reviews/${review.id}`}>
            {truncate(review.content, CONTENT_PREVIEW_LENGTH)}
          </RouterLink>
        ) : (
          <RouterLink href={`/${locale}/admin/reviews/${review.id}`}>
            {t('admin.reviewModeration.noContent')}
          </RouterLink>
        ),
    },
    {
      key: 'status',
      header: t('admin.reviewModeration.table.status'),
      render: (review) => (
        <ReviewModerationStatusBadge status={review.status} size="sm" />
      ),
    },
    {
      key: 'reports',
      header: t('admin.reviewModeration.table.reports'),
      render: (review) =>
        review.report_count > 0
          ? t('admin.reviewModeration.reportCount', {
              count: review.report_count,
            })
          : '—',
    },
    {
      key: 'actions',
      header: '',
      render: (review) => (
        <Inline gap="2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleApprove(review)}
            loading={
              updateModerationMutation.isPending &&
              updateModerationMutation.variables?.id === review.id &&
              updateModerationMutation.variables?.status === 'APPROVED'
            }
          >
            {t('admin.reviewModeration.approveAction')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => openRejectDialog(review)}
          >
            {t('admin.reviewModeration.rejectAction')}
          </Button>
        </Inline>
      ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.reviewModeration.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.reviewModeration.heading'),
            href: `/${locale}/admin/reviews`,
          },
        ]}
      />

      {isError ? (
        <ErrorState
          title={t('admin.reviewModeration.error.title')}
          retryLabel={t('admin.reviewModeration.error.retry')}
          onRetry={refetch}
        />
      ) : (
        <Stack gap="4">
          <Inline gap="3" wrap>
            <Select
              ariaLabel={t('admin.reviewModeration.filters.moderationLabel')}
              options={moderationOptions}
              value={filters.moderationStatus}
              onChange={(value) => updateFilters({ moderationStatus: value })}
            />
            <Select
              ariaLabel={t('admin.reviewModeration.filters.reportedLabel')}
              options={hasReportsOptions}
              value={filters.hasReports}
              onChange={(value) => updateFilters({ hasReports: value })}
            />
          </Inline>

          <DataTable
            columns={columns}
            rows={reviews}
            isLoading={isPending}
            emptyTitle={t('admin.reviewModeration.empty.title')}
            emptyDescription={t('admin.reviewModeration.empty.description')}
            hasMore={Boolean(hasNextPage)}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            loadMoreLabel={t('admin.reviewModeration.loadMore')}
          />
        </Stack>
      )}

      {rejectTarget && (
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
