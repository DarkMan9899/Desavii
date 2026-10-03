/**
 * BookableUnitForm — the shared field set for both registering a new
 * bookable unit (`isCreating`) and editing an existing one (P2.2A).
 *
 * Step L6.2B: the unit type is never a Partner choice — a new unit always
 * gets the one type its listing type allows (`profile.unitType`, enforced
 * by the backend too); an existing unit keeps its own stored type (types
 * are immutable after creation). Which type-specific fields render follows
 * that type (`unitTypeUsesField`, mirroring the backend's field rules), and
 * every label speaks the category's own language (`profile.terms`: "Room
 * type", "Departure", "Vehicle", "Session", …).
 *
 * `capacity` (inventory — rooms of this type, seats per departure,
 * vehicles in the fleet, …) and `maxGuests` (lodging occupancy per unit)
 * are deliberately two separate fields, never conflated.
 *
 * Start/end time (`bookable_units.time_slot_start/end`, read by the
 * Calendar's Week/Day timeline) only exists for a scheduled departure/
 * session and only at creation — `updateUnitSchema` doesn't accept it.
 * Leaving both blank keeps the departure/session date-only.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  BED_COUNT_MAX,
  BATHROOM_TYPES,
  VIEW_TYPES,
  SMOKING_POLICIES,
  MEAL_PLANS,
  INT_UNSIGNED_MAX,
  unitTypeUsesField,
  supportsRoomDetails,
} from '../../../availability/index.js';
import { CURRENCY_CODES } from '../../constants/currencies.js';
import { bookableUnitProfileShape } from '../../utils/resolveBookableUnitProfile.js';
import RoomDescriptionEditor from './RoomDescriptionEditor.jsx';
import RoomAmenitiesEditor from './RoomAmenitiesEditor.jsx';
import RoomMediaGallery from './RoomMediaGallery.jsx';
import ApiErrorAlert from '../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import apiErrorPropType from '../../../../components/ApiErrorAlert/apiErrorPropType.js';
import useApiFieldErrors from '../../../../hooks/useApiFieldErrors.js';
import styles from './BookableUnitForm.module.scss';

// Mirrors `availabilityValidators.js`'s `registerUnitSchema`/
// `updateUnitSchema` exactly. `capacity` is capped at its `INT UNSIGNED`
// column ceiling (no smaller product rule exists). `basePriceAmount` is
// strictly POSITIVE — unlike listing pricing/menu price, zero is invalid
// here. `basePriceAmount`/`roomSizeSqm` both allow at most 2 decimal
// places: their DECIMAL columns would otherwise silently round.
const INTEGER_STRING_PATTERN = /^-?\d+$/;
const DECIMAL_STRING_PATTERN = /^-?\d*\.?\d*$/;
const MAX_GUESTS_MAX = 100; // availabilityValidators.js: maxGuests.max(100)
const BASE_PRICE_MAX = 9999999999.99; // bookable_units.base_price_amount DECIMAL(12,2)
const ROOM_SIZE_SQM_MAX = 1000; // availabilityValidators.js: roomSizeSqm.max(1000)
const UNIT_LABEL_MAX_LENGTH = 120; // availabilityValidators.js: unitLabel.max(120), VARCHAR(120)
const LODGING_FALLBACK_TERMS = 'apartment';

// Step L6.3A — the sleeping setup as one quantity per bed type (stored as
// `bedConfiguration`: present types only), grouped the way a Partner
// thinks about a room: its own beds, then optional extra/children's
// sleeping. Every type in BED_TYPES appears in exactly one group.
const BED_TYPE_GROUPS = [
  {
    key: 'main',
    labelKey: 'bedsMainGroup',
    types: ['SINGLE', 'DOUBLE', 'QUEEN', 'KING', 'TWIN', 'BUNK', 'SOFA_BED'],
  },
  {
    key: 'extra',
    labelKey: 'bedsExtraGroup',
    hintKey: 'bedsExtraHint',
    types: ['EXTRA_BED', 'CHILD_BED', 'CRIB'],
  },
];
const ALL_BED_TYPES = BED_TYPE_GROUPS.flatMap((group) => group.types);
// A Select option for "nothing stated" — saved as `null` on an edit.
const NOT_SPECIFIED = '';

// Fields that render their own server error inline. A per-bed server issue
// (`bedConfiguration.<index>...`) reaches the summary alert: the grid's
// client validation already covers every per-type rule.
// `bookableUnitType` is deliberately absent: the type has no field of its
// own (it's implied by the listing), so a rejection about it — wrong type
// for this listing, a second vehicle, room details on a non-room unit —
// must reach the summary alert instead of an input that doesn't exist.
const INLINE_API_PATHS = [
  'unitLabel',
  'timeSlotStart',
  'timeSlotEnd',
  'capacity',
  'maxGuests',
  'roomSizeSqm',
  'bathroomType',
  'viewType',
  'smokingPolicy',
  'bedConfiguration',
  'mealPlan',
  'basePriceAmount',
  'basePriceCurrency',
];

const BASE_PRICE_MESSAGES = {
  invalid: 'partner.listingWizard.availability.basePriceAmountInvalid',
  notPositive: 'partner.listingWizard.availability.basePriceAmountNotPositive',
  tooLarge: 'partner.listingWizard.availability.basePriceAmountTooLarge',
  precision: 'partner.listingWizard.availability.basePriceAmountPrecision',
};

const ROOM_SIZE_MESSAGES = {
  invalid: 'partner.listingWizard.availability.roomSizeSqmInvalid',
  notPositive: 'partner.listingWizard.availability.roomSizeSqmNotPositive',
  tooLarge: 'partner.listingWizard.availability.roomSizeSqmTooLarge',
  precision: 'partner.listingWizard.availability.roomSizeSqmPrecision',
};

// A digit string past Number.MAX_SAFE_INTEGER parses to a rounded value,
// never the one the Partner typed — it's never accepted, and `tooLarge`
// lets a field say so instead of calling it malformed.
function parseIntegerField(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { value: undefined, malformed: false };
  if (!INTEGER_STRING_PATTERN.test(trimmed)) {
    return { value: undefined, malformed: true };
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return { value: undefined, malformed: true, tooLarge: value > 0 };
  }
  return { value, malformed: false };
}

function validateCapacity(rawValue, t) {
  const { value, malformed, tooLarge } = parseIntegerField(rawValue);
  if (tooLarge || (value !== undefined && value > INT_UNSIGNED_MAX)) {
    return {
      value: undefined,
      error: t('partner.listingWizard.availability.capacityTooLarge'),
    };
  }
  if (malformed || (value !== undefined && value < 1)) {
    return {
      value: undefined,
      error: t('partner.listingWizard.availability.capacityInvalid'),
    };
  }
  return { value, error: undefined };
}

function validateMaxGuests(rawValue, t) {
  const { value, malformed } = parseIntegerField(rawValue);
  if (
    malformed ||
    (value !== undefined && (value < 1 || value > MAX_GUESTS_MAX))
  ) {
    return {
      value: undefined,
      error: t('partner.listingWizard.availability.maxGuestsInvalid'),
    };
  }
  return { value, error: undefined };
}

// Step L6.3A: one bed type's quantity — a whole number 0..BED_COUNT_MAX
// (blank means 0, "none of this bed").
function validateBedCount(rawValue, t) {
  const { value, malformed } = parseIntegerField(rawValue);
  if (
    malformed ||
    (value !== undefined && (value < 0 || value > BED_COUNT_MAX))
  ) {
    return {
      value: undefined,
      error: t('partner.listingWizard.availability.bedCountInvalid'),
    };
  }
  return { value: value ?? 0, error: undefined };
}

function initialBedCounts(bedConfiguration) {
  const stated = new Map(
    (bedConfiguration ?? []).map((row) => [row.type, String(row.count)]),
  );
  return Object.fromEntries(
    ALL_BED_TYPES.map((type) => [type, stated.get(type) ?? '0']),
  );
}

// Optional, strictly positive, at most 2 decimal places, capped at `max`.
// Blank stays `undefined` (never `Number('') === 0`).
function validatePositiveTwoDecimal(rawValue, max, messages, t) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { value: undefined, error: undefined };
  const numeric = DECIMAL_STRING_PATTERN.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isFinite(numeric)) {
    return { value: undefined, error: t(messages.invalid) };
  }
  if (numeric <= 0) {
    return { value: undefined, error: t(messages.notPositive) };
  }
  if (numeric > max) {
    return { value: undefined, error: t(messages.tooLarge) };
  }
  if (Math.abs(Math.round(numeric * 100) - numeric * 100) >= 1e-6) {
    return { value: undefined, error: t(messages.precision) };
  }
  return { value: numeric, error: undefined };
}

export default function BookableUnitForm({
  profile,
  initialValues = {},
  isCreating = false,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel = undefined,
  // Sprint C-1: only present when editing an already-created unit — the
  // description/amenities/photo sub-editors need a real unit id, so they
  // never render while creating.
  unitId = null,
  listingId = null,
  categoryId = null,
  translations = [],
  amenityIds = [],
  media = [],
  // The register/update mutation's rejection, if any — each field shows
  // its own server issue; anything with no field lands in the summary.
  serverError = null,
}) {
  const { t } = useTranslation();
  // A new unit gets its listing type's one unit type; an existing unit
  // keeps its own stored (immutable) type.
  const bookableUnitType = isCreating
    ? profile.unitType
    : (initialValues.bookableUnitType ?? profile.unitType);
  // Only lodging term sets name guests; a legacy lodging unit on another
  // listing type borrows the generic "per unit" wording.
  const terms = (key) =>
    t(`partner.listingWizard.unitTerms.${profile.terms}.${key}`, {
      defaultValue: t(
        `partner.listingWizard.unitTerms.${LODGING_FALLBACK_TERMS}.${key}`,
      ),
    });
  const usesMaxGuests = unitTypeUsesField(bookableUnitType, 'maxGuests');
  const usesBeds = unitTypeUsesField(bookableUnitType, 'bedConfiguration');
  const usesTimeSlot =
    isCreating && unitTypeUsesField(bookableUnitType, 'timeSlotStart');
  const [unitLabel, setUnitLabel] = useState(initialValues.unitLabel ?? '');
  const [timeSlotStart, setTimeSlotStart] = useState(
    initialValues.timeSlotStart ?? '',
  );
  const [timeSlotEnd, setTimeSlotEnd] = useState(
    initialValues.timeSlotEnd ?? '',
  );
  const [capacity, setCapacity] = useState(
    initialValues.capacity != null ? String(initialValues.capacity) : '',
  );
  const [maxGuests, setMaxGuests] = useState(
    initialValues.maxGuests != null ? String(initialValues.maxGuests) : '',
  );
  const [bedCounts, setBedCounts] = useState(() =>
    initialBedCounts(initialValues.bedConfiguration),
  );
  const [basePriceAmount, setBasePriceAmount] = useState(
    initialValues.basePriceAmount != null
      ? String(initialValues.basePriceAmount)
      : '',
  );
  // Step L4.1 (brief §5-7, §10, §15-16) — field-level errors shown
  // immediately next to the relevant Input, mirroring the exact
  // AvailabilityStep/PricingStep convention (brief §22-23): never a
  // generic "Invalid number", always the specific domain rule that was
  // violated.
  const [fieldErrors, setFieldErrors] = useState({});
  const { fieldError, clearFieldError } = useApiFieldErrors(serverError);
  const [bedCountErrors, setBedCountErrors] = useState({});
  const [basePriceCurrency, setBasePriceCurrency] = useState(
    initialValues.basePriceCurrency ?? null,
  );
  // Sprint C-1 (Accommodation room-level product data).
  const [roomSizeSqm, setRoomSizeSqm] = useState(
    initialValues.roomSizeSqm != null ? String(initialValues.roomSizeSqm) : '',
  );
  const [bathroomType, setBathroomType] = useState(
    initialValues.bathroomType ?? NOT_SPECIFIED,
  );
  const [viewType, setViewType] = useState(
    initialValues.viewType ?? NOT_SPECIFIED,
  );
  const [smokingPolicy, setSmokingPolicy] = useState(
    initialValues.smokingPolicy ?? NOT_SPECIFIED,
  );
  const [mealPlan, setMealPlan] = useState(
    initialValues.mealPlan ?? NOT_SPECIFIED,
  );

  const usesRoomFields = unitTypeUsesField(bookableUnitType, 'roomSizeSqm');
  const usesMealPlan = unitTypeUsesField(bookableUnitType, 'mealPlan');
  const hasRoomDetails = supportsRoomDetails(bookableUnitType);

  // Step L6.3A — a blank optional field means "nothing stated": omitted
  // when registering, an explicit `null` (clear) when editing, so removing
  // a value really removes it instead of silently keeping the old one.
  const blankValue = isCreating ? undefined : null;
  const selectValue = (value) => (value === NOT_SPECIFIED ? blankValue : value);
  const notSpecifiedOption = {
    value: NOT_SPECIFIED,
    label: t('partner.listingWizard.availability.notSpecified'),
  };

  function updateBedCount(type, rawValue) {
    setBedCounts((counts) => ({ ...counts, [type]: rawValue }));
    setBedCountErrors((errors) => ({ ...errors, [type]: undefined }));
    clearFieldError('bedConfiguration');
  }

  // Step L4.1 (brief §5-7, §10-13) — validates every numeric field this
  // form owns against the exact backend rule (see the validators above),
  // never silently clamping/coercing a malformed or out-of-range typed
  // value into something else. Blocks the write entirely (no partial
  // submission) when any field is invalid.
  function handleSubmit() {
    const notUsed = { value: undefined, error: undefined };
    const capacityResult = validateCapacity(capacity, t);
    // Step L6.2B: a field this unit type doesn't use is neither rendered,
    // validated nor sent (the backend rejects it) — a hidden value must
    // never block saving.
    const maxGuestsResult = usesMaxGuests
      ? validateMaxGuests(maxGuests, t)
      : notUsed;
    const basePriceResult = validatePositiveTwoDecimal(
      basePriceAmount,
      BASE_PRICE_MAX,
      BASE_PRICE_MESSAGES,
      t,
    );
    const roomSizeResult = usesRoomFields
      ? validatePositiveTwoDecimal(
          roomSizeSqm,
          ROOM_SIZE_SQM_MAX,
          ROOM_SIZE_MESSAGES,
          t,
        )
      : notUsed;
    const bedResults = usesBeds
      ? Object.fromEntries(
          ALL_BED_TYPES.map((type) => [
            type,
            validateBedCount(bedCounts[type], t),
          ]),
        )
      : {};

    const nextFieldErrors = {
      capacity: capacityResult.error,
      maxGuests: maxGuestsResult.error,
      basePriceAmount: basePriceResult.error,
      roomSizeSqm: roomSizeResult.error,
    };
    const nextBedCountErrors = Object.fromEntries(
      Object.entries(bedResults).map(([type, result]) => [type, result.error]),
    );

    setFieldErrors(nextFieldErrors);
    setBedCountErrors(nextBedCountErrors);

    const hasErrors =
      Object.values(nextFieldErrors).some(Boolean) ||
      Object.values(nextBedCountErrors).some(Boolean);
    if (hasErrors) return;

    // Present bed types only, in display order; none at all is "no beds
    // stated" (omitted on create, cleared on edit).
    const bedConfiguration = ALL_BED_TYPES.filter(
      (type) => bedResults[type]?.value > 0,
    ).map((type) => ({ type, count: bedResults[type].value }));

    onSubmit({
      ...(isCreating ? { bookableUnitType } : {}),
      ...(usesTimeSlot
        ? {
            timeSlotStart: timeSlotStart === '' ? undefined : timeSlotStart,
            timeSlotEnd: timeSlotEnd === '' ? undefined : timeSlotEnd,
          }
        : {}),
      unitLabel: unitLabel.trim() === '' ? undefined : unitLabel.trim(),
      capacity: capacityResult.value,
      ...(usesMaxGuests
        ? { maxGuests: maxGuestsResult.value ?? blankValue }
        : {}),
      ...(usesBeds
        ? {
            bedConfiguration:
              bedConfiguration.length > 0 ? bedConfiguration : blankValue,
          }
        : {}),
      basePriceAmount: basePriceResult.value,
      basePriceCurrency: basePriceAmount === '' ? undefined : basePriceCurrency,
      ...(usesRoomFields
        ? {
            roomSizeSqm: roomSizeResult.value ?? blankValue,
            bathroomType: selectValue(bathroomType),
            viewType: selectValue(viewType),
            smokingPolicy: selectValue(smokingPolicy),
          }
        : {}),
      ...(usesMealPlan ? { mealPlan: selectValue(mealPlan) } : {}),
    });
  }

  const priceIncomplete =
    (basePriceAmount !== '' && !basePriceCurrency) ||
    (basePriceAmount === '' && Boolean(basePriceCurrency));
  const timeSlotIncomplete =
    (timeSlotStart !== '' && timeSlotEnd === '') ||
    (timeSlotStart === '' && timeSlotEnd !== '');
  const timeSlotOutOfOrder =
    timeSlotStart !== '' && timeSlotEnd !== '' && timeSlotEnd <= timeSlotStart;

  return (
    <Stack gap="6">
      <fieldset className={styles.section}>
        {usesRoomFields && (
          <legend className={styles.legend}>
            {t('partner.listingWizard.availability.roomBasicsHeading')}
          </legend>
        )}
        <Input
          label={t('partner.listingWizard.availability.unitLabel')}
          placeholder={terms('labelPlaceholder')}
          value={unitLabel}
          maxLength={UNIT_LABEL_MAX_LENGTH}
          error={fieldError('unitLabel')}
          onChange={(event) => {
            setUnitLabel(event.target.value);
            clearFieldError('unitLabel');
          }}
        />
        {usesTimeSlot && (
          <Inline gap="4" wrap align="flex-end">
            <Input
              type="time"
              label={t('partner.listingWizard.availability.timeSlotStart')}
              helperText={t('partner.listingWizard.availability.timeSlotHint')}
              value={timeSlotStart}
              error={fieldError('timeSlotStart')}
              onChange={(event) => {
                setTimeSlotStart(event.target.value);
                clearFieldError('timeSlotStart');
              }}
            />
            <Input
              type="time"
              label={t('partner.listingWizard.availability.timeSlotEnd')}
              value={timeSlotEnd}
              onChange={(event) => {
                setTimeSlotEnd(event.target.value);
                clearFieldError('timeSlotEnd');
              }}
              error={
                timeSlotOutOfOrder
                  ? t('partner.listingWizard.availability.timeSlotOutOfOrder')
                  : fieldError('timeSlotEnd')
              }
            />
          </Inline>
        )}
        {usesTimeSlot && timeSlotIncomplete && (
          <p>{t('partner.listingWizard.availability.timeSlotIncomplete')}</p>
        )}
        <Inline gap="4" wrap>
          <Input
            type="number"
            min={1}
            max={INT_UNSIGNED_MAX}
            step={1}
            label={terms('capacity')}
            helperText={terms('capacityHint')}
            value={capacity}
            error={fieldErrors.capacity ?? fieldError('capacity')}
            onChange={(event) => {
              setCapacity(event.target.value);
              clearFieldError('capacity');
              setFieldErrors((current) => ({
                ...current,
                capacity: undefined,
              }));
            }}
          />
          {usesMaxGuests && (
            <Input
              type="number"
              min={1}
              max={MAX_GUESTS_MAX}
              step={1}
              label={terms('maxGuests')}
              helperText={terms('maxGuestsHint')}
              value={maxGuests}
              error={fieldErrors.maxGuests ?? fieldError('maxGuests')}
              onChange={(event) => {
                setMaxGuests(event.target.value);
                clearFieldError('maxGuests');
                setFieldErrors((current) => ({
                  ...current,
                  maxGuests: undefined,
                }));
              }}
            />
          )}
        </Inline>
      </fieldset>

      {usesBeds && (
        <fieldset className={styles.section}>
          <legend className={styles.legend}>
            {t('partner.listingWizard.availability.roomSleepingHeading')}
          </legend>
          <p className={styles.hint}>
            {t('partner.listingWizard.availability.bedsHint')}
          </p>
          {fieldError('bedConfiguration') && (
            <p className={styles.error} role="alert">
              {fieldError('bedConfiguration')}
            </p>
          )}
          {BED_TYPE_GROUPS.map((group) => (
            <fieldset key={group.key} className={styles.bedGroup}>
              <legend className={styles.groupHeading}>
                {t(`partner.listingWizard.availability.${group.labelKey}`)}
              </legend>
              {group.hintKey && (
                <p className={styles.hint}>
                  {t(`partner.listingWizard.availability.${group.hintKey}`)}
                </p>
              )}
              <div className={styles.bedGrid}>
                {group.types.map((type) => (
                  <Input
                    key={type}
                    type="number"
                    min={0}
                    max={BED_COUNT_MAX}
                    step={1}
                    label={t(`partner.listingWizard.bedTypes.${type}`)}
                    value={bedCounts[type]}
                    error={bedCountErrors[type]}
                    onChange={(event) =>
                      updateBedCount(type, event.target.value)
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </fieldset>
      )}

      {usesRoomFields && (
        <fieldset className={styles.section}>
          <legend className={styles.legend}>
            {t('partner.listingWizard.availability.roomFeaturesHeading')}
          </legend>
          <Inline gap="4" wrap>
            <Input
              type="number"
              label={t('partner.listingWizard.availability.roomSizeSqm')}
              helperText={t(
                'partner.listingWizard.availability.roomSizeSqmHint',
              )}
              min={0.01}
              max={ROOM_SIZE_SQM_MAX}
              step={0.01}
              value={roomSizeSqm}
              error={fieldErrors.roomSizeSqm ?? fieldError('roomSizeSqm')}
              onChange={(event) => {
                setRoomSizeSqm(event.target.value);
                clearFieldError('roomSizeSqm');
                setFieldErrors((current) => ({
                  ...current,
                  roomSizeSqm: undefined,
                }));
              }}
            />
            <Select
              label={t('partner.listingWizard.availability.bathroomType')}
              options={[
                notSpecifiedOption,
                ...BATHROOM_TYPES.map((code) => ({
                  value: code,
                  label: t(`partner.listingWizard.bathroomTypes.${code}`),
                })),
              ]}
              value={bathroomType}
              error={fieldError('bathroomType')}
              onChange={(value) => {
                setBathroomType(value);
                clearFieldError('bathroomType');
              }}
            />
            <Select
              label={t('partner.listingWizard.availability.viewType')}
              options={[
                notSpecifiedOption,
                ...VIEW_TYPES.map((code) => ({
                  value: code,
                  label: t(`partner.listingWizard.viewTypes.${code}`),
                })),
              ]}
              value={viewType}
              error={fieldError('viewType')}
              onChange={(value) => {
                setViewType(value);
                clearFieldError('viewType');
              }}
            />
            <Select
              label={t('partner.listingWizard.availability.smokingPolicy')}
              options={[
                notSpecifiedOption,
                ...SMOKING_POLICIES.map((code) => ({
                  value: code,
                  label: t(`partner.listingWizard.smokingPolicies.${code}`),
                })),
              ]}
              value={smokingPolicy}
              error={fieldError('smokingPolicy')}
              onChange={(value) => {
                setSmokingPolicy(value);
                clearFieldError('smokingPolicy');
              }}
            />
          </Inline>
        </fieldset>
      )}

      {usesMealPlan && (
        <fieldset className={styles.section}>
          <legend className={styles.legend}>
            {t('partner.listingWizard.availability.roomMealsHeading')}
          </legend>
          <Select
            label={t('partner.listingWizard.availability.mealPlan')}
            options={[
              notSpecifiedOption,
              ...MEAL_PLANS.map((code) => ({
                value: code,
                label: t(`partner.listingWizard.mealPlans.${code}`),
              })),
            ]}
            value={mealPlan}
            error={fieldError('mealPlan')}
            onChange={(value) => {
              setMealPlan(value);
              clearFieldError('mealPlan');
            }}
          />
          <p className={styles.hint}>
            {t('partner.listingWizard.availability.mealPlanHint')}
          </p>
        </fieldset>
      )}

      <fieldset className={styles.section}>
        {usesRoomFields && (
          <legend className={styles.legend}>
            {t('partner.listingWizard.availability.roomPricingHeading')}
          </legend>
        )}
        <Inline gap="4" wrap>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            // Step L6.2B: the basis follows the listing's own pricing model,
            // and stays neutral wherever a basis would promise more than
            // booking charges today (see `resolveBookableUnitProfile`).
            label={t(`partner.listingWizard.unitPrice.${profile.priceBasis}`)}
            value={basePriceAmount}
            error={fieldErrors.basePriceAmount ?? fieldError('basePriceAmount')}
            onChange={(event) => {
              setBasePriceAmount(event.target.value);
              clearFieldError('basePriceAmount');
              setFieldErrors((current) => ({
                ...current,
                basePriceAmount: undefined,
              }));
            }}
          />
          <Select
            label={t('partner.listingWizard.availability.basePriceCurrency')}
            placeholder={t('partner.listingWizard.selectPlaceholder')}
            options={CURRENCY_CODES.map((code) => ({
              value: code,
              label: code,
            }))}
            value={basePriceCurrency}
            error={fieldError('basePriceCurrency')}
            onChange={(value) => {
              setBasePriceCurrency(value);
              clearFieldError('basePriceCurrency');
            }}
          />
        </Inline>
        {priceIncomplete && (
          <p>{t('partner.listingWizard.availability.basePriceIncomplete')}</p>
        )}
      </fieldset>

      {/* Sprint C-1: description/amenities/photos need a real, already-
          created unit — never shown while registering a brand-new room
          (`unitId` is only ever passed when editing). */}
      {hasRoomDetails && unitId && (
        <RoomDescriptionEditor
          unitId={unitId}
          listingId={listingId}
          translations={translations}
        />
      )}
      {hasRoomDetails && unitId && (
        <RoomAmenitiesEditor
          unitId={unitId}
          listingId={listingId}
          categoryId={categoryId}
          amenityIds={amenityIds}
        />
      )}
      {hasRoomDetails && unitId && (
        <RoomMediaGallery unitId={unitId} listingId={listingId} media={media} />
      )}

      <ApiErrorAlert error={serverError} inlinePaths={INLINE_API_PATHS} />

      <Inline gap="2">
        <Button
          variant="primary"
          loading={isSubmitting}
          disabled={priceIncomplete || timeSlotIncomplete || timeSlotOutOfOrder}
          onClick={() => handleSubmit()}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('partner.listingWizard.cancel')}
          </Button>
        )}
      </Inline>
    </Stack>
  );
}

