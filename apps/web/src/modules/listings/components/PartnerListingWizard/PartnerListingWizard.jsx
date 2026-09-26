/**
 * PartnerListingWizard — the step orchestrator. Owns navigation/identity
 * via `useListingWizardState` (URL-per-step, per that hook's own file
 * header) and the current listing's server data via `useListingQuery`
 * (only enabled once `wizard.listingId` exists — i.e. from
 * `BasicInfoStep` onward). Also reads `GET /listings/metadata` itself
 * (the same React-Query cache entry every dynamic step already reads —
 * calling the same key twice is a cache hit, not a second request) so it
 * can convert the listing's raw `attribute_values`/`policy_values` wire
 * arrays into the domain-value objects `DynamicAttributesStep`/
 * `PoliciesStep` expect as `initialValues`, without either step needing
 * to know how to seed itself from a resumed draft.
 *
 * A direct URL edit that jumps past Basic Information without a
 * `listingId` (no legitimate UI path produces this, but URLs are
 * user-editable) is redirected back to `basicInfo` — every step from
 * Location onward assumes a real listing id. Step L1: a direct URL edit
 * that reaches `basicInfo` itself with no category chosen at all (and no
 * `listingId` yet) is likewise redirected back to `category` — Basic
 * Information's own creation submit no longer asks for `listingType`
 * (§8), so it has no fallback if the category was skipped entirely.
 */

import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { WizardProgress } from '@desavii/ui/components/navigation';
import { Container } from '@desavii/ui/components/layout';
import PageLoader from '../../../../components/PageLoader/PageLoader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useListingWizardState } from './useListingWizardState.js';
import { useListingQuery } from '../../queries/useListingQuery.js';
import { useListingMetadataQuery } from '../../queries/useListingMetadataQuery.js';
import { fromAttributeValuesResponse } from '../../utils/attributeValueMapping.js';
import { fromPolicyValuesResponse } from '../../utils/policyValueMapping.js';
import { LISTING_CREATION_STEP_ID } from './wizardSteps.js';
import CategoryStep from './steps/CategoryStep.jsx';
import BasicInfoStep from './steps/BasicInfoStep.jsx';
import LocationStep from './steps/LocationStep.jsx';
import DynamicAttributesStep from './steps/DynamicAttributesStep.jsx';
import AmenitiesStep from './steps/AmenitiesStep.jsx';
import MediaStep from './steps/MediaStep.jsx';
import PricingStep from './steps/PricingStep.jsx';
import AvailabilityStep from './steps/AvailabilityStep.jsx';
import PoliciesStep from './steps/PoliciesStep.jsx';
import ContentStep from './steps/ContentStep.jsx';
import ReviewStep from './steps/ReviewStep.jsx';
import styles from './PartnerListingWizard.module.scss';

