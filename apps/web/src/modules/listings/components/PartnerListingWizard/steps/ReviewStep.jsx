/**
 * ReviewStep — step 10, and the wizard's one authoritative
 * publish-readiness gate. `POST /listings/:id/publish` rejects with a
 * 422 carrying `error.details` (`{ field, issue }[]` —
 * `ListingService.#checkPublishReadiness`) until every requirement
 * passes; this step renders that itemized list directly rather than
 * re-deriving readiness client-side, since the server is the only place
 * that actually knows every rule (required attributes/policies per
 * category, media, location, translation, >=1 bookable unit).
 *
 * Listing Lifetime / Renewal, Step B3: adds the publication-period
 * selector — one shared control for all 9 categories, since this step
 * itself already is the one shared publish surface every category's
 * wizard flow ends at (no category branch exists anywhere in this file).
 * The selection is always sent; the server decides whether it's actually
 * required (a listing's first lifecycle-managed publish) or silently
 * ignored (an ordinary republish) — this step never needs to know which
 * case applies, keeping `PUBLICATION_PERIOD_REQUIRED`/
 * `INVALID_PUBLICATION_PERIOD` just two more entries in the same
 * `publishIssues` list every other readiness failure already renders
 * through.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import { ChipGroup } from '@desavii/ui/components/form-controls';
import { usePublishListingMutation } from '../../../mutations/usePublishListingMutation.js';
import { PartnerAiToolsPanel, AskAiButton } from '../../../../ai/index.js';
import { PUBLICATION_PERIOD_DAYS_OPTIONS } from '../../../constants/publicationPeriod.js';
import ListingCompletenessWidget from '../ListingCompletenessWidget.jsx';
import TranslationCompletenessWidget from '../TranslationCompletenessWidget.jsx';
import WizardStepActions from '../WizardStepActions.jsx';
import styles from './ReviewStep.module.scss';

export default function ReviewStep({
  listing,
  publicationPeriodDays,
  onPublicationPeriodDaysChange,
  onBack = undefined,
  onPublished,
}) {
  const { t } = useTranslation();
  const publishMutation = usePublishListingMutation();

  const title = listing.translations[0]?.title;
  const issues = publishMutation.error?.details ?? [];

  const periodOptions = PUBLICATION_PERIOD_DAYS_OPTIONS.map((days) => ({
    value: String(days),
    label: t('partner.listingWizard.publicationPeriod.dayCount', {
      count: days,
    }),
  }));

  function handlePeriodChange(nextValue) {
    // The chip group's own "click the selected chip again to deselect"
    // behavior doesn't apply here — exactly one option must always be
    // selected (no custom value, no empty state), so a `undefined`
    // deselect attempt is simply ignored, keeping the previous choice.
    if (nextValue === undefined) return;
    onPublicationPeriodDaysChange(Number(nextValue));
  }

  async function handlePublish() {
    try {
      await publishMutation.mutateAsync({
        id: listing.id,
        publicationPeriodDays,
      });
      onPublished();
    } catch {
      // Surfaced below via publishMutation.error's `details` — no further
      // action needed here.
    }
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.review')}</h2>

      {publishMutation.error && (
        <Alert variant="danger">
          {publishMutation.error.message}
          {issues.length > 0 && (
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.issue}`}>
                  {t(`partner.listingWizard.publishIssues.${issue.issue}`, {
                    field: issue.field,
                    defaultValue: `${issue.field}: ${issue.issue}`,
                  })}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <Stack gap="2" as="dl">
        <div>
          <dt>{t('partner.listingWizard.review.title')}</dt>
          <dd>{title}</dd>
        </div>
        <div>
          <dt>{t('partner.listingWizard.review.location')}</dt>
          <dd>
            {listing.location
              ? `${listing.location.latitude}, ${listing.location.longitude}`
              : t('partner.listingWizard.review.notSet')}
          </dd>
        </div>
        <div>
          <dt>{t('partner.listingWizard.review.media')}</dt>
          <dd>
            {t('partner.listingWizard.review.mediaCount', {
              count: listing.media.length,
            })}
          </dd>
        </div>
        <div>
          <dt>{t('partner.listingWizard.review.amenities')}</dt>
          <dd>
            {t('partner.listingWizard.review.amenitiesCount', {
              count: listing.amenity_ids?.length ?? 0,
            })}
          </dd>
        </div>
        <div>
          <dt>{t('partner.listingWizard.review.pricing')}</dt>
          <dd>
            {listing.pricing
              ? `${listing.pricing.amount} ${listing.pricing.currency} (${t(
                  `partner.listingWizard.pricingModels.${listing.pricing.pricing_model}`,
                  listing.pricing.pricing_model,
                )})`
              : t('partner.listingWizard.review.notSet')}
          </dd>
        </div>
      </Stack>

      <ListingCompletenessWidget listingId={listing.id} />

      <TranslationCompletenessWidget listing={listing} />

      <PartnerAiToolsPanel listingId={listing.id} />

      <AskAiButton
        label={t('ai.contextButtons.improveListing')}
        contextType="listing"
        contextId={listing.id}
        initialMessage={t('ai.contextButtons.improveListingInitialMessage')}
        variant="secondary"
      />

      <section className={styles.publicationPeriod}>
        <p className={styles.publicationPeriodDescription}>
          {t('partner.listingWizard.publicationPeriod.description')}
        </p>
        <ChipGroup
          label={t('partner.listingWizard.publicationPeriod.heading')}
          options={periodOptions}
          selectedValue={String(publicationPeriodDays)}
          onChange={(nextValue) => handlePeriodChange(nextValue)}
        />
      </section>

      <WizardStepActions
        onBack={onBack}
        onContinue={() => handlePublish()}
        isSubmitting={publishMutation.isPending}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.publish')}
      />
    </div>
  );
}

const localizedRowShape = PropTypes.shape({
  language_code: PropTypes.string.isRequired,
});

ReviewStep.propTypes = {
  listing: PropTypes.shape({
    id: PropTypes.number.isRequired,
    translations: PropTypes.arrayOf(
      PropTypes.shape({
        language_code: PropTypes.string.isRequired,
        title: PropTypes.string,
        summary: PropTypes.string,
        description: PropTypes.string,
      }),
    ).isRequired,
    // 2026 Partner Workspace redesign (Sprint 3 closeout):
    // TranslationCompletenessWidget reads these — same rich-content
    // arrays ContentStep already authors, passed straight through.
    highlights: PropTypes.arrayOf(localizedRowShape),
    included_items: PropTypes.arrayOf(localizedRowShape),
    faqs: PropTypes.arrayOf(localizedRowShape),
    itinerary_steps: PropTypes.arrayOf(localizedRowShape),
    location: PropTypes.shape({
      latitude: PropTypes.number,
      longitude: PropTypes.number,
    }),
    // eslint-disable-next-line react/forbid-prop-types -- only .length is read here; the full media item shape is MediaStep's concern
    media: PropTypes.array.isRequired,
    amenity_ids: PropTypes.arrayOf(PropTypes.number),
    pricing: PropTypes.shape({
      amount: PropTypes.number,
      currency: PropTypes.string,
      pricing_model: PropTypes.string,
    }),
  }).isRequired,
  publicationPeriodDays: PropTypes.number.isRequired,
  onPublicationPeriodDaysChange: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  onPublished: PropTypes.func.isRequired,
};
