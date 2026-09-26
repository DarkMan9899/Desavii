/**
 * RoomAmenitiesEditor (Sprint C-1) — room-specific amenity selection for
 * one `bookable_unit`. Reuses the exact same `GET /listings/metadata`
 * amenity-groups payload `AmenitiesStep` (listing-level amenities)
 * already renders — the shared `listing_amenities` catalog, grouped by
 * `amenity_groups` (an "In-Room" group holds the newly-seeded room-only
 * entries, but every group is shown here, same reasoning as
 * `AmenitiesStep`: a room can legitimately have its own Air Conditioning
 * or Balcony even though those also belong to other groups). Selection
 * itself targets `bookable_unit_amenity_listing`, a completely separate
 * relation from the listing's own `listing_amenity_listing`.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Checkbox } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack } from '@desavii/ui/components/layout';
import ApiErrorAlert from '../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import { useListingMetadataQuery } from '../../queries/useListingMetadataQuery.js';
import { useReplaceBookableUnitAmenitiesMutation } from '../../../availability/index.js';

export default function RoomAmenitiesEditor({
  unitId,
  listingId,
  categoryId = null,
  amenityIds = [],
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const {
    data: metadata,
    isPending,
    isError,
    refetch,
  } = useListingMetadataQuery(categoryId, locale);
  const mutation = useReplaceBookableUnitAmenitiesMutation();

  const [selectedIds, setSelectedIds] = useState(() => new Set(amenityIds));

  if (isPending) {
    return <Spinner label={t('partner.listingWizard.amenities.loading')} />;
  }
  if (isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.amenities.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={refetch}
      />
    );
  }

  const { amenity_groups: amenityGroups } = metadata;

  function toggleAmenity(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    mutation.mutate({
      id: unitId,
      listingId,
      amenityIds: Array.from(selectedIds),
    });
  }

  return (
    <Stack gap="3">
      <h4>{t('partner.listingWizard.availability.roomAmenitiesHeading')}</h4>
      <ApiErrorAlert
        error={mutation.error}
        fieldLabels={{
          amenityIds: t(
            'partner.listingWizard.availability.roomAmenitiesHeading',
          ),
        }}
      />
      {amenityGroups.length === 0 ? (
        <p>{t('partner.listingWizard.amenities.empty')}</p>
      ) : (
        <Stack gap="4">
          {amenityGroups.map((group) => (
            <div key={group.code}>
              <p>
                {t(
                  `partner.listingWizard.amenityGroups.${group.code}`,
                  group.code,
                )}
              </p>
              <Stack gap="1">
                {group.amenities.map((amenity) => (
                  <Checkbox
                    key={amenity.value}
                    label={amenity.code}
                    checked={selectedIds.has(amenity.value)}
                    onChange={() => toggleAmenity(amenity.value)}
                  />
                ))}
              </Stack>
            </div>
          ))}
        </Stack>
      )}
      <Button
        variant="secondary"
        size="sm"
        loading={mutation.isPending}
        onClick={() => handleSave()}
      >
        {t('partner.listingWizard.availability.saveRoomAmenities')}
      </Button>
    </Stack>
  );
}

RoomAmenitiesEditor.propTypes = {
  unitId: PropTypes.number.isRequired,
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  amenityIds: PropTypes.arrayOf(PropTypes.number),
};
