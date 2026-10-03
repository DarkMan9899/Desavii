/**
 * BookableUnitsPanel — read-only review of a listing's real
 * `bookable_units` (room types / vehicle units / tour departures — one
 * generic table across every vertical, `BACKEND_ARCHITECTURE.md` §7A;
 * see `BookableUnitsManager.jsx`'s own header for the same "no separate
 * per-vertical table" note). Not previously surfaced anywhere in Admin —
 * moderation happened without ever seeing a listing's real inventory
 * shape.
 *
 * Reuses the exact bed/unit-type i18n vocabulary and summary wording the
 * Partner-side `BookableUnitsManager.jsx` already established
 * (`bookableUnitTypes.*` / `availability.{capacitySummary,maxGuestsSummary}`,
 * and the shared `formatBedConfiguration` bed wording) —
 * the same real enum values read the same way in both places, not a
 * parallel admin-only vocabulary. Base price uses the shared `PriceTag`
 * primitive instead of the partner view's own "{{amount}} {{currency}} /
 * night" sentence, since that wording is accommodation-specific and
 * would misdescribe a per-departure or per-vehicle rate.
 *
 * `time_slot_start`/`time_slot_end` are shown only when present — real
 * fields that exist solely for `TOUR_DEPARTURE` units in practice
 * (`timeSlotHint` in the Partner form: "Leave blank for a date-only
 * unit... Set both for a scheduled departure"). No pickup/return-time
 * fields exist anywhere on `bookable_units` for `VEHICLE` units — nothing
 * here invents one; the known Car Rental pickup/return-time gap stays
 * exactly as-is.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card, Badge } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { PriceTag } from '@desavii/ui/components/data-display';
import { Skeleton, EmptyState } from '@desavii/ui/components/feedback-overlays';
import {
  useListingBookableUnitsQuery,
  formatBedConfiguration,
} from '../../../listings/index.js';

function BookableUnitRow({ unit }) {
  const { t, i18n } = useTranslation();
  const bedSummary = formatBedConfiguration(t, unit.bed_configuration);
  const hasTimeWindow = unit.time_slot_start || unit.time_slot_end;

  return (
    <Card padding="md">
      <Stack gap="2">
        <Inline justify="space-between" wrap>
          <strong>
            {unit.unit_label ??
              t(
                `partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`,
                { defaultValue: unit.bookable_unit_type },
              )}
          </strong>
          <Badge
            variant="neutral"
            size="sm"
            label={t(
              `partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`,
              { defaultValue: unit.bookable_unit_type },
            )}
          />
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
        {hasTimeWindow && (
          <span>
            {t('admin.listingDetail.commercial.departureWindowLabel', {
              start: unit.time_slot_start,
              end: unit.time_slot_end,
            })}
          </span>
        )}
        {unit.base_price_amount != null && (
          <PriceTag
            amount={unit.base_price_amount}
            currencyCode={unit.base_price_currency}
            locale={i18n.language}
          />
        )}
      </Stack>
    </Card>
  );
}

BookableUnitRow.propTypes = {
  unit: PropTypes.shape({
    id: PropTypes.number,
    unit_label: PropTypes.string,
    bookable_unit_type: PropTypes.string,
    capacity: PropTypes.number,
    max_guests: PropTypes.number,
    bed_configuration: PropTypes.arrayOf(
      PropTypes.shape({ type: PropTypes.string, count: PropTypes.number }),
    ),
    time_slot_start: PropTypes.string,
    time_slot_end: PropTypes.string,
    base_price_amount: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    base_price_currency: PropTypes.string,
  }).isRequired,
};

export default function BookableUnitsPanel({ listingId }) {
  const { t } = useTranslation();
  const { data, isPending } = useListingBookableUnitsQuery(listingId);

  if (isPending) return <Skeleton variant="text" width="70%" />;

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={t('admin.listingDetail.commercial.bookableUnitsEmpty')}
      />
    );
  }

  return (
    <Stack gap="3">
      <h3>{t('admin.listingDetail.commercial.bookableUnitsHeading')}</h3>
      {data.map((unit) => (
        <BookableUnitRow key={unit.id} unit={unit} />
      ))}
    </Stack>
  );
}

BookableUnitsPanel.propTypes = {
  listingId: PropTypes.number.isRequired,
};
