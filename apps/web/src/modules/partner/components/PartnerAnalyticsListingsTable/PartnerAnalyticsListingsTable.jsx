/**
 * PartnerAnalyticsListingsTable — presentational listing-performance
 * table for `PartnerAnalyticsPageContent`. Mirrors
 * `PartnerConnectionsPageContent`'s `DataTable` usage exactly: server
 * sort + cursor "Load more", never a client-side re-sort/re-page over an
 * unrestricted local array (brief §23/§27).
 *
 * No contact-click column — A5's `toPartnerListingRowResponse` never
 * includes one (contact clicks are company-scoped, brief §28/§34). No
 * status/frozen badge — A5's listing row DTO carries no status field to
 * render one from (brief §29's badge requirement is conditional on the
 * API actually returning status information).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Select } from '@desavii/ui/components/form-controls';
import { Inline } from '@desavii/ui/components/layout';
import {
  LISTINGS_SORT_VALUES,
  formatCount,
  formatPercent,
} from '../../../partnerAnalytics/index.js';

export default function PartnerAnalyticsListingsTable({
  rows,
  isPending,
  sort,
  onSortChange,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();

  const sortOptions = LISTINGS_SORT_VALUES.map((value) => ({
    value,
    label: t(`partner.analytics.listings.sort.${value}`),
  }));

  const columns = [
    {
      key: 'title',
      header: t('partner.analytics.listings.columns.listing'),
      render: (row) => (
        <div>
          <div>{row.title || `#${row.listing_id}`}</div>
          {row.listing_type && (
            <div>
              {t(`listings.type.${row.listing_type}`, {
                defaultValue: row.listing_type,
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'views',
      header: t('partner.analytics.listings.columns.views'),
      align: 'right',
      render: (row) => formatCount(row.views, i18n.language),
    },
    {
      key: 'exact_unique_visitors',
      header: t('partner.analytics.listings.columns.uniqueVisitors'),
      align: 'right',
      render: (row) => formatCount(row.exact_unique_visitors, i18n.language),
    },
    {
      key: 'impressions',
      header: t('partner.analytics.listings.columns.impressions'),
      align: 'right',
      render: (row) => formatCount(row.impressions, i18n.language),
    },
    {
      key: 'booking_requests',
      header: t('partner.analytics.listings.columns.bookingRequests'),
      align: 'right',
      render: (row) => formatCount(row.booking_requests, i18n.language),
    },
    {
      key: 'search_ctr',
      header: t('partner.analytics.listings.columns.searchCtr'),
      align: 'right',
      render: (row) => formatPercent(row.search_ctr, i18n.language),
    },
    {
      key: 'promotion_clicks',
      header: t('partner.analytics.listings.columns.promotionClicks'),
      align: 'right',
      render: (row) => formatCount(row.promotion_clicks, i18n.language),
    },
    {
      key: 'net_saves',
      header: t('partner.analytics.listings.columns.currentSaves'),
      align: 'right',
      render: (row) => formatCount(row.net_saves, i18n.language),
    },
  ];

  return (
    <>
      <Inline gap="3" wrap justify="flex-end">
        <Select
          ariaLabel={t('partner.analytics.listings.sortLabel')}
          options={sortOptions}
          value={sort}
          onChange={onSortChange}
        />
      </Inline>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey="listing_id"
        isLoading={isPending}
        emptyTitle={t('partner.analytics.listings.emptyTitle')}
        emptyDescription={t('partner.analytics.listings.emptyDescription')}
        hasMore={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={onLoadMore}
        loadMoreLabel={t('partner.analytics.listings.loadMore')}
        onRowClick={(row) =>
          navigate(`/${locale}/partner/analytics/listings/${row.listing_id}`)
        }
      />
    </>
  );
}

PartnerAnalyticsListingsTable.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- row shape is the A5 listing-row DTO, keyed only by the columns above
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  isPending: PropTypes.bool.isRequired,
  sort: PropTypes.string.isRequired,
  onSortChange: PropTypes.func.isRequired,
  hasNextPage: PropTypes.bool.isRequired,
  isFetchingNextPage: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
};
