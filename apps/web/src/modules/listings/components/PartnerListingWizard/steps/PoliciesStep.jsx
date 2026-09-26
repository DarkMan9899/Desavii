/**
 * PoliciesStep — step 9. Renders every `GET /listings/metadata`-declared
 * policy for the wizard's category through `MetadataFieldRenderer` —
 * mirrors `DynamicAttributesStep.jsx`'s shape exactly, but converts
 * through `policyValueMapping.js` (policies use a plain string wire
 * value, never attributes' `optionCodes` array — see that file's header).
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { toPolicyValuesPayload } from '../../../utils/policyValueMapping.js';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import useApiFieldErrors from '../../../../../hooks/useApiFieldErrors.js';
import MetadataFieldRenderer from '../MetadataFieldRenderer.jsx';
import WizardStepActions from '../WizardStepActions.jsx';

export default function PoliciesStep({
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

  const [values, setValues] = useState(initialValues);
  const [validationErrors, setValidationErrors] = useState({});
  // Server errors arrive per code at `policyValues.<code>` — the same path
  // the publish-readiness check uses for a missing required value.
  const { fieldError, clearFieldError } = useApiFieldErrors(
    updateListingMutation.error,
  );

  if (isPending) {
    return <Spinner label={t('partner.listingWizard.policies.loading')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.policies.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={refetch}
      />
    );
  }

  const { policies } = metadata;

  function setFieldValue(code, value) {
    setValues((current) => ({ ...current, [code]: value }));
    clearFieldError(`policyValues.${code}`);
  }

  async function handleContinue() {
    const nextErrors = {};
    policies.forEach((policy) => {
      const value = values[policy.code];
      const isEmpty = value === undefined || value === null || value === '';
      if (policy.is_required && isEmpty) {
        nextErrors[policy.code] = t(
          'partner.listingWizard.validation.required',
        );
      }
    });
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: { policyValues: toPolicyValuesPayload(policies, values) },
      });
    } catch {
      // Rendered from the mutation's own `error` (ApiErrorAlert + fields).
      return;
    }
    onNext();
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.policies')}</h2>
      {policies.length === 0 && (
        <p>{t('partner.listingWizard.policies.empty')}</p>
      )}
      <ApiErrorAlert
        error={updateListingMutation.error}
        inlinePaths={policies.map((policy) => `policyValues.${policy.code}`)}
      />
      <Stack gap="4">
        {policies.map((policy) => (
          <MetadataFieldRenderer
            key={policy.code}
            namespace="policies"
            definition={policy}
            value={values[policy.code]}
            onChange={(value) => setFieldValue(policy.code, value)}
            error={
              validationErrors[policy.code] ??
              fieldError(`policyValues.${policy.code}`)
            }
          />
        ))}
      </Stack>
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

PoliciesStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  // eslint-disable-next-line react/forbid-prop-types -- keyed by dynamic policy code, shape varies by data_type
  initialValues: PropTypes.object,
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
