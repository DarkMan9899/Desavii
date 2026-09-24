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
 * Only rendered by the caller when the signed-in admin already holds
 * `audit.view` (granted to SUPER_ADMIN/ADMIN/SUPPORT, not MODERATOR) —
 * this panel does not request or depend on any new permission grant.
 * `MODERATOR` (the role that actually holds `listing.moderate`) simply
 * never sees this panel, exactly matching its current, unchanged
 * authorization — nothing here alters who can do what. `GET
 * /admin/audit-logs` requires `audit.view` unconditionally server-side
 * (`module.routes.js`), so a Moderator-visible history view is a real
 * backend permission gap, not something a frontend gate alone can fix —
 * flagged as follow-up, not silently expanded here (Step M3 brief §27).
 */

import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Badge, Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Skeleton, EmptyState } from '@desavii/ui/components/feedback-overlays';
import { useAdminAuditLogsQuery } from '../../queries/useAdminAuditLogsQuery.js';

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

export default function ModerationHistoryPanel({ listingId }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminAuditLogsQuery({
      targetType: 'listing',
      targetId: listingId,
    });

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
};
