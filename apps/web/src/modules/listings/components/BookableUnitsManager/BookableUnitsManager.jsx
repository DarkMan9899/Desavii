/**
 * BookableUnitsManager (P2.2A) — replaces `AvailabilityStep`'s old
 * "register form disappears after the first unit" behavior. Lists every
 * bookable unit already on the listing, lets the partner edit any of
 * them, and offers an "add" action — the fix for the audited blocker that
 * made a real multi-room-type hotel impossible to build through the UI.
 *
 * Used both inline in the Partner Listing Wizard's `AvailabilityStep`
 * AND standalone on the post-publish `PartnerListingRoomsPageContent` —
 * the same component, so a partner never has to re-enter the wizard just
 * to manage rooms after publishing.
 *
 * Step L6.2B: every label speaks the listing's own unit language
 * (`profile.terms`), and a Car Rental listing — one vehicle model, one
 * unit (its fleet size is the unit's capacity) — stops offering "add" once
 * its vehicle exists; the backend rejects a second one regardless.
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
import { bookableUnitProfileShape } from '../../utils/resolveBookableUnitProfile.js';
import { formatBedConfiguration } from '../../utils/bedConfigurationDisplay.js';
import { formatMealPlan } from '../ListingDetailPageContent/ListingRoomsSection/roomAttributeLabels.js';
import BookableUnitForm from './BookableUnitForm.jsx';

function UnitSummaryRow({ unit, profile, onEdit }) {
  const { t } = useTranslation();
  const bedSummary = formatBedConfiguration(t, unit.bed_configuration);
  const mealLabel = formatMealPlan(t, unit.meal_plan);

  return (
    <Card padding="md">
      <Stack gap="2">
        <Inline justify="space-between">
          <strong>
            {unit.unit_label ??
              t(`partner.listingWizard.unitTerms.${profile.terms}.noun`)}
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
        {mealLabel && <span>{mealLabel}</span>}
        {unit.hourly_enabled && (
          <span>
            {t('partner.listingWizard.availability.hourlySummary', {
              amount: unit.hourly_price_amount,
              currency: unit.hourly_price_currency,
              from: unit.hourly_available_from,
              until: unit.hourly_available_until,
            })}
          </span>
        )}
        {unit.base_price_amount != null && (
          <span>
            {t(`partner.listingWizard.unitPriceSummary.${profile.priceBasis}`, {
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
    meal_plan: PropTypes.string,
    hourly_enabled: PropTypes.bool,
    hourly_price_amount: PropTypes.string,
    hourly_price_currency: PropTypes.string,
    hourly_available_from: PropTypes.string,
    hourly_available_until: PropTypes.string,
    base_price_amount: PropTypes.string,
    base_price_currency: PropTypes.string,
  }).isRequired,
  profile: bookableUnitProfileShape.isRequired,
  onEdit: PropTypes.func.isRequired,
};

export default function BookableUnitsManager({
  listingId,
  categoryId = null,
  profile,
}) {
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
  const canAdd = !(profile.singleUnit && units.length > 0);

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

  const addLabel = t(`partner.listingWizard.unitTerms.${profile.terms}.add`);

  return (
    <Stack gap="4">
      {units.length > 0 && (
        <Stack gap="3">
          {units.map((unit) =>
            unit.id === editingUnitId ? (
              <Card key={unit.id} padding="md">
                <BookableUnitForm
                  profile={profile}
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
                    mealPlan: unit.meal_plan ?? undefined,
                    hourlyEnabled: unit.hourly_enabled ?? false,
                    hourlyPriceAmount: unit.hourly_price_amount ?? undefined,
                    hourlyPriceCurrency:
                      unit.hourly_price_currency ?? undefined,
                    hourlyMinDurationHours:
                      unit.hourly_min_duration_hours ?? undefined,
                    hourlyMaxDurationHours:
                      unit.hourly_max_duration_hours ?? undefined,
                    hourlyAvailableFrom:
                      unit.hourly_available_from ?? undefined,
                    hourlyAvailableUntil:
                      unit.hourly_available_until ?? undefined,
                  }}
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
                profile={profile}
                onEdit={() => startEditing(unit.id)}
              />
            ),
          )}
        </Stack>
      )}

      {isAdding && (
        <Card padding="md">
          <BookableUnitForm
            profile={profile}
            isCreating
            isSubmitting={registerMutation.isPending}
            submitLabel={addLabel}
            onSubmit={(values) => handleAdd(values)}
            onCancel={() => cancelAdding()}
            serverError={registerMutation.error}
          />
        </Card>
      )}
      {!isAdding && canAdd && (
        <Button variant="secondary" onClick={() => startAdding()}>
          {addLabel}
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
  profile: bookableUnitProfileShape.isRequired,
};
