/**
 * AiUsageDashboardContent (Phase 15 "AI Polish" sprint) — the shared
 * "requests / tokens / cache hits / failures" usage dashboard (StatCards +
 * two DataTables), reused by both the Admin AI Usage page (Stage 15.6,
 * `GET /ai/admin/usage`) and the Partner AI Usage page (`GET
 * /ai/partner/usage`). Both endpoints share the exact same
 * `toUsageDashboardResponse` DTO shape server-side (`ai_usage_logs`,
 * scoped differently per role) — this component is the one place that
 * renders it, so the two pages never duplicate the table/stat-tile wiring.
 * The page-level identity (heading, breadcrumbs, data source) is supplied
 * by each caller.
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section, Stack, Grid } from '@desavii/ui/components/layout';
import { StatCard, DataTable } from '@desavii/ui/components/dashboard';
import { Card } from '@desavii/ui/components/primitives';
import { ErrorState } from '@desavii/ui/components/feedback-overlays';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import { createNumberFormatter } from '@desavii/ui/utils/numberFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';

export default function AiUsageDashboardContent({
  heading,
  breadcrumbs = [],
  data = undefined,
  isPending = false,
  isError = false,
  onRetry = undefined,
}) {
  const { t, i18n } = useTranslation();

  const totals = useMemo(() => {
    const stats = data?.stats ?? [];
    return stats.reduce(
      (acc, row) => ({
        callCount: acc.callCount + row.call_count,
        totalTokens: acc.totalTokens + row.total_tokens,
        failureCount: acc.failureCount + row.failure_count,
      }),
      { callCount: 0, totalTokens: 0, failureCount: 0 },
    );
  }, [data]);

  const numberFormatter = useMemo(
    () => createNumberFormatter(i18n.language),
    [i18n.language],
  );
  const dateFormatter = useMemo(
    () =>
      createDateFormatter(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language],
  );

  const featureLabel = (code) =>
    t(`ai.usageDashboard.feature.${code}`, { defaultValue: code });
  const providerLabel = (code) =>
    t(`ai.usageDashboard.provider.${code}`, { defaultValue: code });

  const statsColumns = [
    {
      key: 'feature_code',
      header: t('ai.usageDashboard.statsTable.feature'),
      render: (row) => featureLabel(row.feature_code),
    },
    {
      key: 'provider_code',
      header: t('ai.usageDashboard.statsTable.provider'),
      render: (row) => providerLabel(row.provider_code),
    },
    {
      key: 'call_count',
      header: t('ai.usageDashboard.statsTable.callCount'),
      render: (row) => numberFormatter.format(row.call_count),
    },
    {
      key: 'total_tokens',
      header: t('ai.usageDashboard.statsTable.totalTokens'),
      render: (row) => numberFormatter.format(row.total_tokens),
    },
    {
      key: 'cache_hits',
      header: t('ai.usageDashboard.statsTable.cacheHits'),
      render: (row) => numberFormatter.format(row.cache_hits),
    },
    {
      key: 'failure_count',
      header: t('ai.usageDashboard.statsTable.failureCount'),
      render: (row) => numberFormatter.format(row.failure_count),
    },
    {
      key: 'avg_latency_ms',
      header: t('ai.usageDashboard.statsTable.avgLatencyMs'),
      render: (row) => numberFormatter.format(row.avg_latency_ms),
    },
  ];

  const recentColumns = [
    {
      key: 'created_at',
      header: t('ai.usageDashboard.recentTable.timestamp'),
      render: (row) => dateFormatter.format(new Date(row.created_at)),
    },
    {
      key: 'feature_code',
      header: t('ai.usageDashboard.recentTable.feature'),
      render: (row) => featureLabel(row.feature_code),
    },
    {
      key: 'provider_code',
      header: t('ai.usageDashboard.recentTable.provider'),
      render: (row) => providerLabel(row.provider_code),
    },
    {
      key: 'total_tokens',
      header: t('ai.usageDashboard.recentTable.totalTokens'),
      render: (row) => numberFormatter.format(row.total_tokens),
    },
    {
      key: 'latency_ms',
      header: t('ai.usageDashboard.recentTable.latencyMs'),
      render: (row) => numberFormatter.format(row.latency_ms),
    },
    {
      key: 'succeeded',
      header: t('ai.usageDashboard.recentTable.succeeded'),
      render: (row) =>
        t(
          row.succeeded
            ? 'ai.usageDashboard.recentTable.succeededYes'
            : 'ai.usageDashboard.recentTable.succeededNo',
        ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader title={heading} breadcrumbs={breadcrumbs} />

      {isError ? (
        <ErrorState
          title={t('ai.usageDashboard.error.title')}
          retryLabel={t('ai.usageDashboard.error.retry')}
          onRetry={onRetry}
        />
      ) : (
        <Stack gap="8">
          <Grid columns={3} gap="4">
            <StatCard
              label={t('ai.usageDashboard.tiles.callCount')}
              value={numberFormatter.format(totals.callCount)}
              variant="neutral"
              isLoading={isPending}
            />
            <StatCard
              label={t('ai.usageDashboard.tiles.totalTokens')}
              value={numberFormatter.format(totals.totalTokens)}
              variant="neutral"
              isLoading={isPending}
            />
            <StatCard
              label={t('ai.usageDashboard.tiles.failureCount')}
              value={numberFormatter.format(totals.failureCount)}
              variant={totals.failureCount > 0 ? 'danger' : 'success'}
              isLoading={isPending}
            />
          </Grid>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('ai.usageDashboard.statsTable.heading')}</h2>
              <DataTable
                columns={statsColumns}
                rows={data?.stats ?? []}
                rowKey={(row) => `${row.feature_code}:${row.provider_code}`}
                isLoading={isPending}
                emptyTitle={t('ai.usageDashboard.statsTable.empty')}
              />
            </Stack>
          </Card>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('ai.usageDashboard.recentTable.heading')}</h2>
              <DataTable
                columns={recentColumns}
                rows={data?.recent ?? []}
                rowKey={(row) => row.id}
                isLoading={isPending}
                emptyTitle={t('ai.usageDashboard.recentTable.empty')}
              />
            </Stack>
          </Card>
        </Stack>
      )}
    </Section>
  );
}

AiUsageDashboardContent.propTypes = {
  heading: PropTypes.string.isRequired,
  breadcrumbs: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      href: PropTypes.string.isRequired,
    }),
  ),
  data: PropTypes.shape({
    stats: PropTypes.arrayOf(
      PropTypes.shape({
        feature_code: PropTypes.string,
        provider_code: PropTypes.string,
        call_count: PropTypes.number,
        total_tokens: PropTypes.number,
        cache_hits: PropTypes.number,
        failure_count: PropTypes.number,
        avg_latency_ms: PropTypes.number,
      }),
    ),
    recent: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.number,
        feature_code: PropTypes.string,
        provider_code: PropTypes.string,
        total_tokens: PropTypes.number,
        latency_ms: PropTypes.number,
        succeeded: PropTypes.bool,
        created_at: PropTypes.string,
      }),
    ),
  }),
  isPending: PropTypes.bool,
  isError: PropTypes.bool,
  onRetry: PropTypes.func,
};
