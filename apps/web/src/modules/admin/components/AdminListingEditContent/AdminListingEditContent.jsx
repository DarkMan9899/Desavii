/**
 * AdminListingEditContent — `/:locale/admin/listings/:id/edit`: an admin
 * corrects a listing's information through the very same Listing Wizard a
 * partner uses (`PartnerListingWizard`), so every field, validation rule
 * and per-language editor is identical and no listing ever needs a
 * database edit (docs/LISTING_DETAIL_FIELD_GAP.md §7).
 *
 * The API decides who may write (`listing.update`) and when (a listing
 * under review or published is locked for everyone); this page only opens
 * the Wizard for a role holding that permission, on an editable listing,
 * and sends anything else back to the admin detail page, which explains
 * the lock. The Wizard keeps its position in the URL (`?listingId=&step=`),
 * so the edit link only needs this route; the listing id is filled in
 * here.
 *
 * Leaving the editor refreshes the admin's own view of the listing (the
 * Wizard's saves refresh the listing itself, not the admin queries).
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Section } from '@desavii/ui/components/layout';
import { ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import PageLoader from '../../../../components/PageLoader/PageLoader.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import {
  PartnerListingWizard,
  getLocalizedTranslation,
  isListingEditable,
} from '../../../listings/index.js';
import { useAdminListingDetailQuery } from '../../queries/useAdminListingDetailQuery.js';

const FIRST_EDIT_STEP_ID = 'basicInfo';

export default function AdminListingEditContent() {
  const { t } = useTranslation();
  const { locale, id } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const listingQuery = useAdminListingDetailQuery(id);
  const listing = listingQuery.data;

  useEffect(
    () => () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'listings'] });
    },
    [queryClient],
  );

  const detailPath = `/${locale}/admin/listings/${id}`;

  // Only a role that may update listings edits them (the API refuses the
  // rest); anyone else in the admin area is sent back to the detail page.
  if (!permissions.includes('listing.update')) {
    return <Navigate replace to={detailPath} />;
  }

  if (searchParams.get('listingId') !== id) {
    return (
      <Navigate
        replace
        to={{ search: `?listingId=${id}&step=${FIRST_EDIT_STEP_ID}` }}
      />
    );
  }

  if (listingQuery.isError) {
    return (
      <Section spacing="default">
        <ErrorState
          title={t('admin.listingModeration.error.title')}
          retryLabel={t('admin.listingModeration.error.retry')}
          onRetry={listingQuery.refetch}
        />
      </Section>
    );
  }

  if (listingQuery.isPending) return <PageLoader />;

  if (!isListingEditable(listing.status)) {
    return <Navigate replace to={detailPath} />;
  }

  const title =
    getLocalizedTranslation(listing.translations, locale)?.title ??
    listing.slug;

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.listingDetail.edit.heading', { title })}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.listingModeration.heading'),
            href: `/${locale}/admin/listings`,
          },
          { label: title, href: detailPath },
        ]}
      />
      {/* The partner choice is only asked when creating a listing; an
          existing listing already belongs to its partner. */}
      <PartnerListingWizard partnerships={[]} exitPath={detailPath} />
    </Section>
  );
}