export default function PartnerListingWizard({ partnerships }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useParams();
  const { showToast } = useToast();
  const wizard = useListingWizardState();
  const listingQuery = useListingQuery(wizard.listingId);
  const listing = listingQuery.data;
  const categoryId = listing?.category_ids?.[0] ?? wizard.categoryId;
  const metadataQuery = useListingMetadataQuery(categoryId, locale);

  const requiresListing = wizard.currentStepIndex > 1;
  // Step L1: Basic Information is where the listing (and therefore its
  // fixed category) is actually created — reaching it with no category
  // chosen at all (a direct/manually-edited `?step=basicInfo` URL,
  // skipping Category entirely) would otherwise let `createListing` fall
  // through to requiring an explicit `listingType`, exactly the
  // redundant question this step closed. Only applies pre-creation —
  // once `listingId` exists the category is already fixed server-side.
  const requiresCategory =
    wizard.currentStepId === LISTING_CREATION_STEP_ID &&
    !wizard.listingId &&
    !wizard.categoryId;
  useEffect(() => {
    if (requiresListing && !wizard.listingId) {
      wizard.goToStep(LISTING_CREATION_STEP_ID, { replace: true });
      return;
    }
    if (requiresCategory) {
      wizard.goToStep('category', { replace: true });
    }
    // Only re-check when the step or listing/category id actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiresListing, requiresCategory, wizard.listingId, wizard.categoryId]);

  if (requiresListing && !wizard.listingId) {
    return null;
  }
  if (requiresCategory) {
    return null;
  }

  if (wizard.listingId && listingQuery.isPending) {
    return <PageLoader />;
  }

  function handlePublished() {
    showToast(t('partner.listingWizard.publishSuccess'), {
      variant: 'success',
    });
    navigate(`/${locale}/partner`);
  }

  const stepLabels = wizard.steps.map((step) => ({
    id: step.id,
    label: t(step.labelKey),
  }));
  const currentStepLabel = t(
    wizard.steps[wizard.currentStepIndex]?.labelKey ?? '',
  );

  return (
    <Container size="content" className={styles.wizard}>
      <WizardProgress
        steps={stepLabels}
        currentStepId={wizard.currentStepId}
        completedStepIds={wizard.completedStepIds}
        onStepClick={wizard.goToStep}
        ariaLabel={t('partner.listingWizard.progressLabel')}
        summaryText={t('partner.listingWizard.progressSummary', {
          current: wizard.currentStepIndex + 1,
          total: wizard.steps.length,
          label: currentStepLabel,
        })}
        stepAriaLabel={(step) =>
          t('partner.listingWizard.goToStep', { label: step.label })
        }
      />

      {
        // Step L2 (brief §5) — a single, persistent legend explaining the
        // asterisk convention every required field already uses
        // (`Label.jsx`), instead of repeating "(required)" beside each
        // one. Omitted on Category, which has no labeled form fields at
        // all (a card picker, not text/select inputs).
        wizard.currentStepId !== 'category' && (
          <p className={styles.requiredLegend}>
            {t('partner.listingWizard.requiredLegend')}
          </p>
        )
      }

      <div className={styles.stepBody}>
        {wizard.currentStepId === 'category' && (
          <CategoryStep
            value={categoryId}
            onChange={wizard.setCategoryId}
            onNext={wizard.goToNextStep}
            // Step L1: the primary category is immutable once a listing
            // exists (brief §2) — manually navigating back to this step
            // (the progress bar's own "Category" button is clickable once
            // `listingId` exists, see `completedStepIds`) must show the
            // stored category as fixed, never re-offer it as a live,
            // silently-inert choice.
            readOnly={Boolean(wizard.listingId)}
          />
        )}

        {wizard.currentStepId === 'basicInfo' && (
          <BasicInfoStep
            listingId={wizard.listingId}
            categoryId={categoryId}
            partnerships={partnerships}
            initialTranslations={listing?.translations ?? []}
            authoringLocale={wizard.authoringLocale}
            onAuthoringLocaleChange={wizard.setAuthoringLocale}
            onCreated={wizard.completeCreationStep}
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'location' && listing && (
          <LocationStep
            listingId={wizard.listingId}
            initialValues={listing.location ?? {}}
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'attributes' && listing && (
          <DynamicAttributesStep
            listingId={wizard.listingId}
            categoryId={categoryId}
            initialValues={
              metadataQuery.data
                ? fromAttributeValuesResponse(
                    metadataQuery.data.attributes,
                    listing.attribute_values,
                  )
                : {}
            }
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'amenities' && listing && (
          <AmenitiesStep
            listingId={wizard.listingId}
            categoryId={categoryId}
            initialValues={listing.amenity_ids ?? []}
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'media' && listing && (
          <MediaStep
            listingId={wizard.listingId}
            media={listing.media}
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'pricing' && listing && (
          <PricingStep
            listingId={wizard.listingId}
            categoryId={categoryId}
            initialValues={
              listing.pricing
                ? {
                    modelCode: listing.pricing.pricing_model,
                    amount: listing.pricing.amount,
                    currencyCode: listing.pricing.currency,
                  }
                : {}
            }
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'availability' && listing && (
          <AvailabilityStep
            listingId={wizard.listingId}
            categoryId={categoryId}
            initialValues={
              listing.booking_rules
                ? {
                    minimumStayNights:
                      listing.booking_rules.minimum_stay_nights,
                    maximumStayNights:
                      listing.booking_rules.maximum_stay_nights,
                    advanceBookingMinHours:
                      listing.booking_rules.advance_booking_min_hours,
                    advanceBookingMaxDays:
                      listing.booking_rules.advance_booking_max_days,
                  }
                : {}
            }
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'policies' && listing && (
          <PoliciesStep
            listingId={wizard.listingId}
            categoryId={categoryId}
            initialValues={
              metadataQuery.data
                ? fromPolicyValuesResponse(
                    metadataQuery.data.policies,
                    listing.policy_values,
                  )
                : {}
            }
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'content' && listing && (
          <ContentStep
            listingId={wizard.listingId}
            // 2026 Partner Workspace redesign (Sprint 3): `listing.highlights`/
            // etc. carry every language's rows in one flat array — `ContentStep`
            // now owns splitting that by locale itself (`getLocalizedItemsExact`,
            // no fallback — this is the authoring UI, not a public reader), so
            // the full arrays pass straight through unfiltered.
            initialHighlights={listing.highlights}
            initialItinerarySteps={listing.itinerary_steps}
            initialIncludedItems={listing.included_items}
            initialFaqs={listing.faqs}
            authoringLocale={wizard.authoringLocale}
            onAuthoringLocaleChange={wizard.setAuthoringLocale}
            onBack={wizard.goToPreviousStep}
            onNext={wizard.goToNextStep}
          />
        )}

        {wizard.currentStepId === 'review' && listing && (
          <ReviewStep
            listing={listing}
            publicationPeriodDays={wizard.publicationPeriodDays}
            onPublicationPeriodDaysChange={wizard.setPublicationPeriodDays}
            onBack={wizard.goToPreviousStep}
            onGoToStep={wizard.goToStep}
            onPublished={() => handlePublished()}
          />
        )}
      </div>
    </Container>
  );
}

const partnershipShape = PropTypes.shape({
  partner_id: PropTypes.number.isRequired,
  display_name: PropTypes.string.isRequired,
});

PartnerListingWizard.propTypes = {
  partnerships: PropTypes.arrayOf(partnershipShape).isRequired,
};
