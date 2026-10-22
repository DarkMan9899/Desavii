/**
 * PricingFields — the listing's default price inside the Booking & pricing
 * step (state and rules: `usePricingDraft`). A category offering no
 * pricing model shows its empty-state line instead.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { CURRENCY_CODES } from '../../../../constants/currencies.js';
import { PRICING_API_PATHS } from './usePricingDraft.js';
import styles from './BookingSections.module.scss';

export default function PricingFields({ draft, fieldError, clearFieldError }) {
  const { t } = useTranslation();

  if (draft.pricingModels.length === 0) {
    return <p>{t('partner.listingWizard.pricing.empty')}</p>;
  }

  return (
    <>
      {draft.isLegacyModel && (
        <Alert
          variant="warning"
          title={t('partner.listingWizard.pricing.legacyModelTitle', {
            model: t(
              `partner.listingWizard.pricingModels.${draft.modelCode}`,
              draft.modelCode,
            ),
          })}
        >
          {t('partner.listingWizard.pricing.legacyModelBody')}
        </Alert>
      )}
      <div className={styles.priceRow}>
        <Select
          label={t('partner.listingWizard.pricing.model')}
          placeholder={t('partner.listingWizard.selectPlaceholder')}
          options={draft.pricingModels.map((model) => ({
            value: model.code,
            label: draft.modelLabel(model.code),
          }))}
          value={draft.isLegacyModel ? null : draft.modelCode}
          error={draft.modelError ?? fieldError(PRICING_API_PATHS.modelCode)}
          onChange={(next) => {
            draft.setModelCode(next);
            clearFieldError(PRICING_API_PATHS.modelCode);
          }}
        />
        <Input
          type="number"
          min={0}
          step={0.01}
          label={t('partner.listingWizard.pricing.amount')}
          helperText={draft.amountHelperText}
          value={draft.amount}
          error={draft.amountError ?? fieldError(PRICING_API_PATHS.amount)}
          onChange={(event) => {
            draft.setAmount(event.target.value);
            clearFieldError(PRICING_API_PATHS.amount);
          }}
        />
        <Select
          label={t('partner.listingWizard.pricing.currency')}
          placeholder={t('partner.listingWizard.selectPlaceholder')}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
          value={draft.currencyCode}
          error={fieldError(PRICING_API_PATHS.currencyCode)}
          onChange={(next) => {
            draft.setCurrencyCode(next);
            clearFieldError(PRICING_API_PATHS.currencyCode);
          }}
        />
      </div>
    </>
  );
}

PricingFields.propTypes = {
  // `usePricingDraft()`'s return value.
  // eslint-disable-next-line react/forbid-prop-types
  draft: PropTypes.object.isRequired,
  fieldError: PropTypes.func.isRequired,
  clearFieldError: PropTypes.func.isRequired,
};
