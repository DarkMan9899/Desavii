/**
 * ManagerListingsPageContent — `/:locale/manager/listings` (Manager
 * Workspace: Listings Management). Mirrors `PartnerListingsPageContent`
 * closely — same filter/query shape, same `PartnerListingsList`
 * presentational component reused directly (`basePath="manager"`,
 * `canDelete={false}` — a Manager may create/edit/publish a company's
 * listings but never hard-delete one, spec §14: destructive stays owner/
 * admin-only) — scoped to `useManagerContext().activeCompanyId` instead
 * of `usePartnerContext().activePartnerId`. A company switcher is shown
 * only when the Manager has more than one assigned company.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Search } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useManagerContext } from '../../../../contexts/ManagerContext.jsx';
import {
  useMyListingsQuery,
  LISTING_STATUS_KEYS,
} from '../../../listings/index.js';
import {
  SORT_KEYS,
  SORT_OPTION_META,
  DEFAULT_SORT_KEY,
} from '../../../../constants/sortOptions.js';
import PartnerListingsList from '../../../partner/components/PartnerListingsList/PartnerListingsList.jsx';
import ManagerCompanySwitcher from '../ManagerCompanySwitcher/ManagerCompanySwitcher.jsx';

const KEYWORD_DEBOUNCE_MS = 400;

export default function ManagerListingsPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { activeCompanyId } = useManagerContext();

  const [keywordText, setKeywordText] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT_KEY);

  useEffect(() => {
    const timeout = setTimeout(
      () => setKeyword(keywordText),
      KEYWORD_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [keywordText]);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMyListingsQuery({ partnerId: activeCompanyId, status, keyword, sort });

  const listings = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const statusOptions = [
    { value: '', label: t('partner.listings.filters.statusAll') },
    ...LISTING_STATUS_KEYS.map((code) => ({
      value: code,
      label: t(`listings.status.${code}`),
    })),
  ];

  const sortOptions = SORT_KEYS.filter(
    (key) => !SORT_OPTION_META[key].requiresKeyword || keyword,
  ).map((key) => ({ value: key, label: t(`search.filters.sort.${key}`) }));

  return (
    <Section spacing="default">
      <PageHeader
        title={t('manager.listings.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('manager.nav.dashboard'), href: `/${locale}/manager` },
          {
            label: t('manager.listings.heading'),
            href: `/${locale}/manager/listings`,
          },
        ]}
        actions={
          <Button
            variant="primary"
            disabled={!activeCompanyId}
            onClick={() => navigate(`/${locale}/manager/listings/new`)}
          >
            {t('partner.listings.create')}
          </Button>
        }
      />

      <Stack gap="4">
        <ManagerCompanySwitcher />

        <Inline gap="3" wrap>
          <Input
            aria-label={t('partner.listings.filters.keywordLabel')}
            placeholder={t('partner.listings.filters.keywordPlaceholder')}
            value={keywordText}
            onChange={(event) => setKeywordText(event.target.value)}
            iconLeft={<Search size={18} aria-hidden="true" />}
          />
          <Select
            ariaLabel={t('partner.listings.filters.statusLabel')}
            options={statusOptions}
            value={status}
            onChange={(value) => setStatus(value)}
          />
          <Select
            ariaLabel={t('partner.listings.filters.sortLabel')}
            options={sortOptions}
            value={sort}
            onChange={(value) => setSort(value)}
          />
        </Inline>

        <PartnerListingsList
          listings={listings}
          isPending={isPending}
          isError={isError}
          onRetry={refetch}
          hasNextPage={Boolean(hasNextPage)}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          basePath="manager"
          canDelete={false}
        />
      </Stack>
    </Section>
  );
}
