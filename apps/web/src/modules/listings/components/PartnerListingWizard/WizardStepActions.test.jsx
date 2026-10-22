import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WizardStepActions from './WizardStepActions.jsx';

// A step whose Continue is refused: it marks its field invalid and stays.
function RefusingStep() {
  const [invalid, setInvalid] = useState(false);
  return (
    <div>
      <input aria-label="Title" aria-invalid={invalid ? 'true' : undefined} />
      <WizardStepActions
        onContinue={() => setInvalid(true)}
        backLabel="Back"
        continueLabel="Continue"
      />
    </div>
  );
}

describe('WizardStepActions (PartnerListingWizard)', () => {
  test('a refused Continue moves focus to the first invalid field', async () => {
    const user = userEvent.setup();
    render(<RefusingStep />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
  });

  test('a Continue that leaves nothing invalid keeps focus where it was', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Title" />
        <WizardStepActions
          onContinue={vi.fn()}
          backLabel="Back"
          continueLabel="Continue"
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await new Promise((resolve) => {
      window.requestAnimationFrame(resolve);
    });

    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  });

  test('renders only the Continue button when onBack is not provided', () => {
    render(
      <WizardStepActions
        onContinue={vi.fn()}
        backLabel="Back"
        continueLabel="Continue"
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue' }),
    ).toBeInTheDocument();
  });

  test('renders Back when onBack is provided and calls it on click', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <WizardStepActions
        onBack={onBack}
        onContinue={vi.fn()}
        backLabel="Back"
        continueLabel="Continue"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  test('calls onContinue on click', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <WizardStepActions
        onContinue={onContinue}
        backLabel="Back"
        continueLabel="Continue"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalled();
  });

  test('disables Back (but not Continue via disabled — it shows a loading state) while isSubmitting', () => {
    render(
      <WizardStepActions
        onBack={vi.fn()}
        onContinue={vi.fn()}
        backLabel="Back"
        continueLabel="Continue"
        isSubmitting
      />,
    );
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  test('disables Continue when continueDisabled is true', () => {
    render(
      <WizardStepActions
        onContinue={vi.fn()}
        backLabel="Back"
        continueLabel="Continue"
        continueDisabled
      />,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
