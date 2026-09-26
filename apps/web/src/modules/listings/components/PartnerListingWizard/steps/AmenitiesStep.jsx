/**
 * AmenitiesStep — step 5. Amenity groups/options come from the same
 * `GET /listings/metadata` call `DynamicAttributesStep` uses (`amenity_
 * groups: [{ code, amenities: [{ value, code }] }]`). An amenity's own
 * `code` here is literally its (now locale-resolved) `listing_amenities`
 * name (e.g. "WiFi"/"Վայ-ֆայ") — unlike attribute/policy codes, there's
 * no stable machine code to translate by, so the backend resolves it via
 * `listing_amenity_translations` from the `locale` this hook forwards
 * (mirrors `useListingCategoriesQuery`'s locale-threading); only group
 * codes go through `t()` here.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Input, Checkbox } from '@desavii/ui/components/form-controls';
import { Stack } from '@desavii/ui/components/layout';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import WizardStepActions from '../WizardStepActions.jsx';
import styles from './AmenitiesStep.module.scss';

export default function AmenitiesStep({
  listingId,
  categoryId = null,
  initialValues = [],
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

  const [selectedIds, setSelectedIds] = useState(() => new Set(initialValues));
  const [query, setQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  if (isPending) {
    return <Spinner label={t('partner.listingWizard.amenities.loading')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.amenities.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={refetch}
      />
    );
  }

  const { amenity_groups: amenityGroups } = metadata;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = amenityGroups
    .map((group) => ({
      ...group,
      amenities: group.amenities.filter((amenity) =>
        amenity.code.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.amenities.length > 0);

  function toggleAmenity(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupCollapsed(code) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleContinue() {
    try {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: { amenityIds: Array.from(selectedIds) },
      });
    } catch {
      // Rendered from the mutation's own `error` (ApiErrorAlert).
      return;
    }
    onNext();
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.amenities')}</h2>
      {amenityGroups.length === 0 && (
        <p>{t('partner.listingWizard.amenities.empty')}</p>
      )}
      <ApiErrorAlert
        error={updateListingMutation.error}
        fieldLabels={{
          amenityIds: t('partner.listingWizard.steps.amenities'),
        }}
      />
      {amenityGroups.length > 0 && (
        <>
          <Input
            label={t('partner.listingWizard.amenities.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Stack gap="6" className={styles.groups}>
            {visibleGroups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.code);
              return (
                <div key={group.code} className={styles.group}>
                  <button
                    type="button"
                    className={styles.groupHeader}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleGroupCollapsed(group.code)}
                  >
                    {t(
                      `partner.listingWizard.amenityGroups.${group.code}`,
                      group.code,
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className={styles.groupBody}>
                      {group.amenities.map((amenity) => (
                        <Checkbox
                          key={amenity.value}
                          label={amenity.code}
                          checked={selectedIds.has(amenity.value)}
                          onChange={() => toggleAmenity(amenity.value)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Stack>
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

AmenitiesStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  initialValues: PropTypes.arrayOf(PropTypes.number),
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
