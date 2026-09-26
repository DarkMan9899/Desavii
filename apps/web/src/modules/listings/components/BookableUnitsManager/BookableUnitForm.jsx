/**
 * BookableUnitForm — the shared field set for both registering a new
 * bookable unit and editing an existing one (P2.2A). `bookableUnitType`
 * is only shown when creating (`showTypeSelector`) — changing a unit's
 * type post-creation has real booking-history implications, out of
 * scope here (see `bookableUnitService.updateUnit`'s own comment).
 *
 * `capacity` (inventory quantity — "how many rooms of this type exist")
 * and `maxGuests` (occupancy — "how many guests fit in one room") are
 * deliberately two separate fields, never conflated — the exact
 * distinction the P2.2A audit found `bookable_units.capacity` was
 * missing a counterpart for.
 *
 * Sprint 5 (Calendar P0): start/end time — real, optional `TIME` columns
 * (`bookable_units.time_slot_start/end`) already read by the Calendar's
 * Week/Day views to render a genuine hour-axis timeline for a tour/
 * activity departure. `registerUnitSchema` (backend) accepts them at
 * creation; `updateUnitSchema` deliberately does not (a departure's time
 * isn't editable post-creation, mirroring `bookableUnitType`'s own
 * create-only rule) — so, like the type selector, these fields only show
 * when `showTypeSelector` is true. Leaving both blank keeps a unit
 * date-only (a hotel room, a vehicle, a full-day guide) — this is an
 * opt-in field, never a forced one.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  BOOKABLE_UNIT_TYPES,
  BED_TYPES,
  BATHROOM_TYPES,
  VIEW_TYPES,
  SMOKING_POLICIES,
  INT_UNSIGNED_MAX,
} from '../../../availability/index.js';
import { CURRENCY_CODES } from '../../constants/currencies.js';
import RoomDescriptionEditor from './RoomDescriptionEditor.jsx';
import RoomAmenitiesEditor from './RoomAmenitiesEditor.jsx';
import RoomMediaGallery from './RoomMediaGallery.jsx';

// Sprint C-1 §17 — room-specific fields (size/bathroom/view/smoking,
// description/amenities/photos) are gated to this one unit type. Generic
// on the schema (any unit type could in principle carry room_size_sqm/
// bathroom_type/etc., same as maxGuests/bedConfiguration already are) but
// only ever shown here for a HOTEL_ROOM — a Tour departure or a Car
// Rental vehicle never sees a bathroom/view/smoking field or a photo
// gallery upload.
const HOTEL_ROOM_TYPE = 'HOTEL_ROOM';

// Mirrors `availabilityValidators.js`'s `registerUnitSchema`/
// `updateUnitSchema` exactly. `capacity` is capped at its `INT UNSIGNED`
// column ceiling (no smaller product rule exists). `basePriceAmount` is
// strictly POSITIVE — unlike listing pricing/menu price, zero is invalid
// here. `basePriceAmount`/`roomSizeSqm` both allow at most 2 decimal
// places: their DECIMAL columns would otherwise silently round.
const INTEGER_STRING_PATTERN = /^-?\d+$/;
const DECIMAL_STRING_PATTERN = /^-?\d*\.?\d*$/;
const MAX_GUESTS_MAX = 100; // availabilityValidators.js: maxGuests.max(100)
const BED_COUNT_MAX = 20; // availabilityValidators.js: bedConfigurationSchema count.max(20)
const BED_ROWS_MAX = 12; // availabilityValidators.js: bedConfigurationSchema array.max(12)
const BASE_PRICE_MAX = 9999999999.99; // bookable_units.base_price_amount DECIMAL(12,2)
const ROOM_SIZE_SQM_MAX = 1000; // availabilityValidators.js: roomSizeSqm.max(1000)

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

// Unlike capacity/maxGuests, a bed row's `count` is required by
// `bedConfigurationSchema` whenever the row exists — blank is an error.
function validateBedCount(rawValue, t) {
  const { value, malformed } = parseIntegerField(rawValue);
  if (malformed || value === undefined || value < 1 || value > BED_COUNT_MAX) {
    return {
      value: undefined,
      error: t('partner.listingWizard.availability.bedCountInvalid'),
    };
  }
  return { value, error: undefined };
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

function emptyBedRow() {
  return { type: BED_TYPES[0], count: '1' };
}

export default function BookableUnitForm({
  initialValues = {},
  showTypeSelector = false,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel = undefined,
  // Sprint C-1: only present when editing an already-created unit — the
  // description/amenities/photo sub-editors need a real unit id, so they
  // never render while `showTypeSelector` (creating) is true.
  unitId = null,
  listingId = null,
  categoryId = null,
  translations = [],
  amenityIds = [],
  media = [],
}) {
  const { t } = useTranslation();
  const [bookableUnitType, setBookableUnitType] = useState(
    initialValues.bookableUnitType ?? BOOKABLE_UNIT_TYPES[0],
  );
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
  const [bedRows, setBedRows] = useState(
    initialValues.bedConfiguration?.length > 0
      ? initialValues.bedConfiguration.map((row) => ({
          type: row.type,
          count: String(row.count),
        }))
      : [],
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
  const [bedRowErrors, setBedRowErrors] = useState([]);
  const [basePriceCurrency, setBasePriceCurrency] = useState(
    initialValues.basePriceCurrency ?? null,
  );
  // Sprint C-1 (Accommodation room-level product data).
  const [roomSizeSqm, setRoomSizeSqm] = useState(
    initialValues.roomSizeSqm != null ? String(initialValues.roomSizeSqm) : '',
  );
  const [bathroomType, setBathroomType] = useState(
    initialValues.bathroomType ?? null,
  );
  const [viewType, setViewType] = useState(initialValues.viewType ?? null);
  const [smokingPolicy, setSmokingPolicy] = useState(
    initialValues.smokingPolicy ?? null,
  );

  const isHotelRoom = bookableUnitType === HOTEL_ROOM_TYPE;

  function addBedRow() {
    setBedRows((rows) =>
      rows.length >= BED_ROWS_MAX ? rows : [...rows, emptyBedRow()],
    );
  }

  function updateBedRow(index, patch) {
    setBedRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    if ('count' in patch) {
      setBedRowErrors((errors) =>
        errors.map((error, i) => (i === index ? undefined : error)),
      );
    }
  }

  function removeBedRow(index) {
    setBedRows((rows) => rows.filter((_, i) => i !== index));
    setBedRowErrors((errors) => errors.filter((_, i) => i !== index));
  }

  // Step L4.1 (brief §5-7, §10-13) — validates every numeric field this
  // form owns against the exact backend rule (see the validators above),
  // never silently clamping/coercing a malformed or out-of-range typed
  // value into something else. Blocks the write entirely (no partial
  // submission) when any field is invalid.
  function handleSubmit() {
    const capacityResult = validateCapacity(capacity, t);
    const maxGuestsResult = validateMaxGuests(maxGuests, t);
    const basePriceResult = validatePositiveTwoDecimal(
      basePriceAmount,
      BASE_PRICE_MAX,
      BASE_PRICE_MESSAGES,
      t,
    );
    // Only a HOTEL_ROOM ever renders/sends roomSizeSqm — a hidden value
    // must never block saving any other unit type.
    const roomSizeResult = isHotelRoom
      ? validatePositiveTwoDecimal(
          roomSizeSqm,
          ROOM_SIZE_SQM_MAX,
          ROOM_SIZE_MESSAGES,
          t,
        )
      : { value: undefined, error: undefined };
    const bedRowResults = bedRows.map((row) => validateBedCount(row.count, t));

    const nextFieldErrors = {
      capacity: capacityResult.error,
      maxGuests: maxGuestsResult.error,
      basePriceAmount: basePriceResult.error,
      roomSizeSqm: roomSizeResult.error,
    };
    const nextBedRowErrors = bedRowResults.map((result) => result.error);

    setFieldErrors(nextFieldErrors);
    setBedRowErrors(nextBedRowErrors);

    const hasErrors =
      Object.values(nextFieldErrors).some(Boolean) ||
      nextBedRowErrors.some(Boolean);
    if (hasErrors) return;

    onSubmit({
      ...(showTypeSelector ? { bookableUnitType } : {}),
      ...(showTypeSelector
        ? {
            timeSlotStart: timeSlotStart === '' ? undefined : timeSlotStart,
            timeSlotEnd: timeSlotEnd === '' ? undefined : timeSlotEnd,
          }
        : {}),
      unitLabel: unitLabel.trim() === '' ? undefined : unitLabel.trim(),
      capacity: capacityResult.value,
      maxGuests: maxGuestsResult.value,
      bedConfiguration:
        bedRows.length > 0
          ? bedRows.map((row, i) => ({
              type: row.type,
              count: bedRowResults[i].value,
            }))
          : undefined,
      basePriceAmount: basePriceResult.value,
      basePriceCurrency: basePriceAmount === '' ? undefined : basePriceCurrency,
      ...(isHotelRoom
        ? {
            roomSizeSqm: roomSizeResult.value,
            bathroomType: bathroomType ?? undefined,
            viewType: viewType ?? undefined,
            smokingPolicy: smokingPolicy ?? undefined,
          }
        : {}),
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
    <Stack gap="4">
      {showTypeSelector && (
        <Select
          label={t('partner.listingWizard.availability.unitType')}
          placeholder={t('partner.listingWizard.selectPlaceholder')}
          options={BOOKABLE_UNIT_TYPES.map((code) => ({
            value: code,
            label: t(`partner.listingWizard.bookableUnitTypes.${code}`, code),
          }))}
          value={bookableUnitType}
          onChange={setBookableUnitType}
        />
      )}
      {isHotelRoom && (
        <p>{t('partner.listingWizard.availability.roomBasicsHeading')}</p>
      )}
      <Input
        label={t('partner.listingWizard.availability.unitLabel')}
        placeholder={t(
          'partner.listingWizard.availability.unitLabelPlaceholder',
        )}
        value={unitLabel}
        onChange={(event) => setUnitLabel(event.target.value)}
      />
      {showTypeSelector && (
        <Inline gap="4" wrap align="flex-end">
          <Input
            type="time"
            label={t('partner.listingWizard.availability.timeSlotStart')}
            helperText={t('partner.listingWizard.availability.timeSlotHint')}
            value={timeSlotStart}
            onChange={(event) => setTimeSlotStart(event.target.value)}
          />
          <Input
            type="time"
            label={t('partner.listingWizard.availability.timeSlotEnd')}
            value={timeSlotEnd}
            onChange={(event) => setTimeSlotEnd(event.target.value)}
            error={
              timeSlotOutOfOrder
                ? t('partner.listingWizard.availability.timeSlotOutOfOrder')
                : undefined
            }
          />
        </Inline>
      )}
      {showTypeSelector && timeSlotIncomplete && (
        <p>{t('partner.listingWizard.availability.timeSlotIncomplete')}</p>
      )}
      <Inline gap="4" wrap>
        <Input
          type="number"
          min={1}
          max={INT_UNSIGNED_MAX}
          step={1}
          label={t('partner.listingWizard.availability.capacity')}
          helperText={t('partner.listingWizard.availability.capacityHint')}
          value={capacity}
          error={fieldErrors.capacity}
          onChange={(event) => {
            setCapacity(event.target.value);
            setFieldErrors((current) => ({ ...current, capacity: undefined }));
          }}
        />
        <Input
          type="number"
          min={1}
          max={MAX_GUESTS_MAX}
          step={1}
          label={t('partner.listingWizard.availability.maxGuests')}
          helperText={t('partner.listingWizard.availability.maxGuestsHint')}
          value={maxGuests}
          error={fieldErrors.maxGuests}
          onChange={(event) => {
            setMaxGuests(event.target.value);
            setFieldErrors((current) => ({ ...current, maxGuests: undefined }));
          }}
        />
        {isHotelRoom && (
          <Input
            type="number"
            label={t('partner.listingWizard.availability.roomSizeSqm')}
            helperText={t('partner.listingWizard.availability.roomSizeSqmHint')}
            min={0.01}
            max={ROOM_SIZE_SQM_MAX}
            step={0.01}
            value={roomSizeSqm}
            error={fieldErrors.roomSizeSqm}
            onChange={(event) => {
              setRoomSizeSqm(event.target.value);
              setFieldErrors((current) => ({
                ...current,
                roomSizeSqm: undefined,
              }));
            }}
          />
        )}
      </Inline>

      {isHotelRoom && (
        <p>{t('partner.listingWizard.availability.roomSleepingHeading')}</p>
      )}
      <Stack gap="2">
        <p>{t('partner.listingWizard.availability.bedConfiguration')}</p>
        {bedRows.map((row, index) => (
          // eslint-disable-next-line react/no-array-index-key -- rows have no stable identity of their own until saved
          <Inline key={index} gap="2" align="flex-end">
            <Select
              label={t('partner.listingWizard.availability.bedType')}
              options={BED_TYPES.map((code) => ({
                value: code,
                label: t(`partner.listingWizard.bedTypes.${code}`, code),
              }))}
              value={row.type}
              onChange={(value) => updateBedRow(index, { type: value })}
            />
            <Input
              type="number"
              min={1}
              max={BED_COUNT_MAX}
              step={1}
              label={t('partner.listingWizard.availability.bedCount')}
              value={row.count}
              error={bedRowErrors[index]}
              onChange={(event) =>
                updateBedRow(index, { count: event.target.value })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeBedRow(index)}
            >
              {t('partner.listingWizard.availability.removeBed')}
            </Button>
          </Inline>
        ))}
        <Button
          variant="secondary"
          size="sm"
          disabled={bedRows.length >= BED_ROWS_MAX}
          onClick={() => addBedRow()}
        >
          {t('partner.listingWizard.availability.addBed')}
        </Button>
      </Stack>

      {isHotelRoom && (
        <Stack gap="3">
          <p>{t('partner.listingWizard.availability.roomFeaturesHeading')}</p>
          <Inline gap="4" wrap>
            <Select
              label={t('partner.listingWizard.availability.bathroomType')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={BATHROOM_TYPES.map((code) => ({
                value: code,
                label: t(`partner.listingWizard.bathroomTypes.${code}`, code),
              }))}
              value={bathroomType}
              onChange={setBathroomType}
            />
            <Select
              label={t('partner.listingWizard.availability.viewType')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={VIEW_TYPES.map((code) => ({
                value: code,
                label: t(`partner.listingWizard.viewTypes.${code}`, code),
              }))}
              value={viewType}
              onChange={setViewType}
            />
            <Select
              label={t('partner.listingWizard.availability.smokingPolicy')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={SMOKING_POLICIES.map((code) => ({
                value: code,
                label: t(`partner.listingWizard.smokingPolicies.${code}`, code),
              }))}
              value={smokingPolicy}
              onChange={setSmokingPolicy}
            />
          </Inline>
        </Stack>
      )}

      {isHotelRoom && (
        <p>{t('partner.listingWizard.availability.roomPricingHeading')}</p>
      )}
      <Inline gap="4" wrap>
        <Input
          type="number"
          min={0.01}
          step={0.01}
          label={t('partner.listingWizard.availability.basePriceAmount')}
          value={basePriceAmount}
          error={fieldErrors.basePriceAmount}
          onChange={(event) => {
            setBasePriceAmount(event.target.value);
            setFieldErrors((current) => ({
              ...current,
              basePriceAmount: undefined,
            }));
          }}
        />
        <Select
          label={t('partner.listingWizard.availability.basePriceCurrency')}
          placeholder={t('partner.listingWizard.selectPlaceholder')}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
          value={basePriceCurrency}
          onChange={setBasePriceCurrency}
        />
      </Inline>
      {priceIncomplete && (
        <p>{t('partner.listingWizard.availability.basePriceIncomplete')}</p>
      )}

      {/* Sprint C-1: description/amenities/photos need a real, already-
          created unit — never shown while registering a brand-new room
          (`unitId` is only ever passed when editing). */}
      {isHotelRoom && unitId && (
        <RoomDescriptionEditor
          unitId={unitId}
          listingId={listingId}
          translations={translations}
        />
      )}
      {isHotelRoom && unitId && (
        <RoomAmenitiesEditor
          unitId={unitId}
          listingId={listingId}
          categoryId={categoryId}
          amenityIds={amenityIds}
        />
      )}
      {isHotelRoom && unitId && (
        <RoomMediaGallery unitId={unitId} listingId={listingId} media={media} />
      )}

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
  }),
  showTypeSelector: PropTypes.bool,
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
