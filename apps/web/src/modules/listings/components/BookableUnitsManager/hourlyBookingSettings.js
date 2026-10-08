/**
 * Step L6.3B — the Partner's optional hourly configuration of a hotel room:
 * form state, client validation (mirroring the server's effective-config
 * rules in `hourlyStay.js#validateHourlyConfig`) and the request payload.
 *
 * - Off (the default): nothing hourly is sent when registering; switching
 *   an enabled room off sends only `hourlyEnabled: false`, which keeps the
 *   stored settings so the Partner can switch hourly sales back on.
 * - On: every setting is required — a rate (>= 0, at most 2 decimals) and
 *   currency, a whole-hour duration range (max >= min) and a same-day window
 *   (until after from, long enough for the minimum stay).
 */

import { parseWholeHour, HOURS_PER_DAY } from '../../utils/hourlyStay.js';

const HOURLY_PRICE_MAX = 9999999999.99; // bookable_units.hourly_price_amount DECIMAL(12,2)
const DECIMAL_STRING_PATTERN = /^\d*\.?\d*$/;

const MESSAGE_PREFIX = 'partner.listingWizard.availability';

export const HOURLY_DURATION_OPTIONS = Array.from(
  { length: HOURS_PER_DAY },
  (_, index) => index + 1,
);

export function initialHourlySettings(initialValues = {}) {
  const asText = (value) =>
    value === null || value === undefined ? '' : String(value);
  return {
    enabled: Boolean(initialValues.hourlyEnabled),
    priceAmount:
      initialValues.hourlyPriceAmount === null ||
      initialValues.hourlyPriceAmount === undefined
        ? ''
        : String(Number(initialValues.hourlyPriceAmount)),
    currency: initialValues.hourlyPriceCurrency ?? null,
    minHours: asText(initialValues.hourlyMinDurationHours),
    maxHours: asText(initialValues.hourlyMaxDurationHours),
    availableFrom: initialValues.hourlyAvailableFrom ?? '',
    availableUntil: initialValues.hourlyAvailableUntil ?? '',
  };
}

function validatePrice(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { error: 'hourlyRequired' };
  const numeric = DECIMAL_STRING_PATTERN.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { error: 'hourlyPriceInvalid' };
  }
  if (numeric > HOURLY_PRICE_MAX) return { error: 'hourlyPriceTooLarge' };
  if (Math.abs(Math.round(numeric * 100) - numeric * 100) >= 1e-6) {
    return { error: 'hourlyPricePrecision' };
  }
  return { value: numeric };
}

/**
 * @returns {{errors: Object<string, string>, payload: object}} `errors` maps
 *   a field to its translation key; `payload` is what the request carries.
 */
export function validateHourlySettings(settings, { wasEnabled }) {
  if (!settings.enabled) {
    return {
      errors: {},
      payload: wasEnabled ? { hourlyEnabled: false } : {},
    };
  }
  const errors = {};
  const price = validatePrice(settings.priceAmount);
  if (price.error) errors.hourlyPriceAmount = price.error;
  if (!settings.currency) errors.hourlyPriceCurrency = 'hourlyRequired';

  const minHours = settings.minHours === '' ? null : Number(settings.minHours);
  const maxHours = settings.maxHours === '' ? null : Number(settings.maxHours);
  if (minHours === null) errors.hourlyMinDurationHours = 'hourlyRequired';
  if (maxHours === null) errors.hourlyMaxDurationHours = 'hourlyRequired';
  else if (minHours !== null && maxHours < minHours) {
    errors.hourlyMaxDurationHours = 'hourlyDurationRangeInvalid';
  }

  const fromHour = parseWholeHour(settings.availableFrom);
  const untilHour = parseWholeHour(settings.availableUntil);
  if (fromHour === null) errors.hourlyAvailableFrom = 'hourlyRequired';
  if (untilHour === null) errors.hourlyAvailableUntil = 'hourlyRequired';
  else if (
    fromHour !== null &&
    (untilHour <= fromHour ||
      (minHours !== null && untilHour - fromHour < minHours))
  ) {
    errors.hourlyAvailableUntil = 'hourlyWindowInvalid';
  }

  const translated = Object.fromEntries(
    Object.entries(errors).map(([field, key]) => [
      field,
      `${MESSAGE_PREFIX}.${key}`,
    ]),
  );
  return {
    errors: translated,
    payload:
      Object.keys(errors).length > 0
        ? {}
        : {
            hourlyEnabled: true,
            hourlyPriceAmount: price.value,
            hourlyPriceCurrency: settings.currency,
            hourlyMinDurationHours: minHours,
            hourlyMaxDurationHours: maxHours,
            hourlyAvailableFrom: settings.availableFrom,
            hourlyAvailableUntil: settings.availableUntil,
          },
  };
}

export default {
  HOURLY_DURATION_OPTIONS,
  initialHourlySettings,
  validateHourlySettings,
};
