/**
 * BookableUnitsManager (P2.2A) — replaces `AvailabilityStep`'s old
 * "register form disappears after the first unit" behavior. Lists every
 * bookable unit already on the listing, lets the partner edit any of
 * them, and always offers an "add another room type" action — the fix
 * for the audited blocker that made a real multi-room-type hotel
 * impossible to build through the UI.
 *
 * Used both inline in the Partner Listing Wizard's `AvailabilityStep`
 * AND standalone on the post-publish `PartnerListingRoomsPageContent` —
 * the same component, so a partner never has to re-enter the wizard just
 * to manage rooms after publishing. For a single-unit property
 * (apartment/villa/house) this renders exactly the same way, just with
 * one row instead of several — no separate "simple mode."
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import {
  useBookableUnitsQuery,
  useRegisterBookableUnitMutation,
  useUpdateBookableUnitMutation,
} from '../../../availability/index.js';
import BookableUnitForm from './BookableUnitForm.jsx';

function formatBedConfiguration(t, bedConfiguration) {
  if (!bedConfiguration || bedConfiguration.length === 0) return null;
  return bedConfiguration
    .map((row) =>
      t('partner.listingWizard.availability.bedSummaryItem', {
        count: row.count,
        type: t(`partner.listingWizard.bedTypes.${row.type}`, row.type),
      }),
    )
    .join(', ');
}

function UnitSummaryRow({ unit, onEdit }) {
  const { t } = useTranslation();
  const bedSummary = formatBedConfiguration(t, unit.bed_configuration);

  return (
    <Card padding="md">
      <Stack gap="2">
        <Inline justify="space-between">
          <strong>
            {unit.unit_label ??
              t(
                `partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`,
              )}
          </strong>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t('partner.listingWizard.availability.editUnit')}
          </Button>
        </Inline>
        <span>
          {t('partner.listingWizard.availability.capacitySummary', {
            count: unit.capacity,
          })}
        </span>
        {unit.max_guests != null && (
          <span>
            {t('partner.listingWizard.availability.maxGuestsSummary', {
              count: unit.max_guests,
            })}
          </span>
        )}
        {bedSummary && <span>{bedSummary}</span>}
        {unit.base_price_amount != null && (
          <span>
            {t('partner.listingWizard.availability.basePriceSummary', {
              amount: unit.base_price_amount,
              currency: unit.base_price_currency,
            })}
          </span>
        )}
      </Stack>
    </Card>
  );
}

UnitSummaryRow.propTypes = {
  unit: PropTypes.shape({
    id: PropTypes.number,
    unit_label: PropTypes.string,
    bookable_unit_type: PropTypes.string,
    capacity: PropTypes.number,
    max_guests: PropTypes.number,
    bed_configuration: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
        count: PropTypes.number,
      }),
    ),
    base_price_amount: PropTypes.string,
    base_price_currency: PropTypes.string,
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
};

export default function BookableUnitsManager({ listingId, categoryId = null }) {
  const { t } = useTranslation();
  const unitsQuery = useBookableUnitsQuery(listingId);
  const registerMutation = useRegisterBookableUnitMutation();
  const updateMutation = useUpdateBookableUnitMutation();

  const [editingUnitId, setEditingUnitId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  if (unitsQuery.isPending) {
    return <Spinner label={t('partner.listingWizard.availability.loading')} />;
  }
  if (unitsQuery.isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.availability.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={unitsQuery.refetch}
      />
    );
  }

  const units = unitsQuery.data ?? [];

  function handleAdd(values) {
    registerMutation.mutate(
      { listingId, ...values },
      { onSuccess: () => setIsAdding(false) },
    );
  }

  function handleUpdate(values) {
    updateMutation.mutate(
      { id: editingUnitId, listingId, payload: values },
      { onSuccess: () => setEditingUnitId(null) },
    );
  }

  // Each opened/closed form starts clean: a previous submit's rejection
  // must never reappear on (or attach its field errors to) another unit.
  function startEditing(unitId) {
    setIsAdding(false);
    updateMutation.reset();
    setEditingUnitId(unitId);
  }

  function startAdding() {
    setEditingUnitId(null);
    registerMutation.reset();
    setIsAdding(true);
  }

  function cancelEditing() {
    updateMutation.reset();
    setEditingUnitId(null);
  }

  function cancelAdding() {
    registerMutation.reset();
    setIsAdding(false);
  }

  return (
    <Stack gap="4">
      {units.length > 0 && (
        <Stack gap="3">
          {units.map((unit) =>
            unit.id === editingUnitId ? (
              <Card key={unit.id} padding="md">
                <BookableUnitForm
                  initialValues={{
                    bookableUnitType: unit.bookable_unit_type,
                    unitLabel: unit.unit_label ?? undefined,
                    capacity: unit.capacity,
                    maxGuests: unit.max_guests,
                    bedConfiguration: unit.bed_configuration ?? undefined,
                    basePriceAmount: unit.base_price_amount ?? undefined,
                    basePriceCurrency: unit.base_price_currency ?? undefined,
                    roomSizeSqm: unit.room_size_sqm ?? undefined,
                    bathroomType: unit.bathroom_type ?? undefined,
                    viewType: unit.view_type ?? undefined,
                    smokingPolicy: unit.smoking_policy ?? undefined,
                  }}
                  showTypeSelector={false}
                  isSubmitting={updateMutation.isPending}
                  submitLabel={t('partner.listingWizard.availability.saveUnit')}
                  onSubmit={(values) => handleUpdate(values)}
                  onCancel={() => cancelEditing()}
                  unitId={unit.id}
                  listingId={listingId}
                  categoryId={categoryId}
                  translations={unit.translations}
                  amenityIds={unit.amenity_ids}
                  media={unit.media}
                  serverError={updateMutation.error}
                />
              </Card>
            ) : (
              <UnitSummaryRow
                key={unit.id}
                unit={unit}
                onEdit={() => startEditing(unit.id)}
              />
            ),
          )}
        </Stack>
      )}

      {isAdding ? (
        <Card padding="md">
          <BookableUnitForm
            showTypeSelector
            isSubmitting={registerMutation.isPending}
            submitLabel={t('partner.listingWizard.availability.registerUnit')}
            onSubmit={(values) => handleAdd(values)}
            onCancel={() => cancelAdding()}
            serverError={registerMutation.error}
          />
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => startAdding()}>
          {units.length > 0
            ? t('partner.listingWizard.availability.addAnotherUnit')
            : t('partner.listingWizard.availability.registerUnit')}
        </Button>
      )}
    </Stack>
  );
}

BookableUnitsManager.propTypes = {
  listingId: PropTypes.number.isRequired,
  // Sprint C-1: needed to fetch the room-amenities metadata (`GET
  // /listings/metadata?categoryId=X`) — optional because not every caller
  // (e.g. a listing type with no room-amenity picker to show) has one
  // resolved.
  categoryId: PropTypes.number,
};
