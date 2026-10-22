/**
 * WizardStepActions — the Back/Continue button row every wizard step
 * ends with. Extracted once here rather than duplicated across all ten
 * steps: each step still owns *when* to call `onContinue` (usually
 * "after this step's own save mutation resolves"), this component only
 * owns the consistent layout/loading/disabled chrome around that.
 *
 * When Continue is refused (the step stays on screen with its errors
 * drawn), focus moves to the step's first invalid field, so a keyboard or
 * screen-reader user lands on what needs fixing instead of on the button.
 * A step that advances unmounts this row, so nothing is focused then.
 */

import { useRef } from 'react';
import PropTypes from 'prop-types';
import { Button } from '@desavii/ui/components/primitives';
import styles from './WizardStepActions.module.scss';

export default function WizardStepActions({
  onBack = undefined,
  onContinue,
  backLabel,
  continueLabel,
  isSubmitting = false,
  continueDisabled = false,
}) {
  const rowRef = useRef(null);

  async function handleContinue(event) {
    await onContinue(event);
    // After React has drawn the step's errors.
    window.requestAnimationFrame(() => {
      rowRef.current?.parentElement
        ?.querySelector('[aria-invalid="true"]')
        ?.focus();
    });
  }

  return (
    <div className={styles.actions} ref={rowRef}>
      {onBack && (
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
          {backLabel}
        </Button>
      )}
      <Button
        onClick={(event) => handleContinue(event)}
        loading={isSubmitting}
        disabled={continueDisabled}
      >
        {continueLabel}
      </Button>
    </div>
  );
}

WizardStepActions.propTypes = {
  onBack: PropTypes.func,
  onContinue: PropTypes.func.isRequired,
  backLabel: PropTypes.string.isRequired,
  continueLabel: PropTypes.string.isRequired,
  isSubmitting: PropTypes.bool,
  continueDisabled: PropTypes.bool,
};
