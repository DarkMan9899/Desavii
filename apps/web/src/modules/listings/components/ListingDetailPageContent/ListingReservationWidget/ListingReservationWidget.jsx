/**
 * ListingReservationWidget — Phase 7 (Booking Flow)'s replacement for the
 * old `ListingBookingCta` (toast-only placeholder): a real unit selector
 * (only shown when a listing has more than one bookable unit — see
 * `useListingBookableUnitsQuery.js`'s own header for the auto-select-vs-
 * ambiguous rule), a date-range picker with blocked days disabled from
 * the live calendar, an optional quantity stepper (only shown for a
 * shared-capacity unit, `capacity > 1`), a client-side estimated total
 * (explicitly labeled an estimate — the authoritative price is always
 * resolved server-side at booking-creation time, never trusted from this
 * calculation), and a "Request to Book" action that creates a
 * reservation hold and hands off to `BookingCheckoutPageContent`.
 *
 * A listing with zero registered bookable units (a partner hasn't set up
 * inventory yet) is a legitimate, honest state — not an error — so the
 * widget still shows the price with a plain "not bookable yet" message
 * rather than hiding entirely.
 *
 * The base-price `PriceTag`'s `suffix` carries the pricing-model label
 * (e.g. "per night") directly — this used to be a separate
 * `ListingPricingSection` rendered right below this widget, showing the
 * exact same amount a second time; merged here to remove that
 * duplicate price display.
 *
 * Marketplace Product Completeness Sprint A (Time-Aware Booking
 * Foundation): a listing whose units carry a real `time_slot_start` (a
 * Tour/Attraction departure/session — see `accommodationDateSemantics.js`)
 * now gets a genuine DATE-then-TIME flow instead of the generic unit
 * `Select` — the "unit" IS the time slot in this data model (one
 * `bookable_unit` per departure), so picking a time chip is exactly the
 * same `setSelectedUnitId` this widget already does for every other
 * category; nothing downstream (hold creation, checkout hand-off, price
 * estimate) needed to change. Every other category's flow (unit-then-
 * date-range) is byte-for-byte unchanged.
 *
 * Sprint C-2 (Public Rooms / Choose Your Room): `selectedUnitId`/
 * `onSelectUnit` are now optional CONTROLLED props — `ListingDetailPage
 * Content` lifts the state and passes both so a room picked in the new
 * `ListingRoomsSection` and a room picked from this widget's own `Select`
 * stay the same canonical selection, never two parallel states. Omitting
 * both (every existing render site/test that predates this sprint) falls
 * back to the exact same internal `useState` this component always
 * owned — a standard controlled/uncontrolled dual mode, not a behavior
 * change for any caller that doesn't opt in.
 *
 * Sprint C-3 (Date-Range Room Availability): `dateRange`/
 * `onChangeDateRange` get the exact same optional dual controlled/
 * uncontrolled treatment as `selectedUnitId` above, for the same reason —
 * `ListingRoomsSection`'s cards need to react to the check-in/check-out
 * range picked here (or in the mobile drawer). A real HOTEL_ROOM unit
 * additionally gets a server-authoritative stay total/availability
 * (`?checkIn=&checkOut=`, mirroring the time-slot flow's own `unitsForDate`
 * pattern) once both dates are chosen — this REPLACES the client-side
 * `computeEstimatedTotal` estimate for that one category rather than
 * running alongside it, since the brief is explicit that no frontend
 * arithmetic may stand in as the source of truth for a Hotel stay. Every
 * other category (Tour time-slots, Vehicle rentals, plain single-unit
 * listings) is completely unaffected — `isAccommodationListing` gates all
 * of this on a real `bookable_unit_type`, never an inferred category.
 */

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PriceTag } from '@desavii/ui/components/data-display';
import { Button } from '@desavii/ui/components/primitives';
import {
  Select,
  Input,
  DatePicker,
  ChipGroup,
} from '@desavii/ui/components/form-controls';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { useAuth } from '../../../../../contexts/AuthContext.jsx';
import { useToast } from '../../../../../contexts/ToastContext.jsx';
import { formatTimeRange } from '../../../../../utils/formatTimeRange.js';
import { useListingBookableUnitsQuery } from '../../../queries/useListingBookableUnitsQuery.js';
import { useListingCalendarQuery } from '../../../queries/useListingCalendarQuery.js';
import { useListingDayStatusQuery } from '../../../queries/useListingDayStatusQuery.js';
import { useCreateBookingHoldMutation } from '../../../../bookings/mutations/useCreateBookingHoldMutation.js';
import {
  addDays,
  toISODate,
  computeEstimatedTotal,
} from '../../../utils/reservationEstimate.js';
import {
  resolveBookingCtaLabel,
  resolvePricingModelLabel,
} from '../../../utils/reservationLabels.js';
import { formatBedConfiguration } from '../../../utils/bedConfigurationDisplay.js';
import { resolveInitialReservationState } from '../../../utils/reservationSearchContext.js';
import styles from './ListingReservationWidget.module.scss';

