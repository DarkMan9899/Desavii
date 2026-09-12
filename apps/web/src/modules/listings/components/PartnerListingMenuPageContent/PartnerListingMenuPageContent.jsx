/**
 * PartnerListingMenuPageContent (Pass 6) — `/:locale/partner/listings/:id/menu`.
 * Thin page shell mirroring `PartnerListingRoomsPageContent.jsx` exactly:
 * loads the listing, then delegates everything to `PartnerMenuManager`.
 *
 * `PartnerMenuManager` is `lazy()`-loaded for the exact reason
 * `LocationStep.jsx` already lazy-loads `LocationPicker`: this file is
 * re-exported through `modules/listings/index.js`, the SAME barrel
 * `PartnerListingRowActions.jsx` (eagerly bundled in the main Partner
 * dashboard chunk) already imports from for unrelated exports — a static
 * import here measurably grew the production `index-*.js` chunk (verified
 * via a real build: 880.07 kB vs. the established 857.05 kB baseline)
 * purely from this page's own CRUD authoring code, even though this page
 * itself is only ever reached via a lazy route.
 */

import { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section } from '@desavii/ui/components/layout';
import {
  Spinner,
  ErrorState,
  Skeleton,
} from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useListingQuery } from '../../queries/useListingQuery.js';
import getLocalizedTranslation from '../../utils/getLocalizedTranslation.js';

const PartnerMenuManager = lazy(
  () => import('../PartnerMenuManager/PartnerMenuManager.jsx'),
);

export default function PartnerListingMenuPageContent({ listingId }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const listingQuery = useListingQuery(listingId);

  if (listingQuery.isPending) {
    return <Spinner label={t('partner.listingMenu.loading')} />;
  }
  if (listingQuery.isError) {
    return (
      <ErrorState
        title={t('partner.listingMenu.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={listingQuery.refetch}
      />
    );
  }

  const listing = listingQuery.data;
  const listingTitle = getLocalizedTranslation(
    listing.translations,
    locale,
  )?.title;

  return (
    <Section>
      <PageHeader
        title={t('partner.listingMenu.heading', { title: listingTitle })}
        breadcrumbs={[
          { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
          {
            label: t('partner.listings.heading'),
            href: `/${locale}/partner/listings`,
          },
          {
            label: listingTitle,
            href: `/${locale}/partner/listings/${listingId}/menu`,
          },
        ]}
      />
      <Suspense fallback={<Skeleton variant="rect" height={400} />}>
        <PartnerMenuManager listingId={listingId} defaultLocale={locale} />
      </Suspense>
    </Section>
  );
}

PartnerListingMenuPageContent.propTypes = {
  listingId: PropTypes.number.isRequired,
};
