/**
 * MapPreview — where a marker's preview opens: a card over the map on a
 * laptop and up, a bottom sheet (modal, focus-contained) on a phone. It
 * shows one listing (with "Back" when it was picked from a group) or the
 * listings stacked at one point.
 *
 * Focus moves to the preview's heading on open and whenever it shows
 * something else, so it never falls back to the page; closing the card
 * returns focus to where the visitor was (the bottom sheet restores its
 * own). Escape closes the card from anywhere in the map panel (`scopeRef`).
 * The card reports its height (`onCoveredHeightChange`) so the map can keep
 * the selection above it.
 */

import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X } from 'lucide-react';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import MapListingGroup from './MapListingGroup.jsx';
import MapListingPreview from './MapListingPreview.jsx';
import { mapMarkerShape } from './mapPropShapes.js';
import previewStyles from './MapPreview.module.scss';
import styles from './SearchMapPanel.module.scss';

export default function MapPreview({
  isCard,
  scopeRef,
  listing = undefined,
  group = null,
  formatPrice,
  onSelectFromGroup,
  onBack,
  onClose,
  onCoveredHeightChange,
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const cardRef = useRef(null);
  const openerRef = useRef(null);
  const isOpen = Boolean(listing || group);
  const contentKey = listing?.id ?? (group ? 'group' : null);

  useEffect(() => {
    if (contentKey === null) {
      const opener = openerRef.current;
      openerRef.current = null;
      if (isCard && opener?.isConnected) opener.focus();
      return;
    }
    if (!openerRef.current) openerRef.current = document.activeElement;
    document.getElementById(headingId)?.focus();
  }, [isCard, contentKey, headingId]);

  useLayoutEffect(() => {
    onCoveredHeightChange(cardRef.current?.offsetHeight ?? 0);
  }, [isCard, contentKey, onCoveredHeightChange]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!isCard || !isOpen || !scope) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    scope.addEventListener('keydown', handleKeyDown);
    return () => scope.removeEventListener('keydown', handleKeyDown);
  }, [isCard, isOpen, scopeRef, onClose]);

  if (!isOpen) return null;

  const content = listing ? (
    <div className={previewStyles.preview}>
      {group && (
        <button type="button" className={previewStyles.back} onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('search.map.preview.back')}
        </button>
      )}
      <MapListingPreview listing={listing} headingId={headingId} />
    </div>
  ) : (
    <MapListingGroup
      listings={group}
      headingId={headingId}
      formatPrice={formatPrice}
      onSelect={onSelectFromGroup}
    />
  );

  if (!isCard) {
    return (
      <Drawer
        isOpen
        onClose={onClose}
        anchor="bottom"
        ariaLabel={listing?.title ?? t('search.map.clusterList')}
        closeLabel={t('search.map.preview.close')}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <div ref={cardRef} className={styles.card}>
      <button
        type="button"
        className={styles.close}
        aria-label={t('search.map.preview.close')}
        onClick={onClose}
      >
        <X size={18} aria-hidden="true" />
      </button>
      {content}
    </div>
  );
}

MapPreview.propTypes = {
  /** A card over the map (laptop and up); otherwise a bottom sheet. */
  isCard: PropTypes.bool.isRequired,
  /** A ref to the map panel: Escape anywhere in it closes the card. */
  // eslint-disable-next-line react/forbid-prop-types -- a DOM node, set after mount
  scopeRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
  listing: mapMarkerShape,
  group: PropTypes.arrayOf(mapMarkerShape),
  formatPrice: PropTypes.func.isRequired,
  onSelectFromGroup: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onCoveredHeightChange: PropTypes.func.isRequired,
};
