/**
 * PartnerListingRowActions — 2026 Partner Workspace redesign. Extracted
 * from `PartnerListingsList.jsx`, which previously rendered up to six
 * `Button`s in a row per listing (View, Edit, Manage rooms, Publish/
 * Unpublish, Archive, Delete) — real, correctly status-gated actions,
 * but a wall of buttons on every single row is exactly the "dashboard
 * clutter" the redesign brief calls out. View and Edit stay one-click
 * (the two actions used on nearly every visit); everything else — all
 * still the exact same mutations/confirm dialogs/toasts, only
 * relocated — moves into a "More" overflow menu built on the shared
 * `Popover` primitive, the same trigger/menu pattern `UserMenu.jsx`
 * already established (`role="menu"`/`role="menuitem"`, not a bespoke
 * dropdown). No business logic changed: the same
 * PUBLISHABLE/UNPUBLISHABLE/ARCHIVABLE status gating and the
 * accommodation-only "Manage rooms" condition move here unchanged from
 * `PartnerListingsList.jsx`.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@desavii/ui/components/primitives';
import { Popover } from '@desavii/ui/components/navigation';
import {
  PRESENTATION_GROUPS,
  resolvePresentationGroup,
} from '../../../listings/index.js';
import styles from './PartnerListingRowActions.module.scss';

const PUBLISHABLE_STATUSES = ['DRAFT', 'UNPUBLISHED'];
const UNPUBLISHABLE_STATUSES = ['PUBLISHED'];
const ARCHIVABLE_STATUSES = ['PUBLISHED', 'UNPUBLISHED'];

export default function PartnerListingRowActions({
  listing,
  isMutating,
  isPublishing,
  isUnpublishing,
  isArchiving,
  isDeleting,
  onView,
  onEdit,
  onManageRooms,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
  // Sprint F (Manager Workspace): a company-assigned Manager may
  // create/edit/publish a listing but never hard-delete one (that stays
  // owner/admin-only server-side, `listingService.js`'s
  // `MANAGER_ALLOWED_PERMISSION_KEYS`) — offering a button that always
  // 403s is worse than not offering it. Defaults to `true` so every
  // existing Partner caller is unaffected.
  canDelete = true,
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const canManageRooms =
    resolvePresentationGroup(listing.listing_type) ===
    PRESENTATION_GROUPS.ACCOMMODATION;
  const canPublish = PUBLISHABLE_STATUSES.includes(listing.status);
  const canUnpublish = UNPUBLISHABLE_STATUSES.includes(listing.status);
  const canArchive = ARCHIVABLE_STATUSES.includes(listing.status);

  function runAndClose(action) {
    setIsOpen(false);
    action(listing);
  }

  return (
    <div className={styles.actions}>
      <Button variant="ghost" size="sm" onClick={() => onView(listing)}>
        {t('partner.listings.actions.view')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onEdit(listing)}>
        {t('partner.listings.actions.edit')}
      </Button>
      <Popover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        placement="bottom-end"
        panelClassName={styles.menu}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<MoreHorizontal aria-hidden="true" focusable="false" />}
            ariaLabel={t('partner.listings.actions.more')}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            disabled={isMutating}
            onClick={() => setIsOpen((current) => !current)}
          />
        }
      >
        <div role="menu">
          {canManageRooms && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => runAndClose(onManageRooms)}
            >
              {t('partner.listings.actions.manageRooms')}
            </button>
          )}
          {canPublish && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              disabled={isPublishing}
              onClick={() => runAndClose(onPublish)}
            >
              {t('partner.listings.actions.publish')}
            </button>
          )}
          {canUnpublish && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              disabled={isUnpublishing}
              onClick={() => runAndClose(onUnpublish)}
            >
              {t('partner.listings.actions.unpublish')}
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              disabled={isArchiving}
              onClick={() => runAndClose(onArchive)}
            >
              {t('partner.listings.actions.archive')}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              className={[styles.menuItem, styles['menuItem--danger']].join(
                ' ',
              )}
              disabled={isDeleting}
              onClick={() => runAndClose(onDelete)}
            >
              {t('partner.listings.actions.delete')}
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}

PartnerListingRowActions.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  listing: PropTypes.object.isRequired,
  isMutating: PropTypes.bool.isRequired,
  isPublishing: PropTypes.bool.isRequired,
  isUnpublishing: PropTypes.bool.isRequired,
  isArchiving: PropTypes.bool.isRequired,
  isDeleting: PropTypes.bool.isRequired,
  onView: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onManageRooms: PropTypes.func.isRequired,
  onPublish: PropTypes.func.isRequired,
  onUnpublish: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  canDelete: PropTypes.bool,
};
