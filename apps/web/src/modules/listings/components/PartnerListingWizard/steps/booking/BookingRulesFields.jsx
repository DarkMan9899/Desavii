/**
 * BookingRulesFields — stay/rental length and advance-booking limits inside
 * the Booking & pricing step (state and rules: `useBookingRulesDraft`).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input } from '@desavii/ui/components/form-controls';
import styles from './BookingSections.module.scss';

export default function BookingRulesFields({
  draft,
  fieldError,
  clearFieldError,
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.rulesGrid}>
      {draft.visibleRuleFields.map(({ key, kind }) => (
        <Input
          key={key}
          type="number"
          min={kind === 'positive' ? 1 : 0}
          step={1}
          label={t(
            `partner.listingWizard.availability.${draft.labelKeyFor(key)}`,
          )}
          helperText={draft.hintFor(key)}
          value={draft.rules[key]}
          error={draft.ruleErrors[key] ?? fieldError(`bookingRules.${key}`)}
          onChange={(event) => {
            draft.setRule(key, event.target.value);
            clearFieldError(`bookingRules.${key}`);
          }}
        />
      ))}
    </div>
  );
}

BookingRulesFields.propTypes = {
  // `useBookingRulesDraft()`'s return value.
  // eslint-disable-next-line react/forbid-prop-types
  draft: PropTypes.object.isRequired,
  fieldError: PropTypes.func.isRequired,
  clearFieldError: PropTypes.func.isRequired,
};
