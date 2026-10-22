/**
 * WizardProgress — Phase 5 (Partner Listing Wizard)'s multi-step
 * progress indicator. Only completed or the current step are clickable
 * (`onStepClick`) — a not-yet-reached step stays disabled, since the
 * wizard's own step order encodes real prerequisites.
 *
 * Where the step row scrolls (below `laptop`), the current step is
 * scrolled into view whenever it changes — horizontally, inside the row
 * only, so the page itself never jumps.
 */

import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from './WizardProgress.module.scss';

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WizardProgress({
  steps,
  currentStepId,
  completedStepIds = [],
  onStepClick,
  ariaLabel,
  summaryText,
  stepAriaLabel = (step) => step.label,
}) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector('[aria-current="step"]');
    if (!current || list.scrollWidth <= list.clientWidth) return;
    // Measured against the row itself, never `offsetLeft` (relative to the
    // nearest positioned ancestor, which beside a sidebar is the page).
    const listBox = list.getBoundingClientRect();
    const itemBox = current.closest('li').getBoundingClientRect();
    const itemStart = itemBox.left - listBox.left + list.scrollLeft;
    list.scrollLeft = itemStart - (listBox.width - itemBox.width) / 2;
  }, [currentStepId]);

  return (
    <nav aria-label={ariaLabel} className={styles.wizardProgress}>
      <p className={styles.summary}>{summaryText}</p>
      <ol className={styles.steps} ref={listRef}>
        {steps.map((step, index) => {
          const isCompleted = completedStepIds.includes(step.id);
          const isCurrent = step.id === currentStepId;
          const isClickable = isCompleted || isCurrent;

          return (
            <li className={styles.step} key={step.id}>
              <button
                type="button"
                className={[
                  styles.stepButton,
                  isCurrent && styles['stepButton--current'],
                  isCompleted && styles['stepButton--completed'],
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={stepAriaLabel(step)}
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step.id)}
              >
                <span className={styles.stepNumber}>
                  {isCompleted ? <CheckIcon /> : index + 1}
                </span>
                <span className={styles.stepLabel}>{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <span className={styles.connector} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

WizardProgress.propTypes = {
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  currentStepId: PropTypes.string.isRequired,
  completedStepIds: PropTypes.arrayOf(PropTypes.string),
  onStepClick: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  summaryText: PropTypes.string.isRequired,
  stepAriaLabel: PropTypes.func,
};
