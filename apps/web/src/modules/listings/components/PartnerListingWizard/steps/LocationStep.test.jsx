import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationStep from './LocationStep.jsx';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

describe('LocationStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: { id: 7 } });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('submitting valid coordinates calls updateListing with a numeric location and onNext', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<LocationStep listingId={7} onNext={onNext} />);

    await user.type(screen.getByLabelText(/Լայնություն/), '40.18');
    await user.type(screen.getByLabelText(/Երկայնություն/), '44.5');
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: { location: { latitude: 40.18, longitude: 44.5 } },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('missing coordinates blocks submission', async () => {
    const user = userEvent.setup();
    render(<LocationStep listingId={7} onNext={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    const errors = await screen.findAllByText('Այս դաշտը պարտադիր է։');
    expect(errors.length).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('an out-of-range latitude is rejected', async () => {
    const user = userEvent.setup();
    render(<LocationStep listingId={7} onNext={vi.fn()} />);

    await user.type(screen.getByLabelText(/Լայնություն/), '200');
    await user.type(screen.getByLabelText(/Երկայնություն/), '44.5');
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    expect(
      await screen.findByText('Լայնությունը պետք է լինի -90-ից 90-ի միջև։'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // Step L2 (brief §13): raw coordinates sit behind a collapsed, clearly
  // labeled disclosure since the map already sets both fields — but an
  // error inside it must never be silently hidden.
  describe('coordinates disclosure (Step L2)', () => {
    test('the manual coordinate fields are collapsed behind a disclosure by default', () => {
      render(<LocationStep listingId={7} onNext={vi.fn()} />);

      const details = screen
        .getByText('Մուտքագրել կոորդինատները ձեռքով')
        .closest('details');
      expect(details).not.toHaveAttribute('open');
    });

    test('the disclosure auto-opens when Continue is clicked with no coordinates picked', async () => {
      const user = userEvent.setup();
      render(<LocationStep listingId={7} onNext={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      const details = await screen
        .findByText('Մուտքագրել կոորդինատները ձեռքով')
        .then((summary) => summary.closest('details'));
      expect(details).toHaveAttribute('open');
    });
  });

  test('renders no Back button when onBack is not given (first-in-flow edge case)', () => {
    render(<LocationStep listingId={7} onNext={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Հետ' }),
    ).not.toBeInTheDocument();
  });

  test('clicking Back calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<LocationStep listingId={7} onNext={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Հետ' }));
    expect(onBack).toHaveBeenCalled();
  });
});
