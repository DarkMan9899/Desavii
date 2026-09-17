import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRenewListingMutation } from './useRenewListingMutation.js';
import { renewListing } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

vi.mock('../../../api/listings.js', () => ({
  renewListing: vi.fn(),
}));

function Harness() {
  const { mutate, isSuccess, error } = useRenewListingMutation();
  return (
    <div>
      <button
        type="button"
        onClick={() => mutate({ id: 7, publicationPeriodDays: 90 })}
      >
        renew
      </button>
      <p data-testid="status">{isSuccess ? 'success' : 'idle'}</p>
      <p data-testid="error">{error ? error.message : ''}</p>
    </div>
  );
}

describe('useRenewListingMutation (apps/web/src/modules/listings)', () => {
  let queryClient;

  beforeEach(() => {
    renewListing.mockReset();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  test('calls renewListing(id, { publicationPeriodDays }) and invalidates the detail + lists + mine caches', async () => {
    renewListing.mockResolvedValue({
      data: { id: 7, status: 'PUBLISHED' },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'renew' }));

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(renewListing).toHaveBeenCalledWith(7, {
      publicationPeriodDays: 90,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: listingKeys.detail(7),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: listingKeys.mines(),
    });
  });

  test('surfaces a renewal rejection as a mutation error', async () => {
    renewListing.mockRejectedValue(
      Object.assign(
        new Error('A listing in status "DRAFT" cannot be renewed.'),
        {
          code: 'LISTING_NOT_RENEWABLE',
        },
      ),
    );
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'renew' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        'A listing in status "DRAFT" cannot be renewed.',
      ),
    );
  });
});
