import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePublishListingMutation } from './usePublishListingMutation.js';
import { publishListing } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

vi.mock('../../../api/listings.js', () => ({
  publishListing: vi.fn(),
}));

function Harness() {
  const { mutate, isSuccess, error } = usePublishListingMutation();
  return (
    <div>
      <button
        type="button"
        onClick={() => mutate({ id: 7, publicationPeriodDays: 90 })}
      >
        publish
      </button>
      <p data-testid="status">{isSuccess ? 'success' : 'idle'}</p>
      <p data-testid="error">{error ? error.message : ''}</p>
    </div>
  );
}

describe('usePublishListingMutation (apps/web/src/modules/listings)', () => {
  let queryClient;

  beforeEach(() => {
    publishListing.mockReset();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  test('calls publishListing(id, { publicationPeriodDays }) and invalidates the detail + lists cache', async () => {
    publishListing.mockResolvedValue({
      data: { id: 7, status: 'PUBLISHED' },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'publish' }));

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(publishListing).toHaveBeenCalledWith(7, {
      publicationPeriodDays: 90,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: listingKeys.detail(7),
    });
  });

  test('surfaces a publish-readiness rejection as a mutation error', async () => {
    publishListing.mockRejectedValue(
      new Error('One or more fields are invalid.'),
    );
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'publish' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        'One or more fields are invalid.',
      ),
    );
  });
});
