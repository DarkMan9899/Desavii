import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingAvailabilitySection from './ListingAvailabilitySection.jsx';
import { useListingAvailabilityQuery } from '../../../queries/useListingAvailabilityQuery.js';
import { useListingAvailabilitySummaryQuery } from '../../../queries/useListingAvailabilitySummaryQuery.js';
import { useListingDayStatusQuery } from '../../../queries/useListingDayStatusQuery.js';

vi.mock('../../../queries/useListingAvailabilityQuery.js', () => ({
  useListingAvailabilityQuery: vi.fn(),
}));

vi.mock('../../../queries/useListingAvailabilitySummaryQuery.js', () => ({
  useListingAvailabilitySummaryQuery: vi.fn(),
}));

vi.mock('../../../queries/useListingDayStatusQuery.js', () => ({
  useListingDayStatusQuery: vi.fn(),
}));

describe('ListingAvailabilitySection (Listing Details)', () => {
  beforeEach(() => {
    useListingAvailabilityQuery.mockReset();
    useListingAvailabilitySummaryQuery.mockReset();
    useListingDayStatusQuery.mockReset();
    useListingAvailabilitySummaryQuery.mockReturnValue({ data: undefined });
    useListingDayStatusQuery.mockReturnValue({ data: undefined });
  });

  test('shows a loading spinner while pending', () => {
    useListingAvailabilityQuery.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    });
    render(<ListingAvailabilitySection listingId={3} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('shows an error state with a retry action', () => {
    const refetch = vi.fn();
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
      refetch,
    });
    render(<ListingAvailabilitySection listingId={3} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Կրկնել' }).click();
    expect(refetch).toHaveBeenCalled();
  });

  test('renders the available-day count for a single bookable unit, sourced from the day-status endpoint (not the legacy calendar)', () => {
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ranges: [] },
      refetch: vi.fn(),
    });
    useListingAvailabilitySummaryQuery.mockReturnValue({
      data: [
        {
          unit_id: 7,
          bookable_unit_type: 'PROPERTY_UNIT',
          availability_status: 'AVAILABLE',
          remaining_count: null,
        },
      ],
    });
    useListingDayStatusQuery.mockReturnValue({
      data: [
        { date: '2026-08-01', availability_status: 'AVAILABLE' },
        { date: '2026-08-02', availability_status: 'AVAILABLE' },
      ],
    });
    render(<ListingAvailabilitySection listingId={3} />);
    expect(
      screen.getByText('Հաջորդ 30 օրերից 2-ը հասանելի է'),
    ).toBeInTheDocument();
  });

  test('never shows a sold-out badge next to a contradictory "days available" count for the same single unit', () => {
    // Regression test for the availability-state contradiction: the
    // summary badge says SOLD_OUT for the one bookable unit, and the
    // legacy calendar query (deliberately stale/wrong, as the real bug
    // was) still reports every day AVAILABLE. The day-status endpoint —
    // the same source of truth the badge uses — correctly reports zero
    // available days, and that is what must render.
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ranges: [] },
      refetch: vi.fn(),
    });
    useListingAvailabilitySummaryQuery.mockReturnValue({
      data: [
        {
          unit_id: 7,
          bookable_unit_type: 'PROPERTY_UNIT',
          availability_status: 'SOLD_OUT',
          remaining_count: 0,
        },
      ],
    });
    useListingDayStatusQuery.mockReturnValue({
      data: [
        { date: '2026-08-01', availability_status: 'SOLD_OUT' },
        { date: '2026-08-02', availability_status: 'SOLD_OUT' },
      ],
    });
    render(<ListingAvailabilitySection listingId={3} />);
    expect(screen.getByText('Սպառված է')).toBeInTheDocument();
    expect(
      screen.getByText('Հաջորդ 30 օրերից 0-ը հասանելի է'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Հաջորդ 30 օրերից 2-ը հասանելի է'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Այս հայտարարության համար հասանելիության տվյալներ դեռ չկան։',
      ),
    ).not.toBeInTheDocument();
  });

  test('renders blocked date ranges for a multi-unit (ambiguous) listing, with no blended day-count claim', () => {
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        ranges: [{ date_from: '2026-08-05', date_to: '2026-08-10' }],
      },
      refetch: vi.fn(),
    });
    render(<ListingAvailabilitySection listingId={9} />);
    expect(screen.getByText('2026-08-05 – 2026-08-10')).toBeInTheDocument();
    expect(useListingDayStatusQuery).toHaveBeenCalledWith(
      9,
      undefined,
      expect.any(Object),
    );
  });

  test('renders a customer-safe availability-summary badge per unit and no misleading no-data message', () => {
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ranges: [] },
      refetch: vi.fn(),
    });
    useListingAvailabilitySummaryQuery.mockReturnValue({
      data: [
        {
          unit_id: 1,
          bookable_unit_type: 'HOTEL_ROOM',
          availability_status: 'LOW',
          remaining_count: 2,
        },
        {
          unit_id: 2,
          bookable_unit_type: 'TOUR_DEPARTURE',
          availability_status: 'SOLD_OUT',
          remaining_count: 0,
        },
      ],
    });
    render(<ListingAvailabilitySection listingId={3} />);
    expect(screen.getByText('Ընդամենը 2 սենյակ է մնացել')).toBeInTheDocument();
    expect(screen.getByText('Սպառված է')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Այս հայտարարության համար հասանելիության տվյալներ դեռ չկան։',
      ),
    ).not.toBeInTheDocument();
    // More than one unit — the day-status hook must never be called with
    // a resolved unitId, since a single blended count would be ambiguous.
    expect(useListingDayStatusQuery).toHaveBeenCalledWith(
      3,
      undefined,
      expect.any(Object),
    );
  });

  test('merges several same-type units (e.g. a car-rental fleet) into a single badge instead of one per unit', () => {
    // Regression test for the duplicate-badge bug: a listing with 3
    // interchangeable VEHICLE units previously rendered 3 visually
    // identical "Only 1 vehicles left" badges. They must collapse to one.
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ranges: [] },
      refetch: vi.fn(),
    });
    useListingAvailabilitySummaryQuery.mockReturnValue({
      data: [
        {
          unit_id: 89,
          bookable_unit_type: 'VEHICLE',
          availability_status: 'LOW',
          remaining_count: 1,
        },
        {
          unit_id: 90,
          bookable_unit_type: 'VEHICLE',
          availability_status: 'LOW',
          remaining_count: 1,
        },
        {
          unit_id: 91,
          bookable_unit_type: 'VEHICLE',
          availability_status: 'LOW',
          remaining_count: 1,
        },
      ],
    });
    render(<ListingAvailabilitySection listingId={86} />);
    expect(screen.getAllByText('Ընդամենը 3 մեքենա է մնացել')).toHaveLength(1);
  });

  // Calendar Excellence: between 00:00 and 04:00 in Yerevan the UTC date is
  // still yesterday; the window must start at the Yerevan date.
  test('the 30-day window starts at the Asia/Yerevan date, not the UTC one', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T20:30:00.000Z')); // 00:30 on 23 Oct
    try {
      useListingAvailabilityQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { ranges: [] },
        refetch: vi.fn(),
      });
      render(<ListingAvailabilitySection listingId={9} />);
      expect(useListingDayStatusQuery).toHaveBeenCalledWith(9, undefined, {
        from: '2026-10-23',
        to: '2026-11-21',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('renders a no-data message only when summary, day-status count, and ranges are all empty', () => {
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ranges: [] },
      refetch: vi.fn(),
    });
    render(<ListingAvailabilitySection listingId={9} />);
    expect(
      screen.getByText(
        'Այս հայտարարության համար հասանելիության տվյալներ դեռ չկան։',
      ),
    ).toBeInTheDocument();
  });
});
