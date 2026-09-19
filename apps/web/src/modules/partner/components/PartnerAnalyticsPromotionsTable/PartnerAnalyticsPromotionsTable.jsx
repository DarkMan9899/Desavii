/**
 * PartnerAnalyticsPromotionsTable — presentational promotion-performance
 * table for `PartnerAnalyticsPageContent` (Step A6.1, brief §13). Mirrors
 * `PartnerAnalyticsListingsTable`'s `DataTable` usage exactly — server
 * cursor pagination, no client sort control (the endpoint's sort is
 * fixed, brief §8).
 *
 * `title` is `null` for a promotion whose listing was soft-deleted
 * (repository-level fallback, brief §11) — rendered as a neutral
 * localized label, never the promotion silently disappearing.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Badge } from '@desavii/ui/components/primitives';
import { formatCount, formatPercent } from '../../../partnerAnalytics/index.js';

export default function PartnerAnalyticsPromotionsTable({
  rows,
  isPending,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();

  const columns = [
    {
      key: 'title',
      header: t('partner.analytics.promotions.columns.promotion'),
      render: (row) =>
        row.title || t('partner.analytics.promotions.unavailableListing'),
    },
    {
      key: 'placement',
      header: t('partner.analytics.promotions.columns.placement'),
      render: (row) =>
        t(`partner.analytics.promotions.placement.${row.placement}`, {
          defaultValue: row.placement,
        }),
    },
    {
      key: 'status',
      header: t('partner.analytics.promotions.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'ACTIVE' ? 'success' : 'neutral'}
          label={t(`partner.analytics.promotions.status.${row.status}`, {
            defaultValue: row.status,
          })}
        />
      ),
    },
    {
      key: 'impressions',
      header: t('partner.analytics.promotions.columns.impressions'),
      align: 'right',
      render: (row) => formatCount(row.impressions, i18n.language),
    },
    {
      key: 'clicks',
      header: t('partner.analytics.promotions.columns.clicks'),
      align: 'right',
      render: (row) => formatCount(row.clicks, i18n.language),
    },
    {
      key: 'ctr',
      header: t('partner.analytics.promotions.columns.ctr'),
      align: 'right',
      render: (row) => formatPercent(row.ctr, i18n.language),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey="promotion_id"
      isLoading={isPending}
      emptyTitle={t('partner.analytics.promotions.emptyTitle')}
      emptyDescription={t('partner.analytics.promotions.emptyDescription')}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={onLoadMore}
      loadMoreLabel={t('partner.analytics.listings.loadMore')}
      onRowClick={(row) =>
        navigate(`/${locale}/partner/analytics/promotions/${row.promotion_id}`)
      }
    />
  );
}

PartnerAnalyticsPromotionsTable.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- row shape is the A5/A6.1 promotion-row DTO, keyed only by the columns above
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  isPending: PropTypes.bool.isRequired,
  hasNextPage: PropTypes.bool.isRequired,
  isFetchingNextPage: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
};
