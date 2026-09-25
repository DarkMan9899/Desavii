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
import {
  Spinner,
  ErrorState,
  Alert,
} from '@desavii/ui/components/feedback-overlays';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { CURRENCY_CODES } from '../../../constants/currencies.js';
import WizardStepActions from '../WizardStepActions.jsx';

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
  const isComplete =
    Boolean(modelCode) && amount !== '' && Boolean(currencyCode);

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
    if (isComplete) {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: {
          pricing: { modelCode, amount: Number(amount), currencyCode },
        },
      });
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
      {updateListingMutation.error && (
        <Alert variant="danger">{updateListingMutation.error.message}</Alert>
      )}
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
            onChange={setModelCode}
          />
          <Input
            type="number"
            label={t('partner.listingWizard.pricing.amount')}
            helperText={amountHelperText}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <Select
            label={t('partner.listingWizard.pricing.currency')}
            placeholder={t('partner.listingWizard.selectPlaceholder')}
            options={CURRENCY_CODES.map((code) => ({
              value: code,
              label: code,
            }))}
            value={currencyCode}
            onChange={setCurrencyCode}
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