const CALENDAR_WINDOW_DAYS = 180;

export default function ListingReservationWidget({
  listingId,
  pricing = null,
  bookingCtaKey = 'pages.listingDetail.reservation.requestToBook',
  location = null,
  selectedUnitId: controlledSelectedUnitId = undefined,
  onSelectUnit = undefined,
  dateRange: controlledDateRange = undefined,
  onChangeDateRange = undefined,
}) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const today = toISODate(new Date());

  // P2.2D: a customer arriving here from the search page (which carries
  // dateFrom/dateTo/guests forward as query params) starts with THOSE
  // selections already filled in, instead of a blank calendar and
  // guests=1 they'd have to re-enter. A bare/direct listing URL with no
  // (or malformed) params resolves to the exact same blank/1 defaults as
  // before — see `resolveInitialReservationState`'s own safety rules.
  const [initialReservationState] = useState(() =>
    resolveInitialReservationState(searchParams, today),
  );
  const isUnitSelectionControlled = controlledSelectedUnitId !== undefined;
  const [internalSelectedUnitId, setInternalSelectedUnitId] = useState(null);
  const selectedUnitId = isUnitSelectionControlled
    ? controlledSelectedUnitId
    : internalSelectedUnitId;
  // Every existing call site in this file (`handleSelectUnit`,
  // `handleSelectTimeSlot`, `handleSelectDate`) keeps calling this one
  // setter exactly as before — it now also notifies a controlling parent
  // (`ListingRoomsSection`'s own selected-state) when one exists, instead
  // of only ever updating local state.
  function setSelectedUnitId(value) {
    onSelectUnit?.(value);
    if (!isUnitSelectionControlled) setInternalSelectedUnitId(value);
  }
  const isDateRangeControlled = controlledDateRange !== undefined;
  const [internalDateRange, setInternalDateRange] = useState(
    initialReservationState.dateRange,
  );
  const dateRange = isDateRangeControlled
    ? controlledDateRange
    : internalDateRange;
  // Every existing call site below (`setDateRange({...})`) keeps calling
  // this one setter unchanged — it now also notifies a controlling parent
  // (`ListingRoomsSection`'s own stay-range fetch) when one exists,
  // exactly mirroring `setSelectedUnitId` above.
  function setDateRange(value) {
    onChangeDateRange?.(value);
    if (!isDateRangeControlled) setInternalDateRange(value);
  }
  const [quantity, setQuantity] = useState(1);
  const [guestCount, setGuestCount] = useState(
    initialReservationState.guestCount,
  );
  // Sprint B (Car Rental Pickup/Return Interval): pickup/return time has
  // no unit-level default the way a Tour departure's `time_slot_start`
  // does (a vehicle unit is a physical asset, not a scheduled session) —
  // it's genuine customer choice, captured here and validated both
  // client-side (below, UX only) and authoritatively server-side inside
  // `AvailabilityService#reserveCapacity` via `rentalIntervalValidation.js`.
  const [pickupTime, setPickupTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  // Pass 6: a Restaurant reservation's own single chosen time — no
  // unit-level default the way a Tour departure's `time_slot_start`
  // provides one, and no "return" leg the way a vehicle rental has.
  const [reservationTime, setReservationTime] = useState('');

  const {
    data: units,
    isPending: isUnitsPending,
    isError: isUnitsError,
    refetch: refetchUnits,
  } = useListingBookableUnitsQuery(listingId);

  const effectiveUnitId =
    selectedUnitId ?? (units?.length === 1 ? units[0].id : null);
  const selectedUnit =
    units?.find((unit) => unit.id === effectiveUnitId) ?? null;

  // Sprint A: real per-unit `time_slot_start` (never inferred from
  // category/listing type — a Tour can genuinely have a date-only unit,
  // per the audit's own "intraday scheduling is per bookable unit, not
  // per category" finding) is what actually gates the time-slot flow.
  const timeSlotUnits = useMemo(
    () => (units ?? []).filter((unit) => Boolean(unit.time_slot_start)),
    [units],
  );
  const isTimeSlotListing = timeSlotUnits.length > 0;

  // Sprint B: a real per-unit `bookable_unit_type === 'VEHICLE'` (never
  // inferred from listing category) gates the pickup/return location+time
  // UI, mirroring Sprint A's own `time_slot_start`-gates-the-time-slot-UI
  // rule directly above.
  const isVehicleListing = useMemo(
    () => (units ?? []).some((unit) => unit.bookable_unit_type === 'VEHICLE'),
    [units],
  );

  // Pass 6 (Restaurant vertical, owner issue #12/#13): a real per-unit
  // `bookable_unit_type === 'RESTAURANT_TABLE'` gates a genuinely
  // Restaurant-shaped flow — one date, one customer-chosen reservation
  // time, and a party size (never a date RANGE or "Guests" hotel
  // language) — mirroring `isVehicleListing`'s own "never inferred from
  // listing category" rule exactly.
  const isRestaurantListing = useMemo(
    () =>
      (units ?? []).some(
        (unit) => unit.bookable_unit_type === 'RESTAURANT_TABLE',
      ),
    [units],
  );

  // Sprint C-3 (Date-Range Room Availability): a real per-unit
  // `bookable_unit_type === 'HOTEL_ROOM'` gates the stay-range
  // availability/pricing flow, mirroring `isVehicleListing` above exactly
  // — never inferred from listing category, and never applied to a
  // PROPERTY_UNIT listing (whose existing flow is explicitly out of this
  // sprint's scope and stays byte-for-byte unchanged).
  const isAccommodationListing = useMemo(
    () =>
      (units ?? []).some((unit) => unit.bookable_unit_type === 'HOTEL_ROOM'),
    [units],
  );

  // `listing_locations` is UNIQUE(listing_id) — there is no multi-location
  // model, so pickup and return are always the SAME listing-registered
  // location (same-location-return-only; see `bookingService.js`'s
  // `formatListingLocationLabel`, which this mirrors exactly so the
  // customer sees identical text pre- and post-booking). Informational
  // text only, never a selectable field — there is nothing to select.
  const rentalLocationLabel = location
    ? [location.city_name, location.country_name].filter(Boolean).join(', ')
    : null;

  const rentalInterval = useMemo(() => {
    if (!isVehicleListing) return { valid: true };
    if (!dateRange.start || !dateRange.end || !pickupTime || !returnTime) {
      return { valid: false, reason: 'INCOMPLETE_RENTAL_INTERVAL' };
    }
    // Plain string comparison of `${date}T${time}` — never a `Date`
    // object — same wall-clock-string convention as the backend's own
    // `rentalIntervalValidation.js`, avoiding any timezone reinterpretation
    // risk for what is always local wall-clock time at the rental location.
    const pickupDatetime = `${dateRange.start}T${pickupTime}`;
    const returnDatetime = `${dateRange.end}T${returnTime}`;
    if (returnDatetime <= pickupDatetime) {
      return { valid: false, reason: 'RETURN_NOT_AFTER_PICKUP' };
    }
    return { valid: true };
  }, [
    isVehicleListing,
    dateRange.start,
    dateRange.end,
    pickupTime,
    returnTime,
  ]);

  // Once a date is chosen, re-fetch the unit list augmented with a real
  // per-unit availability/price snapshot for THAT date (`?date=`,
  // `availabilityService.js#getPublicUnits`) — this is what lets the chip
  // row honestly exclude/disable a departure that's sold out on this
  // specific day, not just show every registered time unconditionally.
  const { data: unitsForDate, isPending: isUnitsForDatePending } =
    useListingBookableUnitsQuery(listingId, {
      date: isTimeSlotListing ? dateRange.start : undefined,
    });
  const unitsForDateById = useMemo(() => {
    const map = new Map();
    if (isTimeSlotListing) {
      (unitsForDate ?? []).forEach((unit) => map.set(unit.id, unit));
    }
    return map;
  }, [unitsForDate, isTimeSlotListing]);

  // Sprint C-3: once BOTH check-in and check-out are chosen, re-fetch the
  // same public units read augmented with a real whole-stay availability/
  // price snapshot (`?checkIn=&checkOut=`) — the server-authoritative
  // figure `handleRequestToBook` below hands off to checkout, never a
  // client-computed one for this category. Mirrors `unitsForDate` above:
  // one query, shared cache key with the plain unit list when the range
  // isn't valid yet (both params simply come back `undefined`).
  const hasValidStayRange = Boolean(
    isAccommodationListing && dateRange.start && dateRange.end,
  );
  const { data: unitsForStay } = useListingBookableUnitsQuery(listingId, {
    checkIn: hasValidStayRange ? dateRange.start : undefined,
    checkOut: hasValidStayRange ? dateRange.end : undefined,
  });
  const unitsForStayById = useMemo(() => {
    const map = new Map();
    if (isAccommodationListing) {
      (unitsForStay ?? []).forEach((unit) => map.set(unit.id, unit));
    }
    return map;
  }, [unitsForStay, isAccommodationListing]);
  const selectedUnitStayInfo = unitsForStayById.get(effectiveUnitId) ?? null;
  const isStaySoldOut =
    selectedUnitStayInfo?.availability_status_for_stay === 'SOLD_OUT';

  const timeSlotOptions = useMemo(
    () =>
      timeSlotUnits
        .slice()
        .sort((a, b) =>
          (a.time_slot_start ?? '').localeCompare(b.time_slot_start ?? ''),
        )
        .map((unit) => {
          const dateInfo = unitsForDateById.get(unit.id);
          const isSoldOut =
            dateInfo?.availability_status_for_date === 'SOLD_OUT';
          return {
            value: String(unit.id),
            label:
              formatTimeRange(unit.time_slot_start, unit.time_slot_end) ??
              unit.unit_label,
            disabled: Boolean(dateRange.start) && isSoldOut,
          };
        }),
    [timeSlotUnits, unitsForDateById, dateRange.start],
  );
  const hasAnySelectableTime = timeSlotOptions.some(
    (option) => !option.disabled,
  );

  // P2.2B: the unit's own real `unit_label` (e.g. "Deluxe King") when a
  // partner set one, falling back to the generic type label only for a
  // legacy unit with no label — never a bare "Type #N" ordinal anymore.
  function resolveUnitDisplayLabel(unit) {
    if (!unit) return null;
    return (
      unit.unit_label ||
      t(`partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`, {
        defaultValue: unit.bookable_unit_type,
      })
    );
  }

  const windowEnd = addDays(today, CALENDAR_WINDOW_DAYS);

  const { data: calendarDays, refetch: refetchCalendar } =
    useListingCalendarQuery(listingId, effectiveUnitId, {
      from: today,
      to: windowEnd,
    });

  // Phase 18 (Availability UX fix) — the authoritative per-day source for
  // which days are actually selectable. `calendarDays` above is kept only
  // for its per-day price; its own `status` field is blind to a day whose
  // `quantity_available` a manual block or external reservation already
  // consumed to zero (see `useListingDayStatusQuery.js`'s header) so it is
  // never used to decide `disabledDates` here.
  const { data: dayStatuses, refetch: refetchDayStatus } =
    useListingDayStatusQuery(listingId, effectiveUnitId, {
      from: today,
      to: windowEnd,
    });

  const priceByDate = useMemo(() => {
    const map = {};
    (calendarDays ?? []).forEach((day) => {
      map[day.date] = day;
    });
    return map;
  }, [calendarDays]);

  const disabledDates = useMemo(
    () =>
      (dayStatuses ?? [])
        .filter((day) => day.availability_status === 'SOLD_OUT')
        .map((day) => day.date),
    [dayStatuses],
  );

  const clientEstimatedTotal = useMemo(
    () =>
      computeEstimatedTotal(
        dateRange,
        priceByDate,
        quantity,
        selectedUnit?.bookable_unit_type,
      ),
    [dateRange, priceByDate, quantity, selectedUnit],
  );
  // Sprint C-3: a Hotel stay's total is the server-computed
  // `stay_total_amount` (the exact `resolvePriceForDate`/`Money`-summed
  // figure booking creation will charge), never the client's own
  // day-by-day estimate — the one category this endpoint now serves
  // authoritatively. `null` (pricing incomplete, or the range not valid
  // yet) means genuinely "no total to show", not a stale/wrong number.
  const hasServerStayTotal =
    hasValidStayRange && selectedUnitStayInfo?.stay_total_amount != null;
  let estimatedTotal = clientEstimatedTotal;
  if (isAccommodationListing) {
    estimatedTotal = hasServerStayTotal
      ? {
          amount: selectedUnitStayInfo.stay_total_amount,
          currency: selectedUnitStayInfo.stay_total_currency,
        }
      : null;
  }

  const pricingModelLabel = resolvePricingModelLabel(t, pricing);

  // P2.2B: once a unit is selected, its own real base price (P2.2A rung 2
  // of the same date-override -> unit-base -> listing-fallback precedence
  // `bookingService.js#resolveItem` resolves server-side) replaces the
  // static listing-level headline price — a listing whose room types
  // carry different base prices no longer shows one misleading number
  // regardless of which unit the customer picked. A unit with no base
  // price of its own (legacy, or never set) truthfully falls back to the
  // listing price server-side too, so the headline keeps showing exactly
  // that here. Before any unit is selected, behavior is unchanged.
  const headlinePricing =
    selectedUnit?.base_price_amount !== undefined &&
    selectedUnit?.base_price_amount !== null
      ? {
          amount: selectedUnit.base_price_amount,
          currency: selectedUnit.base_price_currency,
        }
      : pricing;

  const allowedGuests =
    selectedUnit?.max_guests !== undefined && selectedUnit?.max_guests !== null
      ? selectedUnit.max_guests * quantity
      : null;

  // Sprint C-3: for the exact chosen stay, `remaining_count_for_stay`
  // (only ever present once LOW/SOLD_OUT — see `resolveAvailabilityStatus`)
  // is a tighter, real bound than the unit's pooled `capacity` — never
  // looser, so `Math.min` is always safe. The server still re-checks this
  // authoritatively at hold-creation time regardless of what this caps the
  // input to.
  const quantityMax =
    hasValidStayRange && selectedUnitStayInfo?.remaining_count_for_stay != null
      ? Math.max(
          1,
          Math.min(
            selectedUnit?.capacity ?? Infinity,
            selectedUnitStayInfo.remaining_count_for_stay,
          ),
        )
      : selectedUnit?.capacity;

  // P2.2D: a `guestCount` seeded from the search page's own `guests`
  // param (see `initialReservationState` above) is only bounds-checked
  // generically (1..50) at that point — the unit-specific cap isn't
  // knowable until `units` finishes loading. Re-clamps once it does,
  // same rule `handleChangeQuantity` already applies on every later
  // quantity change, so the field is never left silently over its real
  // allowance just because the URL supplied a value larger than this
  // particular unit permits.
  useEffect(() => {
    if (allowedGuests === null) return;
    setGuestCount((current) => Math.min(current, allowedGuests));
  }, [allowedGuests]);

  const bedConfigurationSummary = selectedUnit
    ? formatBedConfiguration(t, selectedUnit.bed_configuration)
    : null;

  const createHoldMutation = useCreateBookingHoldMutation();
  // Sprint C-3: a room already known SOLD_OUT for the exact chosen stay
  // must never be submittable from here — this is a UX gate only, never
  // the real safety check (that stays server-side, row-locked, inside
  // `reserveCapacity` at hold-creation time; see `handleRequestToBook`'s
  // own `AVAILABILITY_CONFLICT` handling below for when this client-side
  // read has gone stale).
  const canSubmit =
    Boolean(effectiveUnitId) &&
    Boolean(dateRange.start) &&
    Boolean(dateRange.end) &&
    rentalInterval.valid &&
    !isStaySoldOut &&
    (!isRestaurantListing || Boolean(reservationTime));

  function handleSelectUnit(value) {
    // P2.2D: a multi-unit listing never auto-selects (see
    // `effectiveUnitId` above), so this is the ONLY path that applies a
    // URL-seeded `initialReservationState` for such a listing — clearing
    // dateRange/guestCount unconditionally here, as this function
    // previously did, silently discarded a customer's own search
    // selections the instant they picked their first room. Genuinely
    // SWITCHING between units (selectedUnitId was already set) still
    // clears them, since a previously valid date range/guest count isn't
    // necessarily valid for a different unit's own availability/
    // max_guests — only the first pick preserves whatever was already
    // there.
    const isFirstSelection = selectedUnitId === null;
    setSelectedUnitId(Number(value));
    if (!isFirstSelection) {
      setDateRange({ start: null, end: null });
      setQuantity(1);
      setGuestCount(1);
      setPickupTime('');
      setReturnTime('');
    }
  }

  // Sprint A — time-slot flow: date is chosen FIRST, so unlike
  // `handleSelectUnit` above (built for the opposite order), picking a
  // time never needs to reset the date/quantity/guests that already led
  // to it.
  function handleSelectTimeSlot(value) {
    setSelectedUnitId(value === undefined ? null : Number(value));
  }

  // Section 9: a new date invalidates whatever time was previously
  // selected — its real availability hasn't been checked yet for this
  // date, so the customer must pick again rather than carry a stale
  // selection forward.
  function handleSelectDate(date) {
    setDateRange({ start: date, end: date });
    setSelectedUnitId(null);
  }

  // Sprint C-3: a new stay range hasn't been checked against the
  // previously-selected room yet — the same "date invalidates the prior
  // selection" rule `handleSelectDate` above already applies to the
  // time-slot flow, mirrored here for the room-then-dates flow. Every
  // other category (Vehicle, plain generic) keeps the exact same
  // `setDateRange` behavior it always had.
  function handleChangeDateRange(nextRange) {
    setDateRange(nextRange);
    if (isAccommodationListing) {
      setSelectedUnitId(null);
    }
  }

  function handleChangeQuantity(nextQuantity) {
    const clampedQuantity = Math.max(
      1,
      Math.min(quantityMax ?? selectedUnit.capacity, nextQuantity || 1),
    );
    setQuantity(clampedQuantity);
    // A shrinking quantity can shrink the allowed guest cap
    // (max_guests x quantity) below the guest count already entered —
    // re-clamp so the two fields never drift into an invalid combination.
    if (
      selectedUnit?.max_guests !== undefined &&
      selectedUnit?.max_guests !== null
    ) {
      setGuestCount((current) =>
        Math.min(current, selectedUnit.max_guests * clampedQuantity),
      );
    }
  }

  function handleChangeGuestCount(nextGuestCount) {
    const raw = Number(nextGuestCount) || 1;
    setGuestCount(
      allowedGuests !== null
        ? Math.min(allowedGuests, Math.max(1, raw))
        : Math.max(1, raw),
    );
  }

  async function handleRequestToBook() {
    if (!isAuthenticated) {
      const redirectTarget = encodeURIComponent(
        `/${locale}/listings/${listingId}`,
      );
      navigate(`/${locale}/auth/login?redirect=${redirectTarget}`);
      return;
    }
    try {
      const { data } = await createHoldMutation.mutateAsync([
        {
          bookableUnitId: effectiveUnitId,
          dateFrom: dateRange.start,
          dateTo: dateRange.end,
          quantity,
          // Sprint B / Pass 6: only a real VEHICLE or RESTAURANT_TABLE
          // unit ever sends a customer-chosen time —
          // `AvailabilityService#reserveCapacity` silently ignores time on
          // every other unit type, so this is UX-only precision, never a
          // tampering vector for a Tour's own fixed departure time.
          ...(isVehicleListing && {
            startTime: pickupTime,
            endTime: returnTime,
          }),
          ...(isRestaurantListing && {
            startTime: reservationTime,
          }),
        },
      ]);
      navigate(`/${locale}/booking/checkout`, {
        // Phase 12 (Product Polish): the already-computed client estimate
        // rides along so checkout can show a real price summary card
        // without a new backend endpoint — still explicitly labeled an
        // estimate there too, same as here. P2.2B additive: `unitLabel`
        // (this widget's own real-label resolution, so checkout never has
        // to re-derive it) and `guestCount` — both ephemeral, display/
        // payload-only hand-off, same category as `estimatedTotal`; the
        // persisted, authoritative unit identity checkout/history read
        // afterward always comes from the real booking response instead.
        state: {
          listingId,
          holdBatch: data,
          estimatedTotal,
          unitLabel: resolveUnitDisplayLabel(selectedUnit),
          guestCount,
          // Pass 6: lets checkout's generic order-summary row labels
          // (shared across every vertical) swap in Restaurant-appropriate
          // wording instead of the hotel-flavored "Room / unit type" /
          // "Guests" defaults — the same "never render hotel language for
          // a restaurant" rule the widget itself already follows.
          isRestaurantReservation: isRestaurantListing,
          // Sprint A: rides along the same way `unitLabel` already does —
          // display-only on checkout; the persisted, authoritative time a
          // customer sees afterward always comes from the real booking
          // response's own `start_time`/`end_time` snapshot, never this.
          // Pass 6: a Restaurant unit has no unit-level `time_slot_start`
          // of its own (same reasoning as VEHICLE) — its real value is
          // the customer's own chosen `reservationTime`, which
          // `formatTimeRange` (checkout's own generic "Time" row) already
          // renders correctly with no `timeSlotEnd`.
          timeSlotStart: isRestaurantListing
            ? reservationTime
            : (selectedUnit?.time_slot_start ?? null),
          timeSlotEnd: selectedUnit?.time_slot_end ?? null,
          // Sprint B: same display-only, ephemeral hand-off category as
          // `timeSlotStart`/`timeSlotEnd` above — the persisted,
          // authoritative pickup/return identity checkout/history read
          // afterward always comes from the real booking response's own
          // `start_time`/`end_time`/`pickup_location`/`return_location`.
          ...(isVehicleListing && {
            pickupTime,
            returnTime,
            rentalLocationLabel,
          }),
        },
      });
    } catch (err) {
      // Phase 17 §Checkout Revalidation — the authoritative capacity
      // check happens server-side inside `reserveCapacity` (row-locked
      // against `availability_calendar`), so a customer whose calendar
      // went stale between page load and this click can genuinely lose
      // the race to another booking/manual block. Surfacing the specific
      // conflict codes (rather than the generic holdError) and refetching
      // the calendar keeps the disabled-dates picker honest immediately
      // afterward, instead of letting the customer retry into the same
      // wall.
      const isConflict =
        err?.code === 'AVAILABILITY_CONFLICT' || err?.code === 'BLACKOUT_DATE';
      showToast(
        t(
          isConflict
            ? 'pages.listingDetail.reservation.availabilityConflict'
            : 'pages.listingDetail.reservation.holdError',
        ),
        { variant: 'danger' },
      );
      if (isConflict) {
        setDateRange({ start: null, end: null });
        refetchCalendar();
        refetchDayStatus();
      }
    }
  }

  if (isUnitsPending) {
    return (
      <Section spacing="none">
        <Spinner label={t('pages.listingDetail.loading')} />
      </Section>
    );
  }

  if (isUnitsError) {
    return (
      <Section spacing="none">
        <ErrorState
          title={t('pages.listingDetail.errorTitle')}
          retryLabel={t('pages.listingDetail.retry')}
          onRetry={refetchUnits}
        />
      </Section>
    );
  }

  if (!units || units.length === 0) {
    return (
      <Section spacing="none" className={styles.widget}>
        <Inline gap="4" justify="space-between">
          {pricing && (
            <PriceTag
              amount={pricing.amount}
              currencyCode={pricing.currency}
              locale={locale}
              suffix={pricingModelLabel}
              size="lg"
            />
          )}
          <p>{t('pages.listingDetail.reservation.noUnitsAvailable')}</p>
        </Inline>
      </Section>
    );
  }

  // P2.2B: real `unit_label` (never a bare "Type #N" ordinal when the
  // partner actually named the unit), with the unit's own known
  // `max_guests` appended — reuses the same `maxGuestsSummary` string the
  // partner-side BookableUnitsManager already shows for the identical
  // data, rather than inventing new copy for it.
  //
  // P2.2E: price and available quantity per option, so a customer can
  // compare units before picking one rather than only after. Both reuse
  // `BookableUnitsManager.jsx`'s own `basePriceSummary`/`capacitySummary`
  // keys verbatim (same field, same audience-neutral wording already
  // shown to partners) — never fabricated: price is shown only when this
  // SPECIFIC unit has its own `base_price_amount` (never the listing-
  // level fallback price mislabeled as this unit's own), matching this
  // widget's own `headlinePricing` precedence comment above.
  const unitOptions = units.map((unit) => {
    const baseLabel = resolveUnitDisplayLabel(unit);
    const guestsSuffix =
      unit.max_guests !== undefined && unit.max_guests !== null
        ? ` — ${t('partner.listingWizard.availability.maxGuestsSummary', { count: unit.max_guests })}`
        : '';
    const priceSuffix =
      unit.base_price_amount !== undefined && unit.base_price_amount !== null
        ? ` — ${t('partner.listingWizard.availability.basePriceSummary', { amount: unit.base_price_amount, currency: unit.base_price_currency })}`
        : '';
    const quantitySuffix =
      unit.capacity !== undefined && unit.capacity !== null
        ? ` — ${t('partner.listingWizard.availability.capacitySummary', { count: unit.capacity })}`
        : '';
    return {
      value: unit.id,
      label: `${baseLabel}${guestsSuffix}${priceSuffix}${quantitySuffix}`,
    };
  });

  // Sprint A: the "date chosen, now show real times" step — pulled out of
  // the JSX below purely to avoid nesting ternaries (a single real
  // departure needs no choice at all; otherwise it's load / real chips /
  // honest "nothing available", one state at a time, never combined into
  // one expression).
  function renderTimeSlotStep() {
    if (timeSlotUnits.length === 1) {
      return (
        <p>
          {t('pages.listingDetail.reservation.timeLabel')}:{' '}
          {formatTimeRange(
            timeSlotUnits[0].time_slot_start,
            timeSlotUnits[0].time_slot_end,
          )}
        </p>
      );
    }
    if (!dateRange.start) return null;
    if (isUnitsForDatePending) {
      return (
        <Spinner label={t('pages.listingDetail.reservation.loadingTimes')} />
      );
    }
    if (!hasAnySelectableTime) {
      return <p>{t('pages.listingDetail.reservation.noTimesForDate')}</p>;
    }
    return (
      <ChipGroup
        label={t('pages.listingDetail.reservation.timeLabel')}
        options={timeSlotOptions}
        selectedValue={selectedUnitId ? String(selectedUnitId) : undefined}
        onChange={(value) => handleSelectTimeSlot(value)}
      />
    );
  }

  // Sprint C-3: rendered in one of two positions below depending on
  // `isAccommodationListing` — dates FIRST for a Hotel stay (the brief's
  // own "select check-in -> select check-out -> ... -> select room"
  // order), unit-then-dates for every other category exactly as before.
  // A single shared element (never two independently-authored copies)
  // since only one position ever actually renders it for a given listing.
  const dateRangePicker = (
    <DatePicker
      mode="range"
      label={t(
        isVehicleListing
          ? 'pages.listingDetail.reservation.pickupReturnDatesLabel'
          : 'pages.listingDetail.reservation.datesLabel',
      )}
      value={dateRange}
      onChange={isAccommodationListing ? handleChangeDateRange : setDateRange}
      minDate={today}
      disabledDates={disabledDates}
      locale={i18n.language}
      previousMonthLabel={t('partner.listingWizard.datePicker.previousMonth')}
      nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
      placeholder={t('partner.listingWizard.datePicker.selectDate')}
    />
  );

  return (
    <Section spacing="none" className={styles.widget}>
      <Stack gap="4">
        {headlinePricing && (
          <PriceTag
            amount={headlinePricing.amount}
            currencyCode={headlinePricing.currency}
            locale={locale}
            suffix={pricingModelLabel}
            size="lg"
          />
        )}

        {isTimeSlotListing ? (
          <>
            <DatePicker
              mode="single"
              label={t('pages.listingDetail.reservation.dateLabel')}
              value={dateRange.start}
              onChange={(date) => handleSelectDate(date)}
              minDate={today}
              locale={i18n.language}
              previousMonthLabel={t(
                'partner.listingWizard.datePicker.previousMonth',
              )}
              nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
              placeholder={t('partner.listingWizard.datePicker.selectDate')}
            />

            {renderTimeSlotStep()}
          </>
        ) : (
          <>
            {isAccommodationListing && dateRangePicker}

            {units.length > 1 && (
              <Select
                label={t('pages.listingDetail.reservation.unitLabel')}
                options={unitOptions}
                value={selectedUnitId ?? ''}
                onChange={(value) => handleSelectUnit(value)}
                placeholder={t(
                  'pages.listingDetail.reservation.unitPlaceholder',
                )}
              />
            )}

            {bedConfigurationSummary && <p>{bedConfigurationSummary}</p>}

            {isAccommodationListing && hasValidStayRange && selectedUnit && (
              <p
                role={isStaySoldOut ? 'status' : undefined}
                className={
                  isStaySoldOut ? styles.staySoldOut : styles.stayNights
                }
              >
                {isStaySoldOut
                  ? t('pages.listingDetail.reservation.staySoldOut')
                  : selectedUnitStayInfo?.night_count_for_stay != null &&
                    t('pages.listingDetail.reservation.nightsCount', {
                      count: selectedUnitStayInfo.night_count_for_stay,
                    })}
              </p>
            )}

            {isRestaurantListing ? (
              <>
                <DatePicker
                  mode="single"
                  label={t('pages.listingDetail.reservation.dateLabel')}
                  value={dateRange.start}
                  onChange={(date) => handleSelectDate(date)}
                  minDate={today}
                  locale={i18n.language}
                  previousMonthLabel={t(
                    'partner.listingWizard.datePicker.previousMonth',
                  )}
                  nextMonthLabel={t(
                    'partner.listingWizard.datePicker.nextMonth',
                  )}
                  placeholder={t('partner.listingWizard.datePicker.selectDate')}
                />
                <Input
                  type="time"
                  label={t(
                    'pages.listingDetail.reservation.reservationTimeLabel',
                  )}
                  value={reservationTime}
                  disabled={!dateRange.start}
                  onChange={(event) => setReservationTime(event.target.value)}
                />
              </>
            ) : (
              !isAccommodationListing && dateRangePicker
            )}

            {isVehicleListing && (
              <Stack gap="3">
                <Stack gap="1" className={styles.rentalLeg}>
                  <p className={styles.rentalLegLabel}>
                    {t('pages.listingDetail.reservation.pickupLabel')}
                  </p>
                  <p className={styles.rentalLocation}>
                    {rentalLocationLabel ??
                      t('pages.listingDetail.reservation.locationUnavailable')}
                  </p>
                  <Input
                    type="time"
                    label={t('pages.listingDetail.reservation.pickupTimeLabel')}
                    value={pickupTime}
                    disabled={!dateRange.start}
                    onChange={(event) => setPickupTime(event.target.value)}
                  />
                </Stack>

                <Stack gap="1" className={styles.rentalLeg}>
                  <p className={styles.rentalLegLabel}>
                    {t('pages.listingDetail.reservation.returnLabel')}
                  </p>
                  <p className={styles.rentalLocation}>
                    {rentalLocationLabel ??
                      t('pages.listingDetail.reservation.locationUnavailable')}
                  </p>
                  <Input
                    type="time"
                    label={t('pages.listingDetail.reservation.returnTimeLabel')}
                    value={returnTime}
                    disabled={!dateRange.end}
                    onChange={(event) => setReturnTime(event.target.value)}
                  />
                </Stack>

                {!rentalInterval.valid &&
                  rentalInterval.reason === 'RETURN_NOT_AFTER_PICKUP' && (
                    <p role="alert" className={styles.rentalIntervalError}>
                      {t(
                        'pages.listingDetail.reservation.invalidRentalInterval',
                      )}
                    </p>
                  )}
              </Stack>
            )}
          </>
        )}

        {/* Pass 6: a restaurant table's `capacity` is how many CONCURRENT
            reservations the dining room can hold, not a customer-facing
            "how many tables would you like" choice — showing this
            stepper to a diner would read as exactly the confusing
            hotel-room language the brief calls out. Every other category
            keeps this exactly as before. */}
        {!isRestaurantListing && selectedUnit && selectedUnit.capacity > 1 && (
          <Input
            type="number"
            label={t('pages.listingDetail.reservation.quantityLabel')}
            value={quantity}
            min={1}
            max={quantityMax}
            onChange={(event) =>
              handleChangeQuantity(Number(event.target.value))
            }
          />
        )}

        {selectedUnit && (
          <Input
            type="number"
            label={t(
              isRestaurantListing
                ? 'pages.listingDetail.reservation.partySizeLabel'
                : 'pages.listingDetail.reservation.guestsLabel',
            )}
            value={guestCount}
            min={1}
            max={allowedGuests ?? undefined}
            helperText={
              allowedGuests !== null
                ? t('pages.listingDetail.reservation.guestsHint', {
                    max: allowedGuests,
                  })
                : undefined
            }
            onChange={(event) =>
              handleChangeGuestCount(Number(event.target.value))
            }
          />
        )}

        {estimatedTotal && (
          <PriceTag
            amount={estimatedTotal.amount}
            currencyCode={estimatedTotal.currency}
            locale={locale}
            suffix={t('pages.listingDetail.reservation.estimatedTotal')}
          />
        )}

        <Button
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          loading={createHoldMutation.isPending}
          onClick={() => handleRequestToBook()}
        >
          {resolveBookingCtaLabel(t, bookingCtaKey)}
        </Button>
      </Stack>
    </Section>
  );
}

ListingReservationWidget.propTypes = {
  listingId: PropTypes.number.isRequired,
  pricing: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    currency: PropTypes.string,
    pricing_model: PropTypes.string,
  }),
  bookingCtaKey: PropTypes.string,
  location: PropTypes.shape({
    city_name: PropTypes.string,
    country_name: PropTypes.string,
  }),
  selectedUnitId: PropTypes.number,
  onSelectUnit: PropTypes.func,
  dateRange: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  onChangeDateRange: PropTypes.func,
};
