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
  onManageMenu,
  onManageOpeningHours,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
  // Listing Lifetime / Renewal, Step B5 — a visible action, not buried in
  // the "More" overflow menu (brief §3/§20's own "clear Renew action"/
  // "Renew is the recovery action" language), shown only when the caller
  // (`PartnerListingsList.jsx`, via `isRenewEligible`) says this listing
  // is actually eligible.
  canRenew = false,
  onRenew = undefined,
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
  // Pass 6 (Restaurant vertical, owner issue #13) — same
  // presentation-group gate `canManageRooms` already uses, scoped to
  // DINING instead of ACCOMMODATION. A menu is genuinely Restaurant-only
  // content, unlike opening hours below — kept as its own, narrower gate.
  const canManageMenu =
    resolvePresentationGroup(listing.listing_type) ===
    PRESENTATION_GROUPS.DINING;
  // Pass 10 (Attraction vertical completion) — real, concrete
  // "EXISTS but PARTNER CANNOT AUTHOR" gap found during this pass's own
  // audit: `listing_opening_hours` (migration 0046) and its editor page
  // (`PartnerListingOpeningHoursPageContent`/`PartnerOpeningHoursEditor`)
  // were never actually Restaurant-specific — only this menu item's
  // gating was, previously piggy-backing on `canManageMenu` and so
  // silently hiding the "Manage Opening Hours" action from every other
  // category's partner, including Attraction. Scoped to the same
  // presentation-group mechanism already used above (never a
  // category-slug special case): DINING (unchanged) plus EXPERIENCE
  // (Tours/Attractions/Entertainment, which share the `ATTRACTION`/`TOUR`
  // listing_type) — a fixed-site landmark or a scheduled venue can both
  // have real weekly hours to author, same as a restaurant.
  const canManageOpeningHours = [
    PRESENTATION_GROUPS.DINING,
    PRESENTATION_GROUPS.EXPERIENCE,
  ].includes(resolvePresentationGroup(listing.listing_type));
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
      {canRenew && (
        <Button variant="primary" size="sm" onClick={() => onRenew(listing)}>
          {t('partner.listings.renew.action')}
        </Button>
      )}
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
          {canManageMenu && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => runAndClose(onManageMenu)}
            >
              {t('partner.listings.actions.manageMenu')}
            </button>
          )}
          {canManageOpeningHours && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => runAndClose(onManageOpeningHours)}
            >
              {t('partner.listings.actions.manageOpeningHours')}
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
  onManageMenu: PropTypes.func.isRequired,
  onManageOpeningHours: PropTypes.func.isRequired,
  onPublish: PropTypes.func.isRequired,
  onUnpublish: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  canRenew: PropTypes.bool,
  onRenew: PropTypes.func,
  canDelete: PropTypes.bool,
};
