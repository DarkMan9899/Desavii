/**
 * PartnerAnalyticsPromotionDetailContent —
 * `/:locale/partner/analytics/promotions/:promotionId` (Step A6.1).
 * Uses the A5 `usePartnerAnalyticsPromotionDetailQuery` hook (built in
 * Step A6 but unreachable until this route existed — see that hook's own
 * doc comment). Ownership masking (wrong-partner/nonexistent promotion)
 * 404s server-side — rendered as the same `ErrorState` any other failure
 * shows, never a distinct "doesn't belong to you" message.
 *
 * No private advertisement fields — A5's `toPartnerPromotionDetailResponse`
 * never includes any (brief §14: "No private ad fields").
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Card, Button } from '@desavii/ui/components/primitives';
import { Select } from '@desavii/ui/components/form-controls';
import { StatCard, Chart } from '@desavii/ui/components/dashboard';
import { ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import {
  usePartnerAnalyticsPromotionDetailQuery,
  useAnalyticsRangeParam,
  ALLOWED_RANGE_DAYS,
  formatCount,
  formatPercent,
  formatDay,
} from '../../../partnerAnalytics/index.js';

const CHART_METRICS = ['impressions', 'clicks'];
const DEFAULT_CHART_METRIC = 'impressions';

export default function PartnerAnalyticsPromotionDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, promotionId } = useParams();
  const { activePartnerId } = usePartnerContext();
  const [range, setRange] = useAnalyticsRangeParam();
  const [chartMetric, setChartMetric] = useState(DEFAULT_CHART_METRIC);

  const detailQuery = usePartnerAnalyticsPromotionDetailQuery({
    partnerId: activePartnerId,
    promotionId: Number(promotionId),
    rangeDays: range,
  });

  const detail = detailQuery.data;
  const chartData = (detail?.daily ?? []).map((point) => ({
    day: formatDay(point.day, i18n.language),
    value: point[chartMetric],
  }));

  const breadcrumbs = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
    {
      label: t('partner.analytics.heading'),
      href: `/${locale}/partner/analytics`,
    },
    {
      label: t('partner.analytics.promotionDetail.heading'),
      href: `/${locale}/partner/analytics/promotions/${promotionId}`,
    },
  ];

  if (detailQuery.isError) {
    return (
      <Section spacing="default">
        <PageHeader
          title={t('partner.analytics.promotionDetail.heading')}
          breadcrumbs={breadcrumbs}
        />
        <ErrorState
          title={t('partner.analytics.promotionDetail.errorTitle')}
          retryLabel={t('partner.analytics.error.retry')}
          onRetry={detailQuery.refetch}
        />
      </Section>
    );
  }

  const isLoading = detailQuery.isPending;
  const chartOptions = CHART_METRICS.map((metric) => ({
    value: metric,
    label: t(`partner.analytics.promotionDetail.chartSeries.${metric}`),
  }));

  return (
    <Section spacing="default">
      <PageHeader
        title={t('partner.analytics.promotionDetail.heading')}
        breadcrumbs={breadcrumbs}
        actions={
          <Inline
            gap="2"
            role="group"
            aria-label={t('partner.analytics.rangeSelectorLabel')}
          >
            {ALLOWED_RANGE_DAYS.map((value) => (
              <Button
                key={value}
                variant={value === range ? 'primary' : 'secondary'}
                aria-pressed={value === range}
                onClick={() => setRange(value)}
              >
                {t('partner.analytics.rangeOption', { count: value })}
              </Button>
            ))}
          </Inline>
        }
      />

      <Stack gap="8">
        <Grid columns={3} gap="4">
          <StatCard
            label={t('partner.analytics.promotionDetail.impressions')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.impressions, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.promotionDetail.clicks')}
            value={
              isLoading ? undefined : formatCount(detail.clicks, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.promotionDetail.ctr')}
            value={
              isLoading ? undefined : formatPercent(detail.ctr, i18n.language)
            }
            isLoading={isLoading}
          />
        </Grid>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <Inline justify="space-between" align="center" wrap gap="3">
              <h2>{t('partner.analytics.chart.heading')}</h2>
              <Select
                ariaLabel={t('partner.analytics.chart.metricLabel')}
                options={chartOptions}
                value={chartMetric}
                onChange={setChartMetric}
              />
            </Inline>
            <Chart
              type="line"
              data={chartData}
              xKey="day"
              yKey="value"
              loading={isLoading}
              emptyMessage={t('partner.analytics.chart.empty')}
              ariaLabel={t(
                `partner.analytics.promotionDetail.chartSeries.${chartMetric}`,
              )}
              yAxisLabel={t(
                `partner.analytics.promotionDetail.chartSeries.${chartMetric}`,
              )}
            />
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}
