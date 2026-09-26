/**
 * ListingCompletenessWidget — Phase 18.10. Renders `useListingCompletenessQuery`'s
 * server-computed score on the Review step: a percent-complete bar plus the
 * specific missing required/recommended fields.
 *
 * `required_missing`/`recommended_missing` codes are `listingService
 * .getListingCompleteness`'s own vocabulary — a *different* set from
 * the readiness `issue` codes (`AT_LEAST_ONE_...REQUIRED`, `apiErrors.issues.*`) used
 * elsewhere on this step, so it isn't reused here. Static codes
 * (`translations`, `media`, `location`, `bookableUnits`, `highlights`,
 * `media.moreImages`, `faqs`, `pricing`, `translations.description`) get a
 * dedicated `completeness.fields.*` key. The two dynamic, category-specific
 * shapes (`attributeValues.{code}`/`policyValues.{code}`) instead resolve
 * through the *same* `partner.listingWizard.attributes.{code}` /
 * `partner.listingWizard.policies.{code}` labels `MetadataFieldRenderer`
 * already uses for those exact codes — never a second label source for the
 * same attribute/policy.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@desavii/ui/components/feedback-overlays';
import { useListingCompletenessQuery } from '../../queries/useListingCompletenessQuery.js';
import styles from './ListingCompletenessWidget.module.scss';

function toFieldLabel(t, code) {
  if (code.startsWith('attributeValues.')) {
    const attributeCode = code.slice('attributeValues.'.length);
    return t(`partner.listingWizard.attributes.${attributeCode}`, {
      defaultValue: attributeCode,
    });
  }
  if (code.startsWith('policyValues.')) {
    const policyCode = code.slice('policyValues.'.length);
    return t(`partner.listingWizard.policies.${policyCode}`, {
      defaultValue: policyCode,
    });
  }
  return t(`partner.listingWizard.completeness.fields.${code}`, {
    defaultValue: code,
  });
}

export default function ListingCompletenessWidget({ listingId }) {
  const { t } = useTranslation();
  const { data, isPending } = useListingCompletenessQuery(listingId);

  if (isPending || !data) {
    return <Spinner label={t('partner.listingWizard.completeness.loading')} />;
  }

  const percent = Math.max(0, Math.min(100, data.percent_complete));

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.label}>
          {t('partner.listingWizard.completeness.title')}
        </span>
        <span className={styles.percent}>{`${percent}%`}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('partner.listingWizard.completeness.title')}
      >
        <div
          className={[
            styles.fill,
            data.is_publish_ready
              ? styles['fill--ready']
              : styles['fill--pending'],
          ].join(' ')}
          style={{ width: `${percent}%` }}
        />
      </div>

      {data.required_missing.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>
            {t('partner.listingWizard.completeness.requiredTitle')}
          </span>
          <ul className={styles.list}>
            {data.required_missing.map((code) => (
              <li key={code} className={styles.requiredItem}>
                {toFieldLabel(t, code)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recommended_missing.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>
            {t('partner.listingWizard.completeness.recommendedTitle')}
          </span>
          <ul className={styles.list}>
            {data.recommended_missing.map((code) => (
              <li key={code} className={styles.recommendedItem}>
                {toFieldLabel(t, code)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.is_publish_ready && data.recommended_missing.length === 0 && (
        <p className={styles.allDone}>
          {t('partner.listingWizard.completeness.allDone')}
        </p>
      )}
    </div>
  );
}

ListingCompletenessWidget.propTypes = {
  listingId: PropTypes.number.isRequired,
};
