import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripPlannerForm from './TripPlannerForm.jsx';

describe('TripPlannerForm (apps/web/src/modules/ai)', () => {
  test('submits the destination, days, budget, currency, and split interests', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TripPlannerForm onSubmit={onSubmit} />);

    // Required fields render a trailing "*" marker inside the <label>, so
    // the accessible label text is "Նպատակակետ *" — matched with a
    // prefix regex rather than an exact string (same convention used
    // elsewhere in this codebase for required-field labels).
    await user.type(screen.getByLabelText(/^Նպատակակետ/), 'Yerevan');
    await user.clear(screen.getByLabelText(/^Օրեր/));
    await user.type(screen.getByLabelText(/^Օրեր/), '3');
    await user.clear(screen.getByLabelText(/^Բյուջե/));
    await user.type(screen.getByLabelText(/^Բյուջե/), '600');
    await user.type(
      screen.getByLabelText('Հետաքրքրություններ (ստորակետով բաժանված)'),
      'nature, family',
    );
    await user.click(
      screen.getByRole('button', { name: 'Պլանավորել իմ ուղևորությունը' }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      destination: 'Yerevan',
      days: 3,
      budget: 600,
      currency: 'AMD',
      interests: ['nature', 'family'],
    });
  });

  test('the label-less currency picker is still a named combobox for assistive technology', () => {
    render(<TripPlannerForm onSubmit={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Արժույթ' })).toHaveTextContent(
      'AMD',
    );
  });

  test('disables the submit button and shows a submitting label while pending', () => {
    render(<TripPlannerForm onSubmit={vi.fn()} isSubmitting />);
    const button = screen.getByRole('button', { name: 'Պլանավորվում է...' });
    expect(button).toBeDisabled();
  });
});
