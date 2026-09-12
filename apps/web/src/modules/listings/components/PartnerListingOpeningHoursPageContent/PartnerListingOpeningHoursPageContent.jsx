/**
 * PartnerListingOpeningHoursPageContent (Pass 6) —
 * `/:locale/partner/listings/:id/opening-hours`. Thin page shell
 * mirroring `PartnerListingRoomsPageContent.jsx` exactly.
 *
 * `PartnerOpeningHoursEditor` is `lazy()`-loaded for the same barrel-chunk
 * reason `PartnerListingMenuPageContent.jsx` lazy-loads `PartnerMenuManager`
 * — see that file's own header for the measured build-size evidence.
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

const PartnerOpeningHoursEditor = lazy(
  () => import('../PartnerOpeningHoursEditor/PartnerOpeningHoursEditor.jsx'),
);

export default function PartnerListingOpeningHoursPageContent({ listingId }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const listingQuery = useListingQuery(listingId);

  if (listingQuery.isPending) {
    return <Spinner label={t('partner.listingOpeningHours.loading')} />;
  }
  if (listingQuery.isError) {
    return (
      <ErrorState
        title={t('partner.listingOpeningHours.errorTitle')}
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
        title={t('partner.listingOpeningHours.heading', {
          title: listingTitle,
        })}
        breadcrumbs={[
          { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
          {
            label: t('partner.listings.heading'),
            href: `/${locale}/partner/listings`,
          },
          {
            label: listingTitle,
            href: `/${locale}/partner/listings/${listingId}/opening-hours`,
          },
        ]}
      />
      <Suspense fallback={<Skeleton variant="rect" height={400} />}>
        <PartnerOpeningHoursEditor listingId={listingId} />
      </Suspense>
    </Section>
  );
}

PartnerListingOpeningHoursPageContent.propTypes = {
  listingId: PropTypes.number.isRequired,
};
