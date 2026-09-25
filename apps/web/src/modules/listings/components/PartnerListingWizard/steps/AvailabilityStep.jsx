/**
 * AvailabilityStep — step 8. Room/unit registration (P2.2A: including
 * occupancy/bed configuration/base price, and — unlike the old version —
 * NOT limited to a single unit; see `BookableUnitsManager`) and managing
 * blackout dates both come from the `availability` module's public
 * exports (`modules/listings` depending on `modules/availability` is the
 * allowed direction — FRONTEND_ARCHITECTURE.md §6.3: "listings may
 * depend on availability"). Booking rules (`minimumStayNights`/
 * `maximumStayNights`/`advanceBookingMinHours`/`advanceBookingMaxDays`)
 * are plain `listing_booking_rules` fields, written through the same
 * `updateListing` mutation every other step uses — no separate
 * availability endpoint exists for them.
 *
 * Doesn't hard-block Continue on "no bookable unit registered yet" —
 * `ReviewStep` is the one authoritative publish-readiness gate (the
 * real check is server-side); this step only offers the action.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Input, DatePicker } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import {
  useBlackoutsQuery,
  useCreateBlackoutMutation,
  useRemoveBlackoutMutation,
} from '../../../../availability/index.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import BookableUnitsManager from '../../BookableUnitsManager/BookableUnitsManager.jsx';
import WizardStepActions from '../WizardStepActions.jsx';

// Step L4 (brief §6, §12) — a plain integer string only: optional
// leading `-` (so a negative entry is parsed and rejected with a real
// domain message below, rather than the string simply failing to
// match), digits only. Rejects decimals ("1.5"), scientific notation
// ("1e3"), and garbage ("12abc") at the string level, before `Number()`
// ever runs — `Number("1.9")` would otherwise silently carry the
// fractional part through to the backend instead of being caught here,
// and `Number("12abc")` is `NaN`, which is a value, not an error, unless
// something explicitly checks for it.
const INTEGER_STRING_PATTERN = /^-?\d+$/;

// Step L4 (brief §6-7, §12, §15-16) — returns `{ value, malformed }`:
// `value` is `undefined` for an empty/optional field (never coerced to
// `0` via `Number('')`), a real integer otherwise; `malformed` is true
// for anything that isn't a plain optionally-negative integer string
// (decimals, scientific notation, non-numeric text) — including "-0",
// which `INTEGER_STRING_PATTERN` matches and `Number('-0')` normalizes
// to `0` like any other zero, so it's never a bypass for a
// positive-required field.
function parseBookingRuleField(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { value: undefined, malformed: false };
  if (!INTEGER_STRING_PATTERN.test(trimmed)) {
    return { value: undefined, malformed: true };
  }
  return { value: Number(trimmed), malformed: false };
}

const BOOKING_RULE_FIELDS = [
  { key: 'minimumStayNights', kind: 'positive' },
  { key: 'maximumStayNights', kind: 'positive' },
  { key: 'advanceBookingMinHours', kind: 'nonnegative' },
  { key: 'advanceBookingMaxDays', kind: 'nonnegative' },
];

export default function AvailabilityStep({
  listingId,
  categoryId = null,
  initialValues = {},
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const blackoutsQuery = useBlackoutsQuery(listingId);
  const createBlackoutMutation = useCreateBlackoutMutation();
  const removeBlackoutMutation = useRemoveBlackoutMutation();
  const updateListingMutation = useUpdateListingMutation();

  const [blackoutRange, setBlackoutRange] = useState({
    start: null,
    end: null,
  });
  const [rules, setRules] = useState({
    minimumStayNights: initialValues.minimumStayNights ?? '',
    maximumStayNights: initialValues.maximumStayNights ?? '',
    advanceBookingMinHours: initialValues.advanceBookingMinHours ?? '',
    advanceBookingMaxDays: initialValues.advanceBookingMaxDays ?? '',
  });
  // Step L4 (brief §22-23) — field-level errors shown immediately next
  // to the relevant Input, never deferred to a later step or to the
  // backend's own round-trip.
  const [ruleErrors, setRuleErrors] = useState({});

  const blackouts = blackoutsQuery.data ?? [];

  function setRule(field, value) {
    setRules((current) => ({ ...current, [field]: value }));
  }

  // Step L4 (brief §6-7, §12) — parses and validates every booking-rule
  // field client-side (whole-number-ness, positive-vs-nonnegative domain,
  // and the minimumStayNights <= maximumStayNights cross-field rule),
  // returning both the per-field error messages and the parsed values so
  // `handleContinue` never has to reparse.
  function validateBookingRules() {
    const errors = {};
    const parsed = {};

    BOOKING_RULE_FIELDS.forEach(({ key, kind }) => {
      const { value, malformed } = parseBookingRuleField(rules[key]);
      if (malformed) {
        errors[key] = t(`partner.listingWizard.availability.${key}Invalid`);
        return;
      }
      if (value === undefined) {
        parsed[key] = undefined;
        return;
      }
      if (kind === 'positive' && value < 1) {
        errors[key] = t(`partner.listingWizard.availability.${key}Invalid`);
        return;
      }
      if (kind === 'nonnegative' && value < 0) {
        errors[key] = t(`partner.listingWizard.availability.${key}Invalid`);
        return;
      }
      parsed[key] = value;
    });

    if (
      !errors.minimumStayNights &&
      !errors.maximumStayNights &&
      parsed.minimumStayNights !== undefined &&
      parsed.maximumStayNights !== undefined &&
      parsed.minimumStayNights > parsed.maximumStayNights
    ) {
      errors.minimumStayNights = t(
        'partner.listingWizard.availability.minExceedsMax',
      );
    }

    return { errors, parsed };
  }

  function handleAddBlackout() {
    if (!blackoutRange.start || !blackoutRange.end) return;
    createBlackoutMutation.mutate(
      { listingId, dateFrom: blackoutRange.start, dateTo: blackoutRange.end },
      { onSuccess: () => setBlackoutRange({ start: null, end: null }) },
    );
  }

  function handleRemoveBlackout(id) {
    removeBlackoutMutation.mutate({ id, listingId });
  }

  async function handleContinue() {
    const { errors, parsed } = validateBookingRules();
    setRuleErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const hasAnyRule = Object.values(parsed).some(
      (value) => value !== undefined,
    );
    if (hasAnyRule) {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: { bookingRules: parsed },
      });
    }
    onNext();
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.availability')}</h2>

      <section>
        <h3>{t('partner.listingWizard.availability.units')}</h3>
        <BookableUnitsManager listingId={listingId} categoryId={categoryId} />
      </section>

      <section>
        <h3>{t('partner.listingWizard.availability.blackoutDates')}</h3>
        {blackouts.length > 0 && (
          <ul>
            {blackouts.map((blackout) => (
              <li key={blackout.id}>
                {blackout.date_from} – {blackout.date_to}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveBlackout(blackout.id)}
                >
                  {t('partner.listingWizard.availability.removeBlackout')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DatePicker
          mode="range"
          label={t('partner.listingWizard.availability.addBlackoutRange')}
          value={blackoutRange}
          onChange={setBlackoutRange}
          locale={locale}
          placeholder={t('partner.listingWizard.datePicker.selectDate')}
          previousMonthLabel={t(
            'partner.listingWizard.datePicker.previousMonth',
          )}
          nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
        />
        <Button
          variant="secondary"
          loading={createBlackoutMutation.isPending}
          disabled={!blackoutRange.start || !blackoutRange.end}
          onClick={() => handleAddBlackout()}
        >
          {t('partner.listingWizard.availability.addBlackout')}
        </Button>
      </section>

      <section>
        <h3>{t('partner.listingWizard.availability.bookingRules')}</h3>
        {updateListingMutation.error && (
          <Alert variant="danger">{updateListingMutation.error.message}</Alert>
        )}
        <Stack gap="4">
          <Input
            type="number"
            min={1}
            step={1}
            label={t('partner.listingWizard.availability.minimumStayNights')}
            helperText={t(
              'partner.listingWizard.availability.minimumStayNightsHint',
            )}
            value={rules.minimumStayNights}
            error={ruleErrors.minimumStayNights}
            onChange={(event) => {
              setRule('minimumStayNights', event.target.value);
              setRuleErrors((current) => ({
                ...current,
                minimumStayNights: undefined,
              }));
            }}
          />
          <Input
            type="number"
            min={1}
            step={1}
            label={t('partner.listingWizard.availability.maximumStayNights')}
            helperText={t(
              'partner.listingWizard.availability.maximumStayNightsHint',
            )}
            value={rules.maximumStayNights}
            error={ruleErrors.maximumStayNights}
            onChange={(event) => {
              setRule('maximumStayNights', event.target.value);
              setRuleErrors((current) => ({
                ...current,
                maximumStayNights: undefined,
              }));
            }}
          />
          <Input
            type="number"
            min={0}
            step={1}
            label={t(
              'partner.listingWizard.availability.advanceBookingMinHours',
            )}
            helperText={t(
              'partner.listingWizard.availability.advanceBookingMinHoursHint',
            )}
            value={rules.advanceBookingMinHours}
            error={ruleErrors.advanceBookingMinHours}
            onChange={(event) => {
              setRule('advanceBookingMinHours', event.target.value);
              setRuleErrors((current) => ({
                ...current,
                advanceBookingMinHours: undefined,
              }));
            }}
          />
          <Input
            type="number"
            min={0}
            step={1}
            label={t(
              'partner.listingWizard.availability.advanceBookingMaxDays',
            )}
            helperText={t(
              'partner.listingWizard.availability.advanceBookingMaxDaysHint',
            )}
            value={rules.advanceBookingMaxDays}
            error={ruleErrors.advanceBookingMaxDays}
            onChange={(event) => {
              setRule('advanceBookingMaxDays', event.target.value);
              setRuleErrors((current) => ({
                ...current,
                advanceBookingMaxDays: undefined,
              }));
            }}
          />
        </Stack>
      </section>

      <WizardStepActions
        onBack={onBack}
        onContinue={() => handleContinue()}
        isSubmitting={updateListingMutation.isPending}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.continue')}
      />
    </div>
  );
}

AvailabilityStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  initialValues: PropTypes.shape({
    minimumStayNights: PropTypes.number,
    maximumStayNights: PropTypes.number,
    advanceBookingMinHours: PropTypes.number,
    advanceBookingMaxDays: PropTypes.number,
  }),
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
