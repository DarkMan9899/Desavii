/**
 * PartnerAnalyticsPageContent — `/:locale/partner/analytics` (Step A6,
 * on top of Step A5's read-only API). Orchestrator: owns the range
 * (URL-synced, brief §10), the listings sort/chart-metric selection
 * (component-local — resets naturally on partner switch since the whole
 * tree remounts under a new `activePartnerId`), and the three A5 queries
 * this page needs (overview, listings, — listing/promotion DETAIL live
 * in their own route/component, brief §28/§33).
 *
 * Capability-gated the same way `PartnerConnectionsPageContent` gates
 * its write actions (`usePartnerCapability`), except here the WHOLE page
 * is gated — a role without `VIEW_ANALYTICS` never fires a single query
 * (brief §5: server is still the real authority; this only avoids
 * inviting a 403 the UI already knows is coming).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Button, Card } from '@desavii/ui/components/primitives';
import { Select } from '@desavii/ui/components/form-controls';
import { StatCard, Chart } from '@desavii/ui/components/dashboard';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import {
  usePartnerCapability,
  PARTNER_CAPABILITIES,
} from '../../../availability/index.js';
import {
  usePartnerAnalyticsOverviewQuery,
  usePartnerAnalyticsListingsQuery,
  useAnalyticsRangeParam,
  ALLOWED_RANGE_DAYS,
  DEFAULT_LISTINGS_SORT,
  parseListingsSort,
  formatCount,
  formatPercent,
  formatDay,
} from '../../../partnerAnalytics/index.js';
import PartnerAnalyticsListingsTable from '../PartnerAnalyticsListingsTable/PartnerAnalyticsListingsTable.jsx';

const CHART_METRICS = [
  'views',
  'impressions',
  'daily_unique_visitors',
  'booking_requests',
];
const DEFAULT_CHART_METRIC = 'views';

export default function PartnerAnalyticsPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { activePartnerId } = usePartnerContext();
  const canView = usePartnerCapability(PARTNER_CAPABILITIES.VIEW_ANALYTICS);

  const [range, setRange] = useAnalyticsRangeParam();
  const [sort, setSort] = useState(DEFAULT_LISTINGS_SORT);
  const [chartMetric, setChartMetric] = useState(DEFAULT_CHART_METRIC);

  const overviewQuery = usePartnerAnalyticsOverviewQuery({
    partnerId: canView ? activePartnerId : null,
    rangeDays: range,
  });
  const listingsQuery = usePartnerAnalyticsListingsQuery({
    partnerId: canView ? activePartnerId : null,
    rangeDays: range,
    sort,
  });

  const listingRows = useMemo(
    () => listingsQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [listingsQuery.data],
  );

  const overview = overviewQuery.data;
  const chartData = useMemo(
    () =>
      (overview?.daily ?? []).map((point) => ({
        day: formatDay(point.day, i18n.language),
        value: point[chartMetric],
      })),
    [overview, chartMetric, i18n.language],
  );

  const breadcrumbs = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
    {
      label: t('partner.analytics.heading'),
      href: `/${locale}/partner/analytics`,
    },
  ];

  if (!canView) {
    return (
      <Section spacing="default">
        <PageHeader
          title={t('partner.analytics.heading')}
          breadcrumbs={breadcrumbs}
        />
        <ErrorState
          title={t('partner.analytics.restricted.title')}
          description={t('partner.analytics.restricted.description')}
        />
      </Section>
    );
  }

  if (overviewQuery.isError) {
    return (
      <Section spacing="default">
        <PageHeader
          title={t('partner.analytics.heading')}
          breadcrumbs={breadcrumbs}
        />
        <ErrorState
          title={t('partner.analytics.error.title')}
          retryLabel={t('partner.analytics.error.retry')}
          onRetry={overviewQuery.refetch}
        />
      </Section>
    );
  }

  const isLoading = overviewQuery.isPending;
  const rangeLabel =
    overview &&
    t('partner.analytics.rangeLabel', {
      from: formatDay(overview.from_day, i18n.language, {
        year: 'numeric',
      }),
      to: formatDay(overview.to_day, i18n.language, { year: 'numeric' }),
    });

  const chartOptions = CHART_METRICS.map((metric) => ({
    value: metric,
    label: t(`partner.analytics.chart.series.${metric}`),
  }));

  return (
    <Section spacing="default">
      <PageHeader
        title={t('partner.analytics.heading')}
        description={rangeLabel ?? t('partner.analytics.description')}
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
              isLoading
                ? undefined
                : formatCount(overview.listing_views, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.uniqueVisitors')}
            value={
              isLoading
                ? undefined
                : formatCount(overview.exact_unique_visitors, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.impressions')}
            value={
              isLoading
                ? undefined
                : formatCount(overview.listing_impressions, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.bookingRequests')}
            value={
              isLoading
                ? undefined
                : formatCount(overview.booking_requests, i18n.language)
            }
            variant="info"
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.confirmedBookings')}
            value={
              isLoading
                ? undefined
                : formatCount(overview.confirmed_bookings, i18n.language)
            }
            variant="success"
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.contactClicks')}
            value={
              isLoading
                ? undefined
                : formatCount(overview.contact_clicks, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.currentSaves')}
            value={
              isLoading
                ? undefined
                : formatCount(overview.net_saves, i18n.language)
            }
            isLoading={isLoading}
          />
          <StatCard
            label={t('partner.analytics.kpi.viewToRequestConversion')}
            value={
              isLoading
                ? undefined
                : formatPercent(
                    overview.view_to_request_conversion,
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

        <Grid columns={2} gap="4">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('partner.analytics.searchAndPromotion.heading')}</h2>
              {isLoading ? (
                <Skeleton variant="text" width="80%" />
              ) : (
                <Stack gap="2">
                  <Inline justify="space-between">
                    <span>
                      {t('partner.analytics.searchAndPromotion.searchCtr')}
                    </span>
                    <strong>
                      {formatPercent(overview.search_ctr, i18n.language)}
                    </strong>
                  </Inline>
                  <Inline justify="space-between">
                    <span>
                      {t('partner.analytics.searchAndPromotion.promotionCtr')}
                    </span>
                    <strong>
                      {formatPercent(overview.promotion_ctr, i18n.language)}
                    </strong>
                  </Inline>
                  <Inline justify="space-between">
                    <span>
                      {t(
                        'partner.analytics.searchAndPromotion.promotionImpressions',
                      )}
                    </span>
                    <strong>
                      {formatCount(
                        overview.promotion_impressions,
                        i18n.language,
                      )}
                    </strong>
                  </Inline>
                  <Inline justify="space-between">
                    <span>
                      {t(
                        'partner.analytics.searchAndPromotion.promotionClicks',
                      )}
                    </span>
                    <strong>
                      {formatCount(overview.promotion_clicks, i18n.language)}
                    </strong>
                  </Inline>
                </Stack>
              )}
            </Stack>
          </Card>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('partner.analytics.company.heading')}</h2>
              <p>{t('partner.analytics.company.note')}</p>
              {isLoading ? (
                <Skeleton variant="text" width="80%" />
              ) : (
                <Stack gap="2">
                  <Inline justify="space-between">
                    <span>{t('partner.analytics.company.profileViews')}</span>
                    <strong>
                      {formatCount(
                        overview.company_profile_views,
                        i18n.language,
                      )}
                    </strong>
                  </Inline>
                  <Inline justify="space-between">
                    <span>{t('partner.analytics.company.listingClicks')}</span>
                    <strong>
                      {formatCount(
                        overview.company_listing_clicks,
                        i18n.language,
                      )}
                    </strong>
                  </Inline>
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>

        <Card as="div" padding="lg">
          <Stack gap="4">
            <h2>{t('partner.analytics.listings.heading')}</h2>
            {listingsQuery.isError ? (
              <ErrorState
                title={t('partner.analytics.listings.errorTitle')}
                retryLabel={t('partner.analytics.error.retry')}
                onRetry={listingsQuery.refetch}
              />
            ) : (
              <PartnerAnalyticsListingsTable
                rows={listingRows}
                isPending={listingsQuery.isPending}
                sort={parseListingsSort(sort)}
                onSortChange={setSort}
                hasNextPage={Boolean(listingsQuery.hasNextPage)}
                isFetchingNextPage={listingsQuery.isFetchingNextPage}
                onLoadMore={listingsQuery.fetchNextPage}
              />
            )}
          </Stack>
        </Card>

        {!isLoading &&
          overview.listing_views === 0 &&
          overview.listing_impressions === 0 &&
          listingRows.length === 0 && (
            <EmptyState
              title={t('partner.analytics.noDataYet.title')}
              description={t('partner.analytics.noDataYet.description')}
            />
          )}
      </Stack>
    </Section>
  );
}
