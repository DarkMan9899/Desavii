/**
 * DynamicAttributesStep — step 4. Renders every `GET /listings/
 * metadata`-declared attribute for the wizard's chosen category through
 * `MetadataFieldRenderer` — nothing here names a category or an
 * attribute code; the entire step is empty if a category has none.
 *
 * Local `values` state (not React Hook Form, unlike the fixed-shape
 * steps) since the set of fields is itself dynamic per category —
 * validated on submit against each definition's own `is_required` rather
 * than a static RHF rules object.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { toAttributeValuesPayload } from '../../../utils/attributeValueMapping.js';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import useApiFieldErrors from '../../../../../hooks/useApiFieldErrors.js';
import MetadataFieldRenderer from '../MetadataFieldRenderer.jsx';
import WizardStepActions from '../WizardStepActions.jsx';

export default function DynamicAttributesStep({
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
  // Server errors arrive per code at `attributeValues.<code>` — the same path
  // the publish-readiness check uses for a missing required value.
  const { fieldError, clearFieldError } = useApiFieldErrors(
    updateListingMutation.error,
  );

  if (isPending) {
    return <Spinner label={t('partner.listingWizard.attributes.loading')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.attributes.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={refetch}
      />
    );
  }

  const { attributes } = metadata;

  function setFieldValue(code, value) {
    setValues((current) => ({ ...current, [code]: value }));
    clearFieldError(`attributeValues.${code}`);
  }

  async function handleContinue() {
    const nextErrors = {};
    attributes.forEach((attribute) => {
      const value = values[attribute.code];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (attribute.is_required && isEmpty) {
        nextErrors[attribute.code] = t(
          'partner.listingWizard.validation.required',
        );
      }
    });
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: {
          attributeValues: toAttributeValuesPayload(attributes, values),
        },
      });
    } catch {
      // Rendered from the mutation's own `error` (ApiErrorAlert + fields).
      return;
    }
    onNext();
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.attributes')}</h2>
      {attributes.length === 0 && (
        <p>{t('partner.listingWizard.attributes.empty')}</p>
      )}
      <ApiErrorAlert
        error={updateListingMutation.error}
        inlinePaths={attributes.map(
          (attribute) => `attributeValues.${attribute.code}`,
        )}
      />
      <Stack gap="4">
        {attributes.map((attribute) => (
          <MetadataFieldRenderer
            key={attribute.code}
            namespace="attributes"
            definition={attribute}
            value={values[attribute.code]}
            onChange={(value) => setFieldValue(attribute.code, value)}
            error={
              validationErrors[attribute.code] ??
              fieldError(`attributeValues.${attribute.code}`)
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

DynamicAttributesStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  // eslint-disable-next-line react/forbid-prop-types -- keyed by dynamic attribute code, shape varies by data_type
  initialValues: PropTypes.object,
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
