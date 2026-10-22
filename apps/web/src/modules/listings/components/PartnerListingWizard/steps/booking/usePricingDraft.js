/**
 * usePricingDraft — the listing's own price (model, amount, currency), as
 * the Booking & pricing step edits it: field state, validation mirroring
 * the API, and the `pricing` write. It is the listing's default price —
 * a room, unit, departure or vehicle with its own base price uses that.
 *
 * `pricing_models` come from `GET /listings/metadata` (category-scoped,
 * `category_pricing_models`). Pricing is optional at the API layer: the
 * write is produced only once model, amount and currency are all filled,
 * never a partial or empty write.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Step L4 (brief §8, §17-18) — mirrors the backend's own
// `decimalMoneyAmountSchema` (apps/api/src/validation/
// decimalMoneyAmount.js): a plain, optionally-negative decimal string
// (permissive enough for every legitimate typing state — "", "-", "1.")
// that structurally cannot match scientific notation, and the real
// `DECIMAL(12,2)` column ceiling `listing_pricing.amount` is stored in.
const PRICE_STRING_PATTERN = /^-?\d*\.?\d*$/;
const PRICE_MAX = 9999999999.99;

export const PRICING_API_PATHS = {
  modelCode: 'pricing.modelCode',
  amount: 'pricing.amount',
  currencyCode: 'pricing.currencyCode',
};

/**
 * @param {object} options
 * @param {Array<{code: string}>} options.pricingModels - the category's models
 * @param {string|null} options.listingType
 * @param {{modelCode?: string, amount?: number, currencyCode?: string}} options.initialValues
 */
export function usePricingDraft({ pricingModels, listingType, initialValues }) {
  const { t } = useTranslation();
  const [modelCode, setModelCodeState] = useState(
    initialValues.modelCode ?? null,
  );
  const [amount, setAmountState] = useState(initialValues.amount ?? '');
  const [currencyCode, setCurrencyCode] = useState(
    initialValues.currencyCode ?? null,
  );
  // Step L4 (brief §8, §22-23) — the amount field's own client-side
  // validation error, shown immediately next to the field rather than
  // only surfacing after a backend round-trip.
  const [amountError, setAmountError] = useState(undefined);
  // Step L6.2H1 — shown when Continue is pressed while a legacy model is
  // still the stored one (the Partner hasn't picked a supported one yet).
  const [modelError, setModelError] = useState(undefined);

  // Step L6.2H1 — a stored model the category no longer offers (legacy
  // PER_HOUR). It's never silently swapped for a supported one: the select
  // starts empty and Continue is refused until the Partner knowingly picks
  // a model, because customers can't book the listing until then.
  // A category offering no models at all has nothing to switch to, so it
  // never blocks the step.
  const isLegacyModel =
    modelCode !== null &&
    pricingModels.length > 0 &&
    !pricingModels.some((model) => model.code === modelCode);

  // Step L4 (brief §8, §12-13, §17-18) — mirrors the backend's own
  // `decimalMoneyAmountSchema` exactly (nonnegative, DECIMAL(12,2)
  // ceiling, at-most-2-decimal-places). Zero-price semantics are
  // unchanged — see that schema's own header comment.
  function validateAmount(rawValue) {
    const trimmed = String(rawValue ?? '').trim();
    if (trimmed === '') return { value: undefined, error: undefined };
    if (!PRICE_STRING_PATTERN.test(trimmed)) {
      return {
        value: undefined,
        error: t('partner.listingWizard.pricing.amountInvalid'),
      };
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return {
        value: undefined,
        error: t('partner.listingWizard.pricing.amountInvalid'),
      };
    }
    if (numeric < 0) {
      return {
        value: undefined,
        error: t('partner.listingWizard.pricing.amountNegative'),
      };
    }
    if (numeric > PRICE_MAX) {
      return {
        value: undefined,
        error: t('partner.listingWizard.pricing.amountTooLarge'),
      };
    }
    if (Math.abs(Math.round(numeric * 100) - numeric * 100) >= 1e-6) {
      return {
        value: undefined,
        error: t('partner.listingWizard.pricing.amountPrecision'),
      };
    }
    return { value: numeric, error: undefined };
  }

  // Step L6.2H2B: a restaurant's price is average spend per person —
  // shown to customers, never charged (its reservations are free).
  const isRestaurant = listingType === 'RESTAURANT';
  function modelLabel(code) {
    return isRestaurant && code === 'PER_PERSON'
      ? t('pages.listingDetail.reservation.averageSpendPerPerson')
      : t(`partner.listingWizard.pricingModels.${code}`, code);
  }

  // Step L2 (brief §11) — "40" means nothing on its own, "40 per night"
  // does: once a model is chosen, the hint names its basis.
  let amountHelperText = t('partner.listingWizard.pricing.amountHint');
  if (isRestaurant) {
    amountHelperText = t(
      'partner.listingWizard.pricing.amountHintAverageSpend',
    );
  } else if (modelCode && !isLegacyModel) {
    amountHelperText = t('partner.listingWizard.pricing.amountHintWithBasis', {
      basis: t(
        `partner.listingWizard.pricingModels.${modelCode}`,
        modelCode,
      ).toLowerCase(),
    });
  }

  /**
   * Validates the draft and returns the `pricing` write it produces.
   * @returns {{ ok: boolean, payload?: {modelCode: string, amount: number, currencyCode: string} }}
   */
  function collect() {
    const { value: parsedAmount, error: amountValidationError } =
      validateAmount(amount);
    setAmountError(amountValidationError);
    if (amountValidationError) return { ok: false };
    if (isLegacyModel) {
      setModelError(t('partner.listingWizard.pricing.legacyModelRequired'));
      return { ok: false };
    }
    const isComplete =
      pricingModels.length > 0 &&
      Boolean(modelCode) &&
      parsedAmount !== undefined &&
      Boolean(currencyCode);
    return {
      ok: true,
      payload: isComplete
        ? { modelCode, amount: parsedAmount, currencyCode }
        : undefined,
    };
  }

  return {
    pricingModels,
    isLegacyModel,
    modelCode,
    amount,
    currencyCode,
    amountError,
    modelError,
    modelLabel,
    amountHelperText,
    setModelCode(next) {
      setModelCodeState(next);
      setModelError(undefined);
    },
    setAmount(next) {
      setAmountState(next);
      setAmountError(undefined);
    },
    setCurrencyCode,
    collect,
  };
}

export default usePricingDraft;
