/**
 * CategoryStep — step 1. Every attribute/amenity/pricing-model/policy
 * the rest of the wizard renders is scoped by whichever category is
 * picked here (`GET /listings/metadata?categoryId=`) — this step itself
 * has nothing bespoke: the category list comes from `GET /search/
 * categories`, the same real, already-localized taxonomy the public
 * Search page browses, never a hardcoded list.
 *
 * Doesn't call any mutation — the picked `categoryId` is only persisted
 * once `BasicInfoStep` calls `createListing` with it. Editing an
 * existing draft, the orchestrator passes the listing's already-stored
 * `category_ids[0]` as `value`, so this step still shows the right
 * selection without needing its own fetch of listing data.
 *
 * Step L1 (brief §2/§6): the primary category is immutable once a
 * listing exists. `readOnly` (set by the orchestrator whenever
 * `listingId` exists) renders the already-chosen category as a fixed,
 * non-interactive statement instead of the clickable picker — the
 * progress bar's own "Category" step stays clickable for a resumed
 * listing (`completedStepIds` includes it), so this is reachable by
 * deliberate backward navigation, not just the normal creation flow.
 * Cards render as plain `<div>`s here, not `<button>`s, so this is
 * structurally non-interactive, never a click handler that silently
 * no-ops.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { useListingCategoriesQuery } from '../../../queries/useListingCategoriesQuery.js';
import WizardStepActions from '../WizardStepActions.jsx';
import styles from './CategoryStep.module.scss';

export default function CategoryStep({
  value = null,
  onChange,
  onNext,
  readOnly = false,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const {
    data: categories,
    isPending,
    isError,
    refetch,
  } = useListingCategoriesQuery(locale);

  if (isPending) {
    return <Spinner label={t('partner.listingWizard.category.loading')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('partner.listingWizard.category.errorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={refetch}
      />
    );
  }

  if (readOnly) {
    const currentCategory = categories.find(
      (category) => category.id === value,
    );
    return (
      <div>
        <h2 className={styles.title}>
          {t('partner.listingWizard.steps.category')}
        </h2>
        <div
          className={[
            styles.card,
            styles['card--selected'],
            styles['card--static'],
          ].join(' ')}
          aria-current="true"
        >
          {currentCategory?.name}
        </div>
        <p>{t('partner.listingWizard.category.fixedNote')}</p>
        <WizardStepActions
          onContinue={onNext}
          backLabel={t('partner.listingWizard.back')}
          continueLabel={t('partner.listingWizard.continue')}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className={styles.title}>
        {t('partner.listingWizard.steps.category')}
      </h2>
      <div
        role="radiogroup"
        aria-label={t('partner.listingWizard.steps.category')}
      >
        <div className={styles.categoryGrid}>
          {categories.map((category) => {
            const isSelected = value === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={[styles.card, isSelected && styles['card--selected']]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onChange(category.id)}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </div>
      <WizardStepActions
        onContinue={onNext}
        continueDisabled={!value}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.continue')}
      />
    </div>
  );
}

CategoryStep.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
};
