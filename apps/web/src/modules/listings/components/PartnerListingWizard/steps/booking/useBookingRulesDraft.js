/**
 * useBookingRulesDraft — the listing's booking rules (minimum/maximum stay
 * or rental, minimum/maximum advance booking), as the Booking & pricing
 * step edits them: field state, validation mirroring the API, and the
 * `bookingRules` write (`listing_booking_rules`, no separate endpoint).
 *
 * Step L6.2B: the wording follows the listing's unit model
 * (`unitProfile`). Minimum/maximum stay renders as nights for lodging, as
 * rental days for a Car Rental (the same stored fields), and not at all
 * elsewhere — a hidden stay value is never cleared: it stays in state and
 * is re-sent unchanged, so switching nothing here never loses data.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Step L4 (brief §6, §12) — a plain integer string only: optional
// leading `-` (so a negative entry is parsed and rejected with a real
// domain message below, rather than the string simply failing to
// match), digits only. Rejects decimals ("1.5"), scientific notation
// ("1e3"), and garbage ("12abc") at the string level, before `Number()`
// ever runs.
const INTEGER_STRING_PATTERN = /^-?\d+$/;

// Step L4 (brief §6-7, §12, §15-16) — returns `{ value, malformed }`:
// `value` is `undefined` for an empty/optional field (never coerced to
// `0` via `Number('')`), a real integer otherwise; `malformed` is true
// for anything that isn't a plain optionally-negative integer string.
function parseBookingRuleField(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { value: undefined, malformed: false };
  if (!INTEGER_STRING_PATTERN.test(trimmed)) {
    return { value: undefined, malformed: true };
  }
  return { value: Number(trimmed), malformed: false };
}

const BOOKING_RULE_FIELDS = [
  { key: 'minimumStayNights', kind: 'positive', stay: true },
  { key: 'maximumStayNights', kind: 'positive', stay: true },
  { key: 'advanceBookingMinHours', kind: 'nonnegative', stay: false },
  { key: 'advanceBookingMaxDays', kind: 'nonnegative', stay: false },
];

// `partner.listingWizard.availability.*` label keys per stay wording; each
// label key also has its `…Hint` and `…Invalid` siblings.
const STAY_RULE_LABEL_KEYS = {
  nights: {
    minimumStayNights: 'minimumStayNights',
    maximumStayNights: 'maximumStayNights',
    minExceedsMax: 'minExceedsMax',
  },
  days: {
    minimumStayNights: 'minimumRentalDays',
    maximumStayNights: 'maximumRentalDays',
    minExceedsMax: 'minRentalExceedsMax',
  },
};

/**
 * @param {object} options
 * @param {object} options.unitProfile - `resolveBookableUnitProfile` result
 * @param {object} options.initialValues - the stored rules
 */
export function useBookingRulesDraft({ unitProfile, initialValues }) {
  const { t } = useTranslation();
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

  const stayLabelKeys = STAY_RULE_LABEL_KEYS[unitProfile.stayRules] ?? null;
  const labelKeyFor = (key) => stayLabelKeys?.[key] ?? key;
  const visibleRuleFields = BOOKING_RULE_FIELDS.filter(
    ({ stay }) => !stay || stayLabelKeys,
  );

  // Step L4 (brief §6-7, §12) — parses and validates every VISIBLE
  // booking-rule field client-side (whole-number-ness,
  // positive-vs-nonnegative domain, and the min <= max stay cross-field
  // rule). A hidden stay field can't be edited here, so it's carried
  // through as stored.
  function validate() {
    const errors = {};
    const parsed = {};

    BOOKING_RULE_FIELDS.forEach(({ key, kind, stay }) => {
      const { value, malformed } = parseBookingRuleField(rules[key]);
      if (stay && !stayLabelKeys) {
        parsed[key] = value;
        return;
      }
      const invalidMessage = t(
        `partner.listingWizard.availability.${labelKeyFor(key)}Invalid`,
      );
      if (malformed) {
        errors[key] = invalidMessage;
        return;
      }
      if (value === undefined) {
        // Step L6.2E: blanking a rule that was stored clears it (explicit
        // `null`); a field that was never set stays omitted. Never 0.
        parsed[key] = initialValues[key] != null ? null : undefined;
        return;
      }
      if (
        (kind === 'positive' && value < 1) ||
        (kind === 'nonnegative' && value < 0)
      ) {
        errors[key] = invalidMessage;
        return;
      }
      parsed[key] = value;
    });

    if (
      stayLabelKeys &&
      !errors.minimumStayNights &&
      !errors.maximumStayNights &&
      parsed.minimumStayNights !== undefined &&
      parsed.maximumStayNights !== undefined &&
      parsed.minimumStayNights > parsed.maximumStayNights
    ) {
      errors.minimumStayNights = t(
        `partner.listingWizard.availability.${stayLabelKeys.minExceedsMax}`,
      );
    }

    return { errors, parsed };
  }

  /**
   * Validates the draft and returns the `bookingRules` write it produces
   * (none when no rule is set or cleared).
   * @returns {{ ok: boolean, payload?: object }}
   */
  function collect() {
    const { errors, parsed } = validate();
    setRuleErrors(errors);
    if (Object.keys(errors).length > 0) return { ok: false };
    const hasAnyRule = Object.values(parsed).some(
      (value) => value !== undefined,
    );
    return { ok: true, payload: hasAnyRule ? parsed : undefined };
  }

  function hintFor(key) {
    if (key === 'advanceBookingMinHours') {
      return t(
        `partner.listingWizard.availability.advanceBookingMinHoursHints.${unitProfile.advanceContext}`,
      );
    }
    return t(`partner.listingWizard.availability.${labelKeyFor(key)}Hint`);
  }

  return {
    rules,
    ruleErrors,
    visibleRuleFields,
    labelKeyFor,
    hintFor,
    setRule(key, value) {
      setRules((current) => ({ ...current, [key]: value }));
      setRuleErrors((current) => ({ ...current, [key]: undefined }));
    },
    collect,
  };
}

export default useBookingRulesDraft;
