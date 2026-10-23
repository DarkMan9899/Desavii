/**
 * ListingAvailabilitySection — informational only (an availability
 * summary for the next 30 days), never a date-picker/booking-selection
 * control — reserving actual dates is a distinct future Booking Flow
 * phase's concern (see `ListingBookingCta.jsx`'s own header for why this
 * phase doesn't build that).
 *
 * Phase 18 (availability-contradiction fix): every customer-facing status
 * claim in this section — the per-unit badges AND the "N of the next 30
 * days available" count — is now sourced from the SAME authoritative,
 * `quantity_available`-aware pipeline (`getPublicAvailabilitySummary` /
 * `getPublicDailyAvailabilityStatus`, both reading `availability_calendar.
 * quantity_available` with the blackout veto). Previously the count came
 * from `useListingAvailabilityQuery`'s legacy `GET .../calendar` endpoint,
 * whose day `status` field only reflects `availability_calendar.status_id`
 * — the exact gap `calendarExpansion.js`'s own header documents as "blind
 * to quantity_available exhaustion from manual blocks/external
 * reservations." That mismatch is what could show "Sold out" next to
 * "30 of the next 30 days available" for the same unit: two different
 * sources of truth disagreeing, not a copy problem. The listing's public
 * blocked ranges (`useListingAvailabilityQuery`) are the only other read.
 *
 * Calendar Excellence: the 30-day window starts at today's Asia/Yerevan
 * date (`getBusinessToday`), never the UTC date.
 *
 * The day-granular count is only computable unambiguously for a
 * single-bookable-unit listing (the day-status endpoint requires a
 * `unitId` once a listing has more than one unit, same ambiguity
 * `ListingReservationWidget` already handles) — for multi-unit listings
 * (hotels, tours, car rentals, ...) the per-unit badges already say
 * exactly which unit is scarce/sold out, so no separate blended day-count
 * sentence is shown; synthesizing one across heterogeneous units would
 * itself be a fabricated, unverifiable claim.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { useListingAvailabilityQuery } from '../../../queries/useListingAvailabilityQuery.js';
import { useListingAvailabilitySummaryQuery } from '../../../queries/useListingAvailabilitySummaryQuery.js';
import { useListingDayStatusQuery } from '../../../queries/useListingDayStatusQuery.js';
import { aggregateAvailabilitySummaryByUnitType } from '../../../utils/aggregateAvailabilitySummary.js';
import AvailabilitySummaryBadge from '../AvailabilitySummaryBadge/AvailabilitySummaryBadge.jsx';
import {
  addBusinessDays,
  getBusinessToday,
} from '../../../../../utils/businessDate.js';

const DAY_STATUS_WINDOW_DAYS = 30;

export default function ListingAvailabilitySection({
  listingId,
  sectionId = undefined,
}) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } =
    useListingAvailabilityQuery(listingId);
  // Independent of the calendar/ranges query above — a customer-safe
  // bucketed summary ("Available"/"Only N left"/"Sold out"), never a
  // blocking dependency: if it fails to load, the rest of this
  // informational section still renders normally.
  const { data: summary } = useListingAvailabilitySummaryQuery(listingId);

  const singleUnitId = summary?.length === 1 ? summary[0].unit_id : undefined;
  const windowFrom = getBusinessToday();
  const windowTo = addBusinessDays(windowFrom, DAY_STATUS_WINDOW_DAYS - 1);
  const { data: dayStatuses } = useListingDayStatusQuery(
    listingId,
    singleUnitId,
    { from: windowFrom, to: windowTo },
  );
  const availableDaysCount =
    singleUnitId && dayStatuses
      ? dayStatuses.filter((day) => day.availability_status !== 'SOLD_OUT')
          .length
      : null;

  const heading = t('pages.listingDetail.availability.heading');

  if (isPending) {
    return (
      <Section spacing="none" aria-label={heading}>
        <h2 id={sectionId}>{heading}</h2>
        <Spinner label={t('pages.listingDetail.availability.loading')} />
      </Section>
    );
  }

  if (isError) {
    return (
      <Section spacing="none" aria-label={heading}>
        <h2 id={sectionId}>{heading}</h2>
        <ErrorState
          title={t('pages.listingDetail.availability.errorTitle')}
          retryLabel={t('pages.listingDetail.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const hasRanges = data.ranges.length > 0;
  const hasSummary = summary && summary.length > 0;
  const hasAvailableDaysCount = availableDaysCount !== null;
  // Phase 18 (visual polish): several same-type units with no unit-level
  // name (e.g. a car-rental fleet) collapse into one badge per type
  // instead of one visually-identical badge per unit — see
  // `aggregateAvailabilitySummary.js`'s own header for why.
  const displaySummary = hasSummary
    ? aggregateAvailabilitySummaryByUnitType(summary)
    : summary;
  const summaryBlock = hasSummary && (
    <Inline gap="2" wrap>
      {displaySummary.map((unitSummary) => (
        <AvailabilitySummaryBadge
          key={unitSummary.unit_id}
          status={unitSummary.availability_status}
          remainingCount={unitSummary.remaining_count}
          bookableUnitType={unitSummary.bookable_unit_type}
        />
      ))}
    </Inline>
  );

  if (!hasSummary && !hasAvailableDaysCount && !hasRanges) {
    return (
      <Section spacing="none" aria-label={heading}>
        <h2 id={sectionId}>{heading}</h2>
        <p>{t('pages.listingDetail.availability.noData')}</p>
      </Section>
    );
  }

  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      {summaryBlock}
      {hasAvailableDaysCount && (
        <p>
          {t('pages.listingDetail.availability.availableDays', {
            count: availableDaysCount,
          })}
        </p>
      )}
      {hasRanges && (
        <Stack gap="2">
          <p>{t('pages.listingDetail.availability.blockedRanges')}</p>
          <ul>
            {data.ranges.map((range) => (
              <li key={`${range.date_from}-${range.date_to}`}>
                {range.date_from} – {range.date_to}
              </li>
            ))}
          </ul>
        </Stack>
      )}
    </Section>
  );
}

ListingAvailabilitySection.propTypes = {
  listingId: PropTypes.number.isRequired,
  sectionId: PropTypes.string,
};
