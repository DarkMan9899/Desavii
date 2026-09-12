/**
 * PartnerListingsList — loading/empty/error/pagination states plus
 * per-row lifecycle actions for the Listings Management table, mirroring
 * `bookings`'s `BookingsList.jsx` shape (prop-driven, unaware of React
 * Query) with one addition: this list also OWNS the publish/unpublish/
 * archive/delete mutations, since each row's legal action set depends on
 * that row's own status (`listingStatusTransitions.js`) and needs its
 * own confirm/toast wiring — the same inline pattern
 * `BookingDetailPageContent.jsx` already uses for its single Cancel
 * action, just applied per-row here.
 *
 * None of the four mutations are id-bound at the hook level (each takes
 * `id` as its `mutate()` argument, unlike the booking module's
 * `useConfirmBookingMutation(id)`), so they're called once here rather
 * than once per row — no Rules-of-Hooks conflict with the `.map()` below.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { Stack } from '@desavii/ui/components/layout';
import { ListingTableRow } from '@desavii/ui/components/dashboard';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import {
  ListingStatusBadge,
  usePublishListingMutation,
  useUnpublishListingMutation,
  useArchiveListingMutation,
  useDeleteListingMutation,
} from '../../../listings/index.js';
import PartnerListingRowActions from '../PartnerListingRowActions/PartnerListingRowActions.jsx';
import styles from './PartnerListingsList.module.scss';

const SKELETON_COUNT = 4;

export default function PartnerListingsList({
  listings,
  isPending,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  // Sprint F (Manager Workspace): this list is reused unmodified by
  // `ManagerListingsPageContent` — only the Edit/Manage-rooms navigation
  // targets differ (`/manager/...` vs `/partner/...`), and whether the
  // destructive Delete action is offered at all (Manager never gets it,
  // see `PartnerListingRowActions`'s own `canDelete` doc comment).
  // Defaults preserve every existing Partner caller's behavior exactly.
  basePath = 'partner',
  canDelete = true,
}) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const publishMutation = usePublishListingMutation();
  const unpublishMutation = useUnpublishListingMutation();
  const archiveMutation = useArchiveListingMutation();
  const deleteMutation = useDeleteListingMutation();

  async function handlePublish(listing) {
    try {
      await publishMutation.mutateAsync(listing.id);
      showToast(t('partner.listings.publishSuccess'), { variant: 'success' });
    } catch (error) {
      showToast(error.message || t('partner.listings.publishError'), {
        variant: 'danger',
      });
    }
  }

  async function handleUnpublish(listing) {
    try {
      await unpublishMutation.mutateAsync(listing.id);
      showToast(t('partner.listings.unpublishSuccess'), { variant: 'success' });
    } catch {
      showToast(t('partner.listings.unpublishError'), { variant: 'danger' });
    }
  }

  async function handleArchive(listing) {
    const confirmed = await confirm({
      title: t('partner.listings.archiveConfirmTitle'),
      description: t('partner.listings.archiveConfirmDescription'),
      confirmLabel: t('partner.listings.archiveConfirmAction'),
      cancelLabel: t('partner.listings.archiveConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await archiveMutation.mutateAsync(listing.id);
      showToast(t('partner.listings.archiveSuccess'), { variant: 'success' });
    } catch {
      showToast(t('partner.listings.archiveError'), { variant: 'danger' });
    }
  }

  async function handleDelete(listing) {
    const confirmed = await confirm({
      title: t('partner.listings.deleteConfirmTitle'),
      description: t('partner.listings.deleteConfirmDescription'),
      confirmLabel: t('partner.listings.deleteConfirmAction'),
      cancelLabel: t('partner.listings.deleteConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(listing.id);
      showToast(t('partner.listings.deleteSuccess'), { variant: 'success' });
    } catch {
      showToast(t('partner.listings.deleteError'), { variant: 'danger' });
    }
  }

  if (isPending) {
    return (
      <Stack gap="3">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <ListingTableRow key={index} isLoading title="" />
        ))}
      </Stack>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.listings.error.title')}
        retryLabel={t('partner.listings.error.retry')}
        onRetry={onRetry}
      />
    );
  }

  if (listings.length === 0) {
    // No actionLabel/onAction here — `PartnerListingsPageContent`'s
    // `PageHeader` already renders a persistent "Create listing" button
    // above this list at all times; a second identical button here
    // would just duplicate it.
    return (
      <EmptyState
        title={t('partner.listings.empty.title')}
        description={t('partner.listings.empty.description')}
      />
    );
  }

  return (
    <Stack gap="3">
      {listings.map((listing) => {
        const isMutating =
          (publishMutation.isPending &&
            publishMutation.variables === listing.id) ||
          (unpublishMutation.isPending &&
            unpublishMutation.variables === listing.id) ||
          (archiveMutation.isPending &&
            archiveMutation.variables === listing.id) ||
          (deleteMutation.isPending && deleteMutation.variables === listing.id);

        return (
          <ListingTableRow
            key={listing.id}
            title={listing.title ?? listing.slug}
            thumbnailUrl={listing.cover_image_url}
            typeBadge={
              <Badge
                variant="info"
                size="sm"
                label={t(`listings.type.${listing.listing_type}`, {
                  defaultValue: listing.listing_type,
                })}
              />
            }
            statusBadge={<ListingStatusBadge status={listing.status} />}
            updatedAtLabel={new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'medium',
            }).format(new Date(listing.created_at))}
            actions={
              <PartnerListingRowActions
                listing={listing}
                isMutating={isMutating}
                isPublishing={
                  publishMutation.isPending &&
                  publishMutation.variables === listing.id
                }
                isUnpublishing={
                  unpublishMutation.isPending &&
                  unpublishMutation.variables === listing.id
                }
                isArchiving={
                  archiveMutation.isPending &&
                  archiveMutation.variables === listing.id
                }
                isDeleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables === listing.id
                }
                onView={() =>
                  navigate(`/${locale}/listings/${listing.slug ?? listing.id}`)
                }
                onEdit={() =>
                  navigate(
                    `/${locale}/${basePath}/listings/new?listingId=${listing.id}`,
                  )
                }
                onManageRooms={() =>
                  navigate(
                    `/${locale}/${basePath}/listings/${listing.id}/rooms`,
                  )
                }
                onManageMenu={() =>
                  navigate(`/${locale}/${basePath}/listings/${listing.id}/menu`)
                }
                onManageOpeningHours={() =>
                  navigate(
                    `/${locale}/${basePath}/listings/${listing.id}/opening-hours`,
                  )
                }
                onPublish={(row) => handlePublish(row)}
                onUnpublish={(row) => handleUnpublish(row)}
                onArchive={(row) => handleArchive(row)}
                onDelete={(row) => handleDelete(row)}
                canDelete={canDelete}
              />
            }
          />
        );
      })}
      {hasNextPage && (
        <div className={styles.loadMore}>
          <Button
            variant="secondary"
            onClick={onLoadMore}
            loading={isFetchingNextPage}
          >
            {t('partner.listings.loadMore')}
          </Button>
        </div>
      )}
    </Stack>
  );
}

PartnerListingsList.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  listings: PropTypes.arrayOf(PropTypes.object).isRequired,
  isPending: PropTypes.bool.isRequired,
  isError: PropTypes.bool.isRequired,
  onRetry: PropTypes.func.isRequired,
  hasNextPage: PropTypes.bool.isRequired,
  isFetchingNextPage: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
  basePath: PropTypes.string,
  canDelete: PropTypes.bool,
};
