import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useListingBookableUnitsQuery } from './useListingBookableUnitsQuery.js';
import { getListingBookableUnits } from '../../../api/availability.js';

vi.mock('../../../api/availability.js', () => ({
  getListingBookableUnits: vi.fn(),
}));

function Harness({ listingId = undefined }) {
  const { data, isPending } = useListingBookableUnitsQuery(listingId);
  return (
    <div>
      <p data-testid="status">{isPending ? 'pending' : 'success'}</p>
      <p data-testid="count">{data?.length ?? ''}</p>
    </div>
  );
}

Harness.propTypes = { listingId: PropTypes.number };

// Sprint A (Time-Aware Booking Foundation): a second harness for the
// optional `date` argument — kept separate from `Harness` above rather
// than adding a prop to it, since every existing call site never passes
// one at all.
function DateHarness({ listingId, date }) {
  const { data, isPending } = useListingBookableUnitsQuery(listingId, {
    date,
  });
  return (
    <div>
      <p data-testid="status">{isPending ? 'pending' : 'success'}</p>
      <p data-testid="count">{data?.length ?? ''}</p>
    </div>
  );
}

DateHarness.propTypes = {
  listingId: PropTypes.number.isRequired,
  date: PropTypes.string.isRequired,
};

// The Listing Detail page's own read and the reservation panel's read
// before a date is chosen (`date: null`), mounted side by side.
function PageAndPanelHarness({ listingId }) {
  useListingBookableUnitsQuery(listingId);
  useListingBookableUnitsQuery(listingId, {
    date: null,
    checkIn: null,
    checkOut: null,
  });
  return null;
}

PageAndPanelHarness.propTypes = { listingId: PropTypes.number.isRequired };

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

describe('useListingBookableUnitsQuery (apps/web/src/modules/listings)', () => {
  beforeEach(() => {
    getListingBookableUnits.mockReset();
  });

  test('resolves a listing public bookable units', async () => {
    getListingBookableUnits.mockResolvedValue({
      data: [{ id: 1, bookable_unit_type: 'HOTEL_ROOM', capacity: 2 }],
    });
    renderHarness(10);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(getListingBookableUnits).toHaveBeenCalledWith(10, {
      date: undefined,
    });
  });

  test('a date not chosen yet (null) shares the date-less read — one request, not two', async () => {
    getListingBookableUnits.mockResolvedValue({ data: [] });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <PageAndPanelHarness listingId={10} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(getListingBookableUnits).toHaveBeenCalled());
    expect(getListingBookableUnits).toHaveBeenCalledTimes(1);
  });

  test('stays disabled (never calls the API) when no listingId is selected yet', () => {
    renderHarness(undefined);
    expect(getListingBookableUnits).not.toHaveBeenCalled();
  });

  // Sprint A (Time-Aware Booking Foundation): an optional `date` re-fetches
  // with the per-date availability/price snapshot — every other existing
  // caller (both tests above) omits it and is completely unaffected.
  test('passes an explicit date through when the caller asks for a per-date snapshot', async () => {
    getListingBookableUnits.mockResolvedValue({
      data: [
        {
          id: 1,
          bookable_unit_type: 'TOUR_DEPARTURE',
          capacity: 8,
          availability_status_for_date: 'AVAILABLE',
        },
      ],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <DateHarness listingId={10} date="2027-04-10" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(getListingBookableUnits).toHaveBeenCalledWith(10, {
      date: '2027-04-10',
    });
  });
});
