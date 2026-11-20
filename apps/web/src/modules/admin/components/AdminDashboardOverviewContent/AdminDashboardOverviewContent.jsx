/**
 * AdminDashboardOverviewContent — `/:locale/admin` (Admin Platform
 * Dashboard). Reuses `StatCard`/`Card`/`Chart` (`packages/ui`) rather than
 * inventing page-local widgets, same "reuse the shared dashboard
 * primitives" approach `PartnerDashboardOverviewContent` established.
 *
 * "Booking value" (never "Revenue" — see `adminDto.js`'s doc comment for
 * why) is grouped by currency and rendered as a small list rather than a
 * single number, since summing across currencies would be meaningless.
 *
 * 2026 Admin Workspace redesign: the page now opens with "Needs your
 * attention" — the brief's own organizing question for this page — ahead
 * of the raw counts grid, not below it. Each tile is a real link into the
 * already-filtered work queue (Partners' `verificationStatus=PENDING`,
 * Bookings' `status=PENDING_VENDOR`, Listings' own default filter is
 * already PENDING) rather than a static number, so "3 pending partners"
 * is one click from becoming a worked queue, not just a stat to notice
 * and then go hunt for manually.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  CircleCheck,
  UserCheck,
  ListChecks,
  CalendarClock,
} from 'lucide-react';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { StatCard, Chart } from '@desavii/ui/components/dashboard';
import { Card } from '@desavii/ui/components/primitives';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import { createNumberFormatter } from '@desavii/ui/utils/numberFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAdminDashboardQuery } from '../../queries/useAdminDashboardQuery.js';
import styles from './AdminDashboardOverviewContent.module.scss';

function formatAmount(locale, total) {
  return createNumberFormatter(locale).format(total);
}

// Same real 89-action catalog and humanized fallback `AdminAuditLogsPageContent`
// uses — this widget is a miniature audit-log view of the same real
// `audit_logs` rows, not a separate vocabulary, so it must never show the
// raw `action`/`target_type` codes this DTO returns.
function humanizeAction(action) {
  const [scope, ...rest] = action.split('.');
  const verb = rest.join('.').replace(/_/g, ' ');
  return `${scope.replace(/_/g, ' ')}: ${verb}`;
}

function AttentionTile({ href, icon, count = undefined, label, isLoading }) {
  const isZero = !isLoading && (count ?? 0) === 0;
  return (
    <Card
      as={RouterLink}
      href={href}
      padding="md"
      interactive
      className={[styles.attentionTile, isZero && styles['attentionTile--zero']]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.attentionIcon}>{icon}</span>
      <span>
        {isLoading ? (
          <Skeleton variant="text" width="40%" />
        ) : (
          <p className={styles.attentionValue}>{count}</p>
        )}
        <p className={styles.attentionLabel}>{label}</p>
      </span>
    </Card>
  );
}

AttentionTile.propTypes = {
  href: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  count: PropTypes.number,
  label: PropTypes.string.isRequired,
  isLoading: PropTypes.bool.isRequired,
};

export default function AdminDashboardOverviewContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { data, isPending, isError, refetch } = useAdminDashboardQuery();

  if (isError) {
    return (
      <Section spacing="default">
        <PageHeader title={t('admin.dashboard.heading')} />
        <ErrorState
          title={t('admin.dashboard.error.title')}
          retryLabel={t('admin.dashboard.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const counts = data?.counts;
  const pendingActions = data?.pending_actions;
  const bookingValueByCurrency = data?.booking_value_by_currency ?? [];
  const bookingsByDay = data?.bookings_by_day ?? [];
  const recentActivity = data?.recent_activity ?? [];
  const totalPending =
    (pendingActions?.pending_partners ?? 0) +
    (pendingActions?.pending_listings ?? 0) +
    (pendingActions?.pending_bookings ?? 0);

  return (
    <Section spacing="default">
      <PageHeader title={t('admin.dashboard.heading')} />

      <Stack gap="8">
        <Stack gap="3">
          <h2 className={styles.sectionHeading}>
            {t('admin.dashboard.pendingActions.heading')}
          </h2>
          {!isPending && totalPending === 0 ? (
            <p className={styles.allClear}>
              <CircleCheck aria-hidden="true" focusable="false" />
              {t('admin.dashboard.pendingActions.allClear')}
            </p>
          ) : (
            <div className={styles.attentionGrid}>
              <AttentionTile
                href={`/${locale}/admin/partners?verificationStatus=PENDING`}
                icon={<UserCheck aria-hidden="true" focusable="false" />}
                count={pendingActions?.pending_partners}
                label={t('admin.dashboard.pendingActions.partners')}
                isLoading={isPending}
              />
              <AttentionTile
                href={`/${locale}/admin/listings`}
                icon={<ListChecks aria-hidden="true" focusable="false" />}
                count={pendingActions?.pending_listings}
                label={t('admin.dashboard.pendingActions.listings')}
                isLoading={isPending}
              />
              <AttentionTile
                href={`/${locale}/admin/bookings?status=PENDING_VENDOR`}
                icon={<CalendarClock aria-hidden="true" focusable="false" />}
                count={pendingActions?.pending_bookings}
                label={t('admin.dashboard.pendingActions.bookings')}
                isLoading={isPending}
              />
            </div>
          )}
        </Stack>

        <Grid columns={3} gap="4">
          <StatCard
            label={t('admin.dashboard.stats.users')}
            value={counts?.users}
            variant="neutral"
            isLoading={isPending}
          />
          <StatCard
            label={t('admin.dashboard.stats.partners')}
            value={counts?.partners}
            variant="neutral"
            isLoading={isPending}
          />
          <StatCard
            label={t('admin.dashboard.stats.listings')}
            value={counts?.listings}
            variant="neutral"
            isLoading={isPending}
          />
          <StatCard
            label={t('admin.dashboard.stats.publishedListings')}
            value={counts?.published_listings}
            variant="success"
            isLoading={isPending}
          />
          <StatCard
            label={t('admin.dashboard.stats.bookings')}
            value={counts?.bookings}
            variant="info"
            isLoading={isPending}
          />
          <StatCard
            label={t('admin.dashboard.stats.completedBookings')}
            value={counts?.completed_bookings}
            variant="success"
            isLoading={isPending}
          />
        </Grid>

        <Grid columns={2} gap="4">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2 className={styles.sectionHeading}>
                {t('admin.dashboard.chart.heading')}
              </h2>
              {isPending ? (
                <Skeleton variant="rect" height={240} />
              ) : (
                <Chart
                  type="bar"
                  data={bookingsByDay}
                  xKey="day"
                  yKey="total"
                  height={240}
                />
              )}
            </Stack>
          </Card>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2 className={styles.sectionHeading}>
                {t('admin.dashboard.bookingValue.heading')}
              </h2>
              {isPending ? (
                <Skeleton variant="text" width="60%" />
              ) : (
                <Stack gap="2">
                  {bookingValueByCurrency.map((entry) => (
                    <Inline
                      key={entry.currency_code}
                      justify="space-between"
                      align="center"
                    >
                      <span>{entry.currency_code}</span>
                      <strong>
                        {formatAmount(i18n.language, entry.total)}
                      </strong>
                    </Inline>
                  ))}
                  <p>{t('admin.dashboard.bookingValue.note')}</p>
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2 className={styles.sectionHeading}>
              {t('admin.dashboard.recentActivity.heading')}
            </h2>
            {isPending && <Skeleton variant="text" width="80%" />}
            {!isPending && recentActivity.length === 0 && (
              <EmptyState title={t('admin.dashboard.recentActivity.empty')} />
            )}
            {!isPending && recentActivity.length > 0 && (
              <Stack gap="2">
                {recentActivity.map((entry, index) => (
                  <Inline
                    // eslint-disable-next-line react/no-array-index-key -- audit-log entries have no stable client-side id in this DTO
                    key={index}
                    justify="space-between"
                    align="center"
                  >
                    <span>
                      {t('admin.dashboard.recentActivity.entry', {
                        actor:
                          entry.actor_name ??
                          t('admin.dashboard.recentActivity.systemActor'),
                        action: t(`admin.auditLogs.action.${entry.action}`, {
                          defaultValue: humanizeAction(entry.action),
                        }),
                        target: t(
                          `admin.auditLogs.targetType.${entry.target_type}`,
                          { defaultValue: entry.target_type },
                        ),
                        id: entry.target_id,
                      })}
                    </span>
                    <span>
                      {createDateFormatter(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(entry.created_at))}
                    </span>
                  </Inline>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}
