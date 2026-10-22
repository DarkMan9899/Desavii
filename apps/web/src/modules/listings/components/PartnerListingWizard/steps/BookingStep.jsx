/**
 * BookingStep — "Booking & pricing": what exactly is sold, at what base
 * price, under which booking rules (Partner Listing Wizard rebuild — the
 * former Pricing and Availability steps, which answered one question in
 * two places).
 *
 * 1. Rooms / units / departures / the vehicle (`BookableUnitsManager`,
 *    saved as they are edited) — each can carry its own base price.
 * 2. The listing's default price — used for any of them without its own
 *    price (booking's price order: date override → unit price → listing
 *    price), and the listing's "from" price where no unit has one.
 * 3. Booking rules — stay/rental length and advance-booking limits.
 * 4. Blackout dates — closed ranges, saved as they are added or removed.
 *
 * Continue validates the price and the rules together and saves them in
 * one write. Like before, it never blocks on "no unit registered yet" —
 * `ReviewStep` and the API's publish readiness are the authoritative gate.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import useApiFieldErrors from '../../../../../hooks/useApiFieldErrors.js';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { bookableUnitProfileShape } from '../../../utils/resolveBookableUnitProfile.js';
import BookableUnitsManager from '../../BookableUnitsManager/BookableUnitsManager.jsx';
import WizardStepActions from '../WizardStepActions.jsx';
import {
  usePricingDraft,
  PRICING_API_PATHS,
} from './booking/usePricingDraft.js';
import { useBookingRulesDraft } from './booking/useBookingRulesDraft.js';
import PricingFields from './booking/PricingFields.jsx';
import BookingRulesFields from './booking/BookingRulesFields.jsx';
import BlackoutDatesSection from './booking/BlackoutDatesSection.jsx';
import styles from './booking/BookingSections.module.scss';

function BookingForm({
  listingId,
  categoryId = null,
  listingType = null,
  unitProfile,
  pricingModels,
  initialPricing,
  initialRules,
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const updateListingMutation = useUpdateListingMutation();
  const { fieldError, clearFieldError } = useApiFieldErrors(
    updateListingMutation.error,
  );
  const pricing = usePricingDraft({
    pricingModels,
    listingType,
    initialValues: initialPricing,
  });
  const rules = useBookingRulesDraft({
    unitProfile,
    initialValues: initialRules,
  });

  async function handleContinue() {
    // Both run, so every invalid field shows its error at once.
    const pricingResult = pricing.collect();
    const rulesResult = rules.collect();
    if (!pricingResult.ok || !rulesResult.ok) return;

    const payload = {};
    if (pricingResult.payload) payload.pricing = pricingResult.payload;
    if (rulesResult.payload) payload.bookingRules = rulesResult.payload;
    if (Object.keys(payload).length > 0) {
      try {
        await updateListingMutation.mutateAsync({ id: listingId, payload });
      } catch {
        // Rendered from the mutation's own `error` (ApiErrorAlert + fields).
        return;
      }
    }
    onNext();
  }

  const inlinePaths = [
    ...(pricingModels.length > 0 ? Object.values(PRICING_API_PATHS) : []),
    ...rules.visibleRuleFields.map(({ key }) => `bookingRules.${key}`),
  ];

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.booking')}</h2>
      <p className={styles.sectionIntro}>
        {t('partner.listingWizard.booking.intro')}
      </p>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t(`partner.listingWizard.unitTerms.${unitProfile.terms}.heading`)}
        </h3>
        <BookableUnitsManager
          listingId={listingId}
          categoryId={categoryId}
          profile={unitProfile}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('partner.listingWizard.booking.defaultPrice')}
        </h3>
        {pricingModels.length > 0 && (
          <p className={styles.sectionIntro}>
            {t('partner.listingWizard.pricing.stepIntro')}
          </p>
        )}
        <ApiErrorAlert
          error={updateListingMutation.error}
          inlinePaths={inlinePaths}
        />
        <PricingFields
          draft={pricing}
          fieldError={fieldError}
          clearFieldError={clearFieldError}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('partner.listingWizard.availability.bookingRules')}
        </h3>
        <BookingRulesFields
          draft={rules}
          fieldError={fieldError}
          clearFieldError={clearFieldError}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('partner.listingWizard.availability.blackoutDates')}
        </h3>
        <p className={styles.sectionIntro}>
          {t('partner.listingWizard.booking.blackoutIntro')}
        </p>
        <BlackoutDatesSection listingId={listingId} />
      </section>

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

const pricingShape = PropTypes.shape({
  modelCode: PropTypes.string,
  amount: PropTypes.number,
  currencyCode: PropTypes.string,
});
const rulesShape = PropTypes.shape({
  minimumStayNights: PropTypes.number,
  maximumStayNights: PropTypes.number,
  advanceBookingMinHours: PropTypes.number,
  advanceBookingMaxDays: PropTypes.number,
});

BookingForm.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  listingType: PropTypes.string,
  unitProfile: bookableUnitProfileShape.isRequired,
  pricingModels: PropTypes.arrayOf(
    PropTypes.shape({ code: PropTypes.string.isRequired }),
  ).isRequired,
  initialPricing: pricingShape.isRequired,
  initialRules: rulesShape.isRequired,
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};

export default function BookingStep({
  listingId,
  categoryId = null,
  listingType = null,
  unitProfile,
  initialPricing = {},
  initialRules = {},
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

  return (
    <BookingForm
      listingId={listingId}
      categoryId={categoryId}
      listingType={listingType}
      unitProfile={unitProfile}
      pricingModels={metadata.pricing_models}
      initialPricing={initialPricing}
      initialRules={initialRules}
      onBack={onBack}
      onNext={onNext}
    />
  );
}

BookingStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  listingType: PropTypes.string,
  unitProfile: bookableUnitProfileShape.isRequired,
  initialPricing: pricingShape,
  initialRules: rulesShape,
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
