import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PoliciesStep from './PoliciesStep.jsx';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

const POLICIES = [
  { code: 'pets_allowed', data_type: 'BOOLEAN', is_required: false },
  {
    code: 'cancellation_policy',
    data_type: 'ENUM',
    is_required: true,
    options: [
      { value: 1, code: 'FLEXIBLE' },
      { value: 2, code: 'STRICT' },
    ],
  },
];

describe('PoliciesStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: {} });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders a loading spinner while metadata is pending', () => {
    useListingMetadataQuery.mockReturnValue({ isPending: true });
    render(<PoliciesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders every policy via MetadataFieldRenderer', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { policies: POLICIES },
    });
    render(<PoliciesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    expect(
      screen.getByRole('switch', { name: 'Կենդանիներ թույլատրվում են' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('select-trigger')).toBeInTheDocument();
  });

  test('a missing required policy blocks Continue with an inline error', async () => {
    const user = userEvent.setup();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { policies: POLICIES },
    });
    render(<PoliciesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(
      await screen.findByText('Այս դաշտը պարտադիր է։'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // Step L6: the client-side required error cleared only on the next
  // Continue before — it now clears as soon as the field is filled.
  test('a required-policy error clears as soon as the policy is chosen', async () => {
    const user = userEvent.setup();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { policies: POLICIES },
    });
    render(<PoliciesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(
      await screen.findByText('Այս դաշտը պարտադիր է։'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('select-trigger'));
    await user.click(screen.getByRole('option', { name: 'Խիստ' }));

    expect(screen.queryByText('Այս դաշտը պարտադիր է։')).not.toBeInTheDocument();
  });

  test('submitting converts BOOLEAN/ENUM values to the policyValues string wire shape', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { policies: POLICIES },
    });
    render(<PoliciesStep listingId={7} categoryId={3} onNext={onNext} />);

    await user.click(
      screen.getByRole('switch', { name: 'Կենդանիներ թույլատրվում են' }),
    );
    await user.click(screen.getByTestId('select-trigger'));
    await user.click(screen.getByRole('option', { name: 'Խիստ' }));
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        policyValues: [
          { code: 'pets_allowed', value: 'true' },
          { code: 'cancellation_policy', value: 'STRICT' },
        ],
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('renders an empty-state message when the category has no policies', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { policies: [] },
    });
    render(<PoliciesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    expect(
      screen.getByText('Այս կատեգորիան կանոններ չունի։'),
    ).toBeInTheDocument();
  });
});
