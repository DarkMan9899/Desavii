/**
 * ModerationHistoryPanel — real moderation history for one listing,
 * sourced from the generic `audit_logs` table (there is no dedicated
 * `listing_moderation_history` table — `listings.moderation_notes` is
 * overwritten in place on every status change, so the audit log's
 * `before_snapshot`/`after_snapshot` is the only real record of what
 * changed and when; see `listingService.js#submitForReview`/
 * `#updateModerationStatus`).
 *
 * Step M3: widened from the single `listing.moderation_status_changed`
 * action filter to also include `listing.submitted_for_review` (Step
 * M2B's other moderation-relevant action) — the backend's `/audit-logs`
 * endpoint only accepts one exact `action` string, so both are fetched
 * unfiltered by action and narrowed to just these two client-side,
 * rather than showing every `listing.*` audit action ever recorded
 * (ordinary content edits included) or requiring two separate paginated
 * queries. `renderEntry` branches presentation on `entry.action` only
 * because a submit entry's snapshot shape genuinely differs (a
 * `statusCode` transition, not a `moderationStatusCode` one — before/
 * after `moderationStatusCode` is the same PENDING on a submission,
 * which would render as a meaningless "Pending → Pending" badge pair).
 *
 * Rendered by the caller whenever the signed-in admin holds `audit.view`
 * OR `listing.moderate` (Step M3.1 closed the previous gap where a
 * MODERATOR — who holds `listing.moderate` but not the global
 * `audit.view` — could not see this listing's own history at all). The
 * two permissions read from two different backend surfaces, chosen via
 * the `canModerate` prop:
 *  - `canModerate` (holds `listing.moderate`): `GET
 *    /listings/admin/:id/moderation-history`
 *    (`useListingModerationHistoryQuery`) — pre-scoped to this one
 *    listing server-side, requires only `listing.moderate`.
 *  - otherwise (holds `audit.view` only, e.g. SUPPORT): the pre-existing
 *    generic `GET /admin/audit-logs` (`useAdminAuditLogsQuery`),
 *    unchanged from before Step M3.1.
 * Both hooks are always called (Rules of Hooks) but only one is
 * `enabled` at a time, so only one request ever actually fires.
 */

import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Badge, Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Skeleton, EmptyState } from '@desavii/ui/components/feedback-overlays';
import { useAdminAuditLogsQuery } from '../../queries/useAdminAuditLogsQuery.js';
import { useListingModerationHistoryQuery } from '../../queries/useListingModerationHistoryQuery.js';

const MODERATION_BADGE_VARIANT = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  FLAGGED: 'danger',
};

const STATUS_BADGE_VARIANT = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  PUBLISHED: 'success',
  UNPUBLISHED: 'neutral',
  ARCHIVED: 'neutral',
};

const RELEVANT_ACTIONS = new Set([
  'listing.moderation_status_changed',
  'listing.submitted_for_review',
]);

export default function ModerationHistoryPanel({
  listingId,
  canModerate = false,
}) {
  const { t, i18n } = useTranslation();
  const scopedQuery = useListingModerationHistoryQuery(listingId, {
    enabled: canModerate,
  });
  const genericQuery = useAdminAuditLogsQuery({
    targetType: 'listing',
    targetId: listingId,
    enabled: !canModerate,
  });
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    canModerate ? scopedQuery : genericQuery;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language],
  );

  const entries = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.results) ?? []).filter((entry) =>
        RELEVANT_ACTIONS.has(entry.action),
      ),
    [data],
  );

  if (isPending) return <Skeleton variant="text" width="70%" />;

  if (entries.length === 0) {
    return <EmptyState title={t('admin.listingDetail.history.empty')} />;
  }

  function renderModerationStatusEntry(entry) {
    const fromCode = entry.before_snapshot?.moderationStatusCode;
    const toCode = entry.after_snapshot?.moderationStatusCode;
    const notes = entry.after_snapshot?.notes;
    return (
      <>
        <Inline gap="2" align="center" wrap>
          {fromCode && (
            <Badge
              variant={MODERATION_BADGE_VARIANT[fromCode] ?? 'neutral'}
              size="sm"
              label={t(`admin.listingModeration.moderationStatus.${fromCode}`, {
                defaultValue: fromCode,
              })}
            />
          )}
          <span aria-hidden="true">→</span>
          {toCode && (
            <Badge
              variant={MODERATION_BADGE_VARIANT[toCode] ?? 'neutral'}
              size="sm"
              label={t(`admin.listingModeration.moderationStatus.${toCode}`, {
                defaultValue: toCode,
              })}
            />
          )}
        </Inline>
        {notes && (
          <span>
            {t('admin.listingDetail.history.notesPrefix')} {notes}
          </span>
        )}
      </>
    );
  }

  function renderSubmittedForReviewEntry(entry) {
    const fromCode = entry.before_snapshot?.statusCode;
    const toCode = entry.after_snapshot?.statusCode;
    return (
      <>
        <span>{t('admin.listingDetail.history.submittedForReview')}</span>
        <Inline gap="2" align="center" wrap>
          {fromCode && (
            <Badge
              variant={STATUS_BADGE_VARIANT[fromCode] ?? 'neutral'}
              size="sm"
              label={t(`admin.listingModeration.status.${fromCode}`, {
                defaultValue: fromCode,
              })}
            />
          )}
          <span aria-hidden="true">→</span>
          {toCode && (
            <Badge
              variant={STATUS_BADGE_VARIANT[toCode] ?? 'neutral'}
              size="sm"
              label={t(`admin.listingModeration.status.${toCode}`, {
                defaultValue: toCode,
              })}
            />
          )}
        </Inline>
      </>
    );
  }

  return (
    <Stack gap="3">
      <h3>{t('admin.listingDetail.history.heading')}</h3>
      {entries.map((entry) => (
        <Card key={entry.id} padding="md">
          <Stack gap="1">
            <Inline justify="space-between" wrap align="center">
              <span>{dateFormatter.format(new Date(entry.created_at))}</span>
              <span>
                {entry.actor_name || t('admin.auditLogs.systemActor')}
              </span>
            </Inline>
            {entry.action === 'listing.submitted_for_review'
              ? renderSubmittedForReviewEntry(entry)
              : renderModerationStatusEntry(entry)}
          </Stack>
        </Card>
      ))}
      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchNextPage()}
          loading={isFetchingNextPage}
        >
          {t('admin.listingModeration.loadMore')}
        </Button>
      )}
    </Stack>
  );
}

ModerationHistoryPanel.propTypes = {
  listingId: PropTypes.number.isRequired,
  canModerate: PropTypes.bool,
};
