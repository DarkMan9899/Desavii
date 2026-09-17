/**
 * ListingLifecycleStatus — Listing Lifetime / Renewal, Step B5. Renders
 * exactly one badge from `listingLifecyclePresentation.js`'s canonical
 * derivation, so this is the ONLY place that turns a raw lifecycle state
 * into a badge/label (brief §15's "avoid every component independently
 * calculating status text").
 *
 * Renders NOTHING for LEGACY (brief §19 — a listing never assigned a
 * lifecycle, or a manually-UNPUBLISHED one per §21's own rule, shows no
 * expiry chrome at all; `ListingStatusBadge` alone already communicates
 * its state). Never color-only (brief §28) — each state has its own
 * translated label text, not just a different badge color.
 */

import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { Badge } from '@desavii/ui/components/primitives';
import {
  LISTING_LIFECYCLE_STATES,
  resolveListingLifecycleState,
  daysUntilExpiry,
} from '../../utils/listingLifecyclePresentation.js';
import styles from './ListingLifecycleStatus.module.scss';

const BADGE_VARIANT_BY_STATE = Object.freeze({
  [LISTING_LIFECYCLE_STATES.ACTIVE]: 'success',
  [LISTING_LIFECYCLE_STATES.EXPIRING_SOON]: 'warning',
  [LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN]: 'danger',
});

export default function ListingLifecycleStatus({ listing, locale }) {
  const { t } = useTranslation();
  const state = resolveListingLifecycleState(listing);

  if (state === LISTING_LIFECYCLE_STATES.LEGACY) return null;

  const days = daysUntilExpiry(listing);
  const formatDate = (value) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      new Date(value),
    );

  let badgeLabel;
  if (state === LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN) {
    badgeLabel = t('partner.listings.lifecycle.expiredFrozen');
  } else if (state === LISTING_LIFECYCLE_STATES.EXPIRING_SOON) {
    badgeLabel =
      days === 0
        ? t('partner.listings.lifecycle.expiresToday')
        : t('partner.listings.lifecycle.expiringSoon', { count: days });
  } else {
    badgeLabel = t('partner.listings.lifecycle.expiresInDays', {
      count: days,
    });
  }

  return (
    <div className={styles.lifecycle}>
      <Badge
        variant={BADGE_VARIANT_BY_STATE[state]}
        size="sm"
        label={badgeLabel}
      />
      {state !== LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN &&
        listing.expires_at && (
          <span className={styles.dateLine}>
            {t('partner.listings.lifecycle.expiresOn', {
              date: formatDate(listing.expires_at),
            })}
          </span>
        )}
      {state === LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN &&
        listing.purge_after && (
          <span className={styles.dateLine}>
            {t('partner.listings.lifecycle.retainedUntil', {
              date: formatDate(listing.purge_after),
            })}
          </span>
        )}
    </div>
  );
}

ListingLifecycleStatus.propTypes = {
  listing: PropTypes.shape({
    status: PropTypes.string,
    expires_at: PropTypes.string,
    frozen_at: PropTypes.string,
    purge_after: PropTypes.string,
  }).isRequired,
  locale: PropTypes.string.isRequired,
};
