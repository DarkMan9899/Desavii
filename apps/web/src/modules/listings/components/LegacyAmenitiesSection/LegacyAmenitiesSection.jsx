/**
 * LegacyAmenitiesSection (Step L6.1) — a listing's or room's previously
 * saved amenities that its category no longer offers
 * (`resolveLegacyAmenities`). Shared by `AmenitiesStep` and
 * `RoomAmenitiesEditor`.
 *
 * Each one stays checked (kept) until the Partner unchecks it. Unchecking
 * removes it on the next save; it then stays listed, unchecked and
 * disabled, so it can't be re-added — the backend would reject it as a
 * NEW out-of-category amenity anyway.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@desavii/ui/components/form-controls';
import styles from './LegacyAmenitiesSection.module.scss';

export default function LegacyAmenitiesSection({
  legacyAmenities,
  selectedIds,
  onRemove,
}) {
  const { t } = useTranslation();
  const hintId = useId();

  if (legacyAmenities.length === 0) return null;

  return (
    <fieldset className={styles.section} aria-describedby={hintId}>
      <legend className={styles.heading}>
        {t('partner.listingWizard.amenities.legacyHeading')}
      </legend>
      <p id={hintId} className={styles.hint}>
        {t('partner.listingWizard.amenities.legacyHint')}
      </p>
      <div className={styles.list}>
        {legacyAmenities.map((amenity) => {
          const isKept = selectedIds.has(amenity.value);
          return (
            <Checkbox
              key={amenity.value}
              label={
                isKept
                  ? amenity.code
                  : t('partner.listingWizard.amenities.legacyRemoved', {
                      name: amenity.code,
                    })
              }
              checked={isKept}
              disabled={!isKept}
              onChange={() => onRemove(amenity.value)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

LegacyAmenitiesSection.propTypes = {
  legacyAmenities: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number.isRequired,
      code: PropTypes.string.isRequired,
    }),
  ).isRequired,
  selectedIds: PropTypes.instanceOf(Set).isRequired,
  onRemove: PropTypes.func.isRequired,
};