BookableUnitForm.propTypes = {
  initialValues: PropTypes.shape({
    bookableUnitType: PropTypes.string,
    unitLabel: PropTypes.string,
    timeSlotStart: PropTypes.string,
    timeSlotEnd: PropTypes.string,
    capacity: PropTypes.number,
    maxGuests: PropTypes.number,
    bedConfiguration: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
        count: PropTypes.number,
      }),
    ),
    basePriceAmount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    basePriceCurrency: PropTypes.string,
    roomSizeSqm: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    bathroomType: PropTypes.string,
    viewType: PropTypes.string,
    smokingPolicy: PropTypes.string,
    mealPlan: PropTypes.string,
  }),
  profile: bookableUnitProfileShape.isRequired,
  isCreating: PropTypes.bool,
  isSubmitting: PropTypes.bool,
  submitLabel: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  unitId: PropTypes.number,
  listingId: PropTypes.number,
  categoryId: PropTypes.number,
  translations: PropTypes.arrayOf(
    PropTypes.shape({
      language_code: PropTypes.string.isRequired,
      description: PropTypes.string,
    }),
  ),
  amenityIds: PropTypes.arrayOf(PropTypes.number),
  serverError: apiErrorPropType,
  media: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      url: PropTypes.string.isRequired,
      thumbnail_url: PropTypes.string,
      position: PropTypes.number.isRequired,
      is_cover: PropTypes.bool.isRequired,
    }),
  ),
};
