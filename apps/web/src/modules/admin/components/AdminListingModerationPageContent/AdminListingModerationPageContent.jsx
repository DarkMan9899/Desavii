/**
 * AdminListingModerationPageContent — `/:locale/admin/listings` (Listing
 * Moderation). Orchestrator, same shape as `AdminPartnersPageContent`:
 * URL-synced keyword/moderationStatus/status filters
 * (`useAdminListFilters`) over the `useAdminListingsQuery` infinite
 * query, rendered via the shared `DataTable` primitive.
 *
 * Step M3: defaults to `status=PENDING_REVIEW` (not
 * `moderationStatus=PENDING`) so landing on the page shows the real
 * Step M2B moderation queue — a listing that was created but never
 * submitted is also `moderation_status=PENDING`, so filtering on that
 * alone would mix genuinely-actionable PENDING_REVIEW listings with
 * untouched drafts nobody asked anyone to look at. The status filter
 * still supports every other value (including "All statuses") for
 * broader admin browsing — this only changes what a moderator sees the
 * moment they land here.
 *
 * Actions are derived per row from `getAllowedModerationActions`
 * (mirrors the backend's own closed decision matrix — never every
 * action for every row) and gated on `listing.moderate` client-side, on
 * top of the backend's own enforcement (brief §5: the queue previously
 * rendered Approve/Reject unconditionally, unlike the detail page,
 * which already gated on `canModerate` — this normalizes the two).
 *
 * Approve/Flag need no extra input, so they reuse the shared
 * `useConfirm()` modal exactly like every other admin toggle. Return
 * for changes/Reject collect a REQUIRED reason (`listings.
 * moderation_notes` — Step M2B requires a non-empty reason for any
 * REJECTED decision) — `useConfirm()`'s modal only ever resolves a
 * boolean, so it can't host a controlled textarea (the modal's own
 * React tree is frozen at the moment `confirm()` is called, meaning a
 * textarea inside it would not re-render as the moderator types); a
 * small local `Modal` rendered directly in this component's own tree is
 * used instead, so the reason field stays fully controlled.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Input, Select, Textarea } from '@desavii/ui/components/form-controls';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Modal, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Search } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import {
  ListingStatusBadge,
  ListingLifecycleStatus,
} from '../../../listings/index.js';
import { useAdminListFilters } from '../../hooks/useAdminListFilters.js';
import { useAdminListingsQuery } from '../../queries/useAdminListingsQuery.js';
import { useUpdateListingModerationStatusMutation } from '../../mutations/useUpdateListingModerationStatusMutation.js';
import {
  getAllowedModerationActions,
  moderationErrorMessageKey,
} from '../../utils/listingModerationActions.js';

const MODERATION_BADGE_VARIANT = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  FLAGGED: 'danger',
};

const DEFAULT_FILTERS = {
  keyword: '',
  moderationStatus: '',
  status: 'PENDING_REVIEW',
  lifecycleFilter: '',
};

// Confirm-modal actions (no reason collected) — `kind` -> i18n key suffixes.
const CONFIRM_ACTION_COPY = {
  approve: {
    titleKey: 'approveConfirmTitle',
    descriptionKey: 'approveConfirmDescription',
    labelKey: 'approveAction',
    successKey: 'approveSuccess',
    variant: 'primary',
  },
  flag: {
    titleKey: 'flagConfirmTitle',
    descriptionKey: 'flagConfirmDescription',
    labelKey: 'flagAction',
    successKey: 'flagSuccess',
    variant: 'destructive',
  },
};

// Reason-dialog actions (a non-empty reason is required) — same shape.
const REASON_ACTION_COPY = {
  returnForChanges: {
    titleKey: 'returnForChangesDialogTitle',
    descriptionKey: 'returnForChangesDialogDescription',
    labelKey: 'returnForChangesAction',
    successKey: 'returnForChangesSuccess',
  },
  reject: {
    titleKey: 'rejectDialogTitle',
    descriptionKey: 'rejectDialogDescription',
    labelKey: 'rejectAction',
    successKey: 'rejectSuccess',
  },
};

export default function AdminListingModerationPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { permissions } = useAuth();
  const canModerate = permissions.includes('listing.moderate');
  const confirm = useConfirm();
  const { showToast } = useToast();

  const { filters, updateFilters } = useAdminListFilters(DEFAULT_FILTERS);
  const [keywordText, setKeywordText] = useState(filters.keyword);
  const [reasonDialog, setReasonDialog] = useState(null); // { listing, kind }
  const [reasonText, setReasonText] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminListingsQuery({
    keyword: filters.keyword,
    moderationStatus: filters.moderationStatus,
    status: filters.status,
    lifecycleFilter: filters.lifecycleFilter,
  });
  const updateModerationMutation = useUpdateListingModerationStatusMutation();

  const listings = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );

  const moderationOptions = [
    { value: '', label: t('admin.listingModeration.filters.moderationAll') },
    {
      value: 'PENDING',
      label: t('admin.listingModeration.moderationStatus.PENDING'),
    },
    {
      value: 'APPROVED',
      label: t('admin.listingModeration.moderationStatus.APPROVED'),
    },
    {
      value: 'REJECTED',
      label: t('admin.listingModeration.moderationStatus.REJECTED'),
    },
    {
      value: 'FLAGGED',
      label: t('admin.listingModeration.moderationStatus.FLAGGED'),
    },
  ];
  const statusOptions = [
    { value: '', label: t('admin.listingModeration.filters.statusAll') },
    { value: 'DRAFT', label: t('admin.listingModeration.status.DRAFT') },
    {
      value: 'PENDING_REVIEW',
      label: t('admin.listingModeration.status.PENDING_REVIEW'),
    },
    {
      value: 'PUBLISHED',
      label: t('admin.listingModeration.status.PUBLISHED'),
    },
    {
      value: 'UNPUBLISHED',
      label: t('admin.listingModeration.status.UNPUBLISHED'),
    },
    { value: 'ARCHIVED', label: t('admin.listingModeration.status.ARCHIVED') },
  ];
  const lifecycleOptions = [
    { value: '', label: t('admin.listingModeration.filters.lifecycleAll') },
    {
      value: 'ACTIVE',
      label: t('admin.listingModeration.filters.lifecycle.ACTIVE'),
    },
    {
      value: 'EXPIRING_SOON',
      label: t('admin.listingModeration.filters.lifecycle.EXPIRING_SOON'),
    },
    {
      value: 'EXPIRED_FROZEN',
      label: t('admin.listingModeration.filters.lifecycle.EXPIRED_FROZEN'),
    },
  ];

  async function runMutation(listing, status, notes) {
    try {
      await updateModerationMutation.mutateAsync({
        id: listing.id,
        status,
        notes,
      });
      return true;
    } catch (err) {
      showToast(t(moderationErrorMessageKey(err)), { variant: 'danger' });
      return false;
    }
  }

  async function handleConfirmAction(listing, decision) {
    const copy = CONFIRM_ACTION_COPY[decision.kind];
    const confirmed = await confirm({
      title: t(`admin.listingModeration.${copy.titleKey}`, {
        title: listing.title,
      }),
      description: t(`admin.listingModeration.${copy.descriptionKey}`),
      confirmLabel: t(`admin.listingModeration.${copy.labelKey}`),
      cancelLabel: t('common.cancel'),
      variant: copy.variant,
    });
    if (!confirmed) return;

    const ok = await runMutation(listing, decision.status);
    if (ok) {
      showToast(t(`admin.listingModeration.${copy.successKey}`), {
        variant: 'success',
      });
    }
  }

  function openReasonDialog(listing, decision) {
    setReasonText('');
    setReasonTouched(false);
    setReasonDialog({ listing, decision });
  }

  // A stable reference matters here, not just style: `useFocusTrap`'s
  // effect depends on `onClose`, so a fresh inline arrow on every render
  // (e.g. from the reason textarea's own keystroke-driven re-renders)
  // would tear the keydown listener + focus-restore effect down and
  // rebuild it on every keystroke, yanking focus out of the textarea
  // mid-type.
  const closeReasonDialog = useCallback(() => setReasonDialog(null), []);

  const trimmedReason = reasonText.trim();
  const reasonIsInvalid = reasonTouched && trimmedReason.length === 0;

  async function handleConfirmReason() {
    setReasonTouched(true);
    if (!trimmedReason) return;

    const copy = REASON_ACTION_COPY[reasonDialog.decision.kind];
    const ok = await runMutation(
      reasonDialog.listing,
      reasonDialog.decision.status,
      trimmedReason,
    );
    if (ok) {
      showToast(t(`admin.listingModeration.${copy.successKey}`), {
        variant: 'success',
      });
      setReasonDialog(null);
    }
  }

  function handleAction(listing, decision) {
    if (decision.requiresReason) {
      openReasonDialog(listing, decision);
    } else {
      handleConfirmAction(listing, decision);
    }
  }

  const columns = [
    {
      key: 'title',
      header: t('admin.listingModeration.table.title'),
      render: (listing) =>
        listing.title ? (
          <RouterLink href={`/${locale}/admin/listings/${listing.id}`}>
            {listing.title}
          </RouterLink>
        ) : (
          '—'
        ),
    },
    {
      key: 'partner',
      header: t('admin.listingModeration.table.partner'),
      render: (listing) =>
        listing.partner_id ? (
          <RouterLink href={`/${locale}/admin/partners/${listing.partner_id}`}>
            {listing.partner_display_name}
          </RouterLink>
        ) : (
          listing.partner_display_name
        ),
    },
    {
      key: 'submitted',
      header: t('admin.listingModeration.table.submitted'),
      render: (listing) =>
        listing.created_at
          ? dateFormatter.format(new Date(listing.created_at))
          : '—',
    },
    {
      key: 'status',
      header: t('admin.listingModeration.table.status'),
      render: (listing) => <ListingStatusBadge status={listing.status} />,
    },
    {
      key: 'lifecycle',
      header: t('admin.listingModeration.table.lifecycle'),
      render: (listing) => (
        <ListingLifecycleStatus listing={listing} locale={i18n.language} />
      ),
    },
    {
      key: 'moderation',
      header: t('admin.listingModeration.table.moderation'),
      render: (listing) => (
        <Badge
          variant={
            MODERATION_BADGE_VARIANT[listing.moderation_status] ?? 'neutral'
          }
          size="sm"
          label={t(
            `admin.listingModeration.moderationStatus.${listing.moderation_status}`,
            { defaultValue: listing.moderation_status },
          )}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (listing) => {
        if (!canModerate) return null;
        const actions = getAllowedModerationActions(listing);
        if (actions.length === 0) return null;
        return (
          <Inline gap="2">
            {actions.map((decision) => {
              const copy =
                CONFIRM_ACTION_COPY[decision.kind] ??
                REASON_ACTION_COPY[decision.kind];
              return (
                <Button
                  key={decision.status}
                  variant={
                    decision.kind === 'approve' ? 'primary' : 'destructive'
                  }
                  size="sm"
                  onClick={() => handleAction(listing, decision)}
                  disabled={updateModerationMutation.isPending}
                  loading={
                    updateModerationMutation.isPending &&
                    updateModerationMutation.variables?.id === listing.id &&
                    updateModerationMutation.variables?.status ===
                      decision.status
                  }
                >
                  {t(`admin.listingModeration.${copy.labelKey}`)}
                </Button>
              );
            })}
          </Inline>
        );
      },
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.listingModeration.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.listingModeration.heading'),
            href: `/${locale}/admin/listings`,
          },
        ]}
      />

      {isError ? (
        <ErrorState
          title={t('admin.listingModeration.error.title')}
          retryLabel={t('admin.listingModeration.error.retry')}
          onRetry={refetch}
        />
      ) : (
        <Stack gap="4">
          <Inline gap="3" wrap>
            <Input
              aria-label={t('admin.listingModeration.filters.keywordLabel')}
              placeholder={t(
                'admin.listingModeration.filters.keywordPlaceholder',
              )}
              value={keywordText}
              onChange={(event) => setKeywordText(event.target.value)}
              onBlur={() => updateFilters({ keyword: keywordText })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  updateFilters({ keyword: keywordText });
                }
              }}
              iconLeft={<Search size={18} aria-hidden="true" />}
            />
            <Select
              ariaLabel={t('admin.listingModeration.filters.moderationLabel')}
              options={moderationOptions}
              value={filters.moderationStatus}
              onChange={(value) => updateFilters({ moderationStatus: value })}
            />
            <Select
              ariaLabel={t('admin.listingModeration.filters.statusLabel')}
              options={statusOptions}
              value={filters.status}
              onChange={(value) => updateFilters({ status: value })}
            />
            <Select
              ariaLabel={t('admin.listingModeration.filters.lifecycleLabel')}
              options={lifecycleOptions}
              value={filters.lifecycleFilter}
              onChange={(value) => updateFilters({ lifecycleFilter: value })}
            />
          </Inline>

          <DataTable
            columns={columns}
            rows={listings}
            isLoading={isPending}
            emptyTitle={t('admin.listingModeration.empty.title')}
            emptyDescription={t('admin.listingModeration.empty.description')}
            hasMore={Boolean(hasNextPage)}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            loadMoreLabel={t('admin.listingModeration.loadMore')}
          />
        </Stack>
      )}

      {reasonDialog && (
        <Modal
          isOpen
          onClose={closeReasonDialog}
          title={t(
            `admin.listingModeration.${REASON_ACTION_COPY[reasonDialog.decision.kind].titleKey}`,
            { title: reasonDialog.listing.title },
          )}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={closeReasonDialog}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmReason()}
                loading={updateModerationMutation.isPending}
                disabled={reasonTouched && trimmedReason.length === 0}
              >
                {t(
                  `admin.listingModeration.${REASON_ACTION_COPY[reasonDialog.decision.kind].labelKey}`,
                )}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <span>
              {t(
                `admin.listingModeration.${REASON_ACTION_COPY[reasonDialog.decision.kind].descriptionKey}`,
              )}
            </span>
            <Textarea
              label={t('admin.listingModeration.reasonLabel')}
              placeholder={t('admin.listingModeration.reasonPlaceholder')}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              onBlur={() => setReasonTouched(true)}
              rows={4}
              required
              error={
                reasonIsInvalid
                  ? t('admin.listingModeration.reasonRequiredHint')
                  : undefined
              }
            />
          </Stack>
        </Modal>
      )}
    </Section>
  );
}
