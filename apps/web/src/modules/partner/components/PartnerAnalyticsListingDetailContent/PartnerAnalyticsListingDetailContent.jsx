/**
 * PartnerAnalyticsListingDetailContent —
 * `/:locale/partner/analytics/listings/:listingId` (Step A6). Route-based
 * detail page, matching this codebase's established convention (item
 * detail is a route, not a modal/drawer — `PartnerBookingDetailContent`'s
 * own precedent). `getListingForAnalytics`'s ownership check (A5) means a
 * wrong-partner/soft-deleted listingId 404s server-side — masked here as
 * the same `ErrorState` any other failure shows, never a distinct
 * "doesn't belong to you" message (brief §5's anti-enumeration rule
 * applies here too).
 *
 * No contact-click metric — A5's `toPartnerListingDetailResponse` never
 * includes one (brief §28).
 */

import { useMemo, useState } from 'react';
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
  usePartnerAnalyticsListingDetailQuery,
  useAnalyticsRangeParam,
  ALLOWED_RANGE_DAYS,
  formatCount,
  formatPercent,
  formatDay,
} from '../../../partnerAnalytics/index.js';

const CHART_METRICS = [
  'views',
  'impressions',
  'daily_unique_visitors',
  'booking_requests',
];
const DEFAULT_CHART_METRIC = 'views';

export default function PartnerAnalyticsListingDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, listingId } = useParams();
  const { activePartnerId } = usePartnerContext();
  const [range, setRange] = useAnalyticsRangeParam();
  const [chartMetric, setChartMetric] = useState(DEFAULT_CHART_METRIC);

  const detailQuery = usePartnerAnalyticsListingDetailQuery({
    partnerId: activePartnerId,
    listingId: Number(listingId),
    rangeDays: range,
  });

  const detail = detailQuery.data;
  const chartData = useMemo(
    () =>
      (detail?.daily ?? []).map((point) => ({
        day: formatDay(point.day, i18n.language),
        value: point[chartMetric],
      })),
    [detail, chartMetric, i18n.language],
  );

  const breadcrumbs = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
    {
      label: t('partner.analytics.heading'),
      href: `/${locale}/partner/analytics`,
    },
    {
      label: detail?.title ?? t('partner.analytics.listingDetail.heading'),
      href: `/${locale}/partner/analytics/listings/${listingId}`,
    },
  ];

  if (detailQuery.isError) {
    return (
      <Section spacing="default">
        <PageHeader
          title={t('partner.analytics.listingDetail.heading')}
          breadcrumbs={breadcrumbs}
        />
        <ErrorState
          title={t('partner.analytics.listingDetail.errorTitle')}
          retryLabel={t('partner.analytics.error.retry')}
          onRetry={detailQuery.refetch}
        />
      </Section>
    );
  }

  const isLoading = detailQuery.isPending;
  const chartOptions = CHART_METRICS.map((metric) => ({
    value: metric,
    label: t(`partner.analytics.chart.series.${metric}`),
  }));

  return (
    <Section spacing="default">
      <PageHeader
        title={detail?.title ?? t('partner.analytics.listingDetail.heading')}
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
        <Grid columns={4} gap="4">
          <StatCard
            label={t('partner.analytics.kpi.views')}
            value={
              isLoading ? undefined : formatCount(detail.views, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.uniqueVisitors')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.exact_unique_visitors, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.impressions')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.impressions, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.currentSaves')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.net_saves, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.bookingStarts')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.booking_starts, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.bookingRequests')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.booking_requests, i18n.language)
            }
            variant="info"
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.confirmedBookings')}
            value={
              isLoading
                ? undefined
                : formatCount(detail.confirmed_bookings, i18n.language)
            }
            variant="success"
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.viewToRequestConversion')}
            value={
              isLoading
                ? undefined
                : formatPercent(
                    detail.view_to_request_conversion,
                    i18n.language,
                  )
            }
            isLoading={isLoading}
          />
        </Grid>
        {!isLoading && <p>{t('partner.analytics.currentSavesNote')}</p>}

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
              ariaLabel={t(`partner.analytics.chart.series.${chartMetric}`)}
              yAxisLabel={t(`partner.analytics.chart.series.${chartMetric}`)}
            />
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('partner.analytics.searchAndPromotion.heading')}</h2>
            {isLoading ? null : (
              <Stack gap="2">
                <Inline justify="space-between">
                  <span>
                    {t('partner.analytics.searchAndPromotion.searchCtr')}
                  </span>
                  <strong>
                    {formatPercent(detail.search_ctr, i18n.language)}
                  </strong>
                </Inline>
                <Inline justify="space-between">
                  <span>
                    {t('partner.analytics.searchAndPromotion.promotionCtr')}
                  </span>
                  <strong>
                    {formatPercent(detail.promotion_ctr, i18n.language)}
                  </strong>
                </Inline>
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}
