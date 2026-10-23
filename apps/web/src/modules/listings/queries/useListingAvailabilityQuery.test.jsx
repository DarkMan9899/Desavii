import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useListingAvailabilityQuery } from './useListingAvailabilityQuery.js';
import {
  getListingCalendar,
  getListingPublicRanges,
} from '../../../api/availability.js';

vi.mock('../../../api/availability.js', () => ({
  getListingCalendar: vi.fn(),
  getListingPublicRanges: vi.fn(),
}));

function Harness({ listingId = undefined }) {
  const { data, isPending } = useListingAvailabilityQuery(listingId);
  return (
    <div>
      <p data-testid="status">{isPending ? 'pending' : 'success'}</p>
      <p data-testid="count">{data?.ranges?.length}</p>
    </div>
  );
}

Harness.propTypes = { listingId: PropTypes.number };

function renderHarness(listingId) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness listingId={listingId} />
    </QueryClientProvider>,
  );
}

describe('useListingAvailabilityQuery (apps/web/src/modules/listings)', () => {
  beforeEach(() => {
    getListingCalendar.mockReset();
    getListingPublicRanges.mockReset();
  });

  // Calendar Excellence: a multi-room hotel used to be asked for a
  // unit-specific calendar first and answer 422 AMBIGUOUS_UNIT on every
  // page load. The listing-level ranges need no unit, so only they are read.
  test('reads the listing-level blocked ranges and never a unit calendar', async () => {
    getListingPublicRanges.mockResolvedValue({
      data: [{ date_from: '2026-08-05', date_to: '2026-08-10' }],
    });
    renderHarness(9);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(getListingPublicRanges).toHaveBeenCalledWith(9);
    expect(getListingCalendar).not.toHaveBeenCalled();
  });

  test('does not fetch without a listing id', () => {
    renderHarness(undefined);
    expect(screen.getByTestId('status')).toHaveTextContent('pending');
    expect(getListingPublicRanges).not.toHaveBeenCalled();
  });
});
