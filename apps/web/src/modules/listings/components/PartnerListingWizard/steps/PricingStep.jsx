/**
 * PricingStep — step 7. `pricing_models` comes from the same `GET
 * /listings/metadata` call (`{ code }[]`, category-scoped —
 * `category_pricing_models`) — a category with none (e.g. restaurants/
 * attractions per `seeds/007_pricing_and_policies.js`) simply has
 * nothing to configure here. Pricing is optional at the API layer
 * (`updateListingSchema`'s `pricing` field, and `#checkPublishReadiness`
 * never checks for it) — this step only PATCHes `pricing` when a
 * partner has actually filled in all three of model/amount/currency,
 * never a partial or empty write.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Input, Select } from '@desavii/ui/components/form-controls';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import useApiFieldErrors from '../../../../../hooks/useApiFieldErrors.js';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { CURRENCY_CODES } from '../../../constants/currencies.js';
import WizardStepActions from '../WizardStepActions.jsx';

// Step L4 (brief §8, §17-18) — mirrors the backend's own
// `decimalMoneyAmountSchema` (apps/api/src/validation/
// decimalMoneyAmount.js): a plain, optionally-negative decimal string
// (permissive enough for every legitimate typing state — "", "-", "1.")
// that structurally cannot match scientific notation, and the real
// `DECIMAL(12,2)` column ceiling `listing_pricing.amount` is stored in.
const PRICE_STRING_PATTERN = /^-?\d*\.?\d*$/;
const PRICE_MAX = 9999999999.99;

const PRICING_API_PATHS = {
  modelCode: 'pricing.modelCode',
  amount: 'pricing.amount',
  currencyCode: 'pricing.currencyCode',
};

export default function PricingStep({
  listingId,
  categoryId = null,
  initialValues = {},
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const {
    data: metadata,
    isPending,
    isError,
    refetch,
  } = useListingMetadataQuery(categoryId, locale);
  const updateListingMutation = useUpdateListingMutation();

  const [modelCode, setModelCode] = useState(initialValues.modelCode ?? null);
  const [amount, setAmount] = useState(initialValues.amount ?? '');
  const [currencyCode, setCurrencyCode] = useState(
    initialValues.currencyCode ?? null,
  );
  // Step L4 (brief §8, §22-23) — the amount field's own client-side
  // validation error, shown immediately next to the field rather than
  // only surfacing after a backend round-trip.
  const [amountError, setAmountError] = useState(undefined);
  const { fieldError, clearFieldError } = useApiFieldErrors(
    updateListingMutation.error,
  );

  if (isPending) {
    return <Spinner label={t('partner.listingWizard.pricing.loading')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.pricing.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={refetch}
      />
    );
  }

  const { pricing_models: pricingModels } = metadata;

  // Step L4 (brief §8, §12-13, §17-18) — mirrors the backend's own
  // `decimalMoneyAmountSchema` exactly (nonnegative, DECIMAL(12,2)
  // ceiling, at-most-2-decimal-places), so a Partner sees the same
  // rejection client-side that the backend would otherwise only report
  // after a round-trip. Zero-price semantics are unchanged — see that
  // schema's own header comment on why zero stays allowed here.
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

  // Step L2 (brief §11) — the amount field's meaning depends entirely on
  // the pricing model picked just above it ("40" means nothing on its
  // own — "40 per night" does); once a model is chosen, reuse its own
  // already-translated label to say so directly, rather than a second,
  // separately-maintained copy of the same four basis strings.
  const amountHelperText = modelCode
    ? t('partner.listingWizard.pricing.amountHintWithBasis', {
        basis: t(
          `partner.listingWizard.pricingModels.${modelCode}`,
          modelCode,
        ).toLowerCase(),
      })
    : t('partner.listingWizard.pricing.amountHint');

  async function handleContinue() {
    const { value: parsedAmount, error: amountValidationError } =
      validateAmount(amount);
    setAmountError(amountValidationError);
    if (amountValidationError) return;

    if (
      Boolean(modelCode) &&
      parsedAmount !== undefined &&
      Boolean(currencyCode)
    ) {
      try {
        await updateListingMutation.mutateAsync({
          id: listingId,
          payload: {
            pricing: { modelCode, amount: parsedAmount, currencyCode },
          },
        });
      } catch {
        // Rendered from the mutation's own `error` (ApiErrorAlert + fields).
        return;
      }
    }
    onNext();
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.pricing')}</h2>
      {pricingModels.length > 0 && (
        <p>{t('partner.listingWizard.pricing.stepIntro')}</p>
      )}
      {pricingModels.length === 0 && (
        <p>{t('partner.listingWizard.pricing.empty')}</p>
      )}
      <ApiErrorAlert
        error={updateListingMutation.error}
        inlinePaths={
          pricingModels.length > 0 ? Object.values(PRICING_API_PATHS) : []
        }
      />
      {pricingModels.length > 0 && (
        <>
          <Select
            label={t('partner.listingWizard.pricing.model')}
            placeholder={t('partner.listingWizard.selectPlaceholder')}
            options={pricingModels.map((model) => ({
              value: model.code,
              label: t(
                `partner.listingWizard.pricingModels.${model.code}`,
                model.code,
              ),
            }))}
            value={modelCode}
            error={fieldError(PRICING_API_PATHS.modelCode)}
            onChange={(nextModelCode) => {
              setModelCode(nextModelCode);
              clearFieldError(PRICING_API_PATHS.modelCode);
            }}
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            label={t('partner.listingWizard.pricing.amount')}
            helperText={amountHelperText}
            value={amount}
            error={amountError ?? fieldError(PRICING_API_PATHS.amount)}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountError(undefined);
              clearFieldError(PRICING_API_PATHS.amount);
            }}
          />
          <Select
            label={t('partner.listingWizard.pricing.currency')}
            placeholder={t('partner.listingWizard.selectPlaceholder')}
            options={CURRENCY_CODES.map((code) => ({
              value: code,
              label: code,
            }))}
            value={currencyCode}
            error={fieldError(PRICING_API_PATHS.currencyCode)}
            onChange={(nextCurrencyCode) => {
              setCurrencyCode(nextCurrencyCode);
              clearFieldError(PRICING_API_PATHS.currencyCode);
            }}
          />
        </>
      )}
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

PricingStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  initialValues: PropTypes.shape({
    modelCode: PropTypes.string,
    amount: PropTypes.number,
    currencyCode: PropTypes.string,
  }),
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
