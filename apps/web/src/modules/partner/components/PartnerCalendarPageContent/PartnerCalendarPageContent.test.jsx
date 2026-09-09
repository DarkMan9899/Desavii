import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import PartnerCalendarPageContent from './PartnerCalendarPageContent.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import {
  useMyListingsQuery,
  useListingCalendarQuery,
  useSetAvailabilityMutation,
} from '../../../listings/index.js';
import {
  useBookableUnitsQuery,
  useUnitBreakdownQuery,
  useUnitHoldsQuery,
  useInventoryBlocksQuery,
  useExternalReservationsQuery,
  useInventoryConnectionsQuery,
  useCreateInventoryBlockMutation,
  useReleaseInventoryBlockMutation,
  useCreateExternalReservationMutation,
  useCancelExternalReservationMutation,
} from '../../../availability/index.js';
import { useUnitBookingsQuery } from '../../../bookings/index.js';

vi.mock('../../../../contexts/PartnerContext.jsx', () => ({
  usePartnerContext: vi.fn(),
}));

vi.mock('../../../listings/index.js', async () => {
  const actual = await vi.importActual('../../../listings/index.js');
  return {
    ...actual,
    useMyListingsQuery: vi.fn(),
    useListingCalendarQuery: vi.fn(),
    useSetAvailabilityMutation: vi.fn(),
  };
});

vi.mock('../../../availability/index.js', async () => {
  const actual = await vi.importActual('../../../availability/index.js');
  return {
    ...actual,
    useBookableUnitsQuery: vi.fn(),
    useUnitBreakdownQuery: vi.fn(),
    useUnitHoldsQuery: vi.fn(),
    useInventoryBlocksQuery: vi.fn(),
    useExternalReservationsQuery: vi.fn(),
    useInventoryConnectionsQuery: vi.fn(),
    useCreateInventoryBlockMutation: vi.fn(),
    useReleaseInventoryBlockMutation: vi.fn(),
    useCreateExternalReservationMutation: vi.fn(),
    useCancelExternalReservationMutation: vi.fn(),
  };
});

vi.mock('../../../bookings/index.js', async () => {
  const actual = await vi.importActual('../../../bookings/index.js');
  return {
    ...actual,
    useUnitBookingsQuery: vi.fn(),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hy/partner/calendar']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route
              path="/:locale/partner/calendar"
              element={<PartnerCalendarPageContent />}
            />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const EMPTY_LIST_QUERY = { data: [], isPending: false, isError: false };
const NOOP_MUTATION = { mutateAsync: vi.fn(), isPending: false };

describe('PartnerCalendarPageContent (apps/web/src/modules/partner)', () => {
  let mutateAsync;

  beforeEach(() => {
    // OWNER bypasses the capability matrix entirely (roleHasCapability),
    // matching the real server-side rule — grants every action tab so
    // these tests exercise the full component, not a permission-gated
    // subset.
    usePartnerContext.mockReturnValue({
      activePartnerId: 3,
      activePartner: { role: 'OWNER' },
    });
    mutateAsync = vi.fn().mockResolvedValue({});
    useSetAvailabilityMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useUnitBreakdownQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useUnitHoldsQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useUnitBookingsQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useInventoryConnectionsQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useInventoryBlocksQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useExternalReservationsQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useCreateInventoryBlockMutation.mockReturnValue(NOOP_MUTATION);
    useReleaseInventoryBlockMutation.mockReturnValue(NOOP_MUTATION);
    useCreateExternalReservationMutation.mockReturnValue(NOOP_MUTATION);
    useCancelExternalReservationMutation.mockReturnValue(NOOP_MUTATION);
  });

  test('shows an empty state when the partner has no listings', () => {
    useMyListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
    });
    useBookableUnitsQuery.mockReturnValue({ data: [], isPending: false });
    useListingCalendarQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText('Հայտարարություններ դեռ չկան')).toBeInTheDocument();
  });

  test('shows a "no units" empty state when the selected listing has none', () => {
    useMyListingsQuery.mockReturnValue({
      data: {
        pages: [
          { results: [{ id: 1, title: 'Seaside Villa', status: 'PUBLISHED' }] },
        ],
      },
      isPending: false,
    });
    useBookableUnitsQuery.mockReturnValue({ data: [], isPending: false });
    useListingCalendarQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderPage();
    expect(
      screen.getByText('Այս հայտարարությունը չունի ամրագրվող միավորներ'),
    ).toBeInTheDocument();
  });

  test('renders the calendar grid once a unit is available', () => {
    useMyListingsQuery.mockReturnValue({
      data: {
        pages: [
          { results: [{ id: 1, title: 'Seaside Villa', status: 'PUBLISHED' }] },
        ],
      },
      isPending: false,
    });
    useBookableUnitsQuery.mockReturnValue({
      data: [{ id: 5, bookable_unit_type: 'PROPERTY_UNIT' }],
      isPending: false,
    });
    useListingCalendarQuery.mockReturnValue({
      data: [{ date: '2026-07-01', status: 'BLOCKED' }],
      isPending: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(useListingCalendarQuery).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
  });

  test('selecting a date range shows the apply form; applying calls the mutation and toasts success', async () => {
    useMyListingsQuery.mockReturnValue({
      data: {
        pages: [
          { results: [{ id: 1, title: 'Seaside Villa', status: 'PUBLISHED' }] },
        ],
      },
      isPending: false,
    });
    useBookableUnitsQuery.mockReturnValue({
      data: [{ id: 5, bookable_unit_type: 'PROPERTY_UNIT' }],
      isPending: false,
    });
    useListingCalendarQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderPage();

    const cells = screen.getAllByRole('gridcell', { name: /2026/ });
    const firstEnabledCell = cells.find(
      (cell) => !cell.hasAttribute('disabled'),
    );
    await user.click(firstEnabledCell);

    expect(screen.getByRole('button', { name: 'Կիրառել' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Կիրառել' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 5, status: 'AVAILABLE' }),
      ),
    );
    expect(
      await screen.findByText('Հասանելիությունը թարմացվել է։'),
    ).toBeInTheDocument();
  });

  test('typing a custom block quantity and notes sends the typed values, not the change event', async () => {
    useMyListingsQuery.mockReturnValue({
      data: {
        pages: [
          { results: [{ id: 1, title: 'Seaside Villa', status: 'PUBLISHED' }] },
        ],
      },
      isPending: false,
    });
    useBookableUnitsQuery.mockReturnValue({
      data: [{ id: 5, bookable_unit_type: 'PROPERTY_UNIT' }],
      isPending: false,
    });
    useListingCalendarQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    const createBlock = vi.fn().mockResolvedValue({});
    useCreateInventoryBlockMutation.mockReturnValue({
      mutateAsync: createBlock,
      isPending: false,
    });
    const user = userEvent.setup();
    renderPage();

    const cells = screen.getAllByRole('gridcell', { name: /2026/ });
    const firstEnabledCell = cells.find(
      (cell) => !cell.hasAttribute('disabled'),
    );
    await user.click(firstEnabledCell);
    await user.click(screen.getByRole('tab', { name: /Արգելափակել/ }));

    const quantityInput = screen.getByLabelText('Արգելափակվող քանակ');
    await user.clear(quantityInput);
    await user.type(quantityInput, '3');
    const notesInput = screen.getByLabelText('Նշումներ (ընտրովի)');
    await user.type(notesInput, 'Roof repair');

    await user.click(screen.getByRole('button', { name: 'Արգելափակել' }));

    await waitFor(() =>
      expect(createBlock).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3, notes: 'Roof repair' }),
      ),
    );
  });

  describe('Week/Day views (Sprint 5 P0 — real intraday scheduling)', () => {
    test('a date-only unit (no time_slot_start) shows a date-only Week strip — never a fake hour grid', async () => {
      useMyListingsQuery.mockReturnValue({
        data: {
          pages: [
            {
              results: [
                { id: 1, title: 'Boutique Hotel', status: 'PUBLISHED' },
              ],
            },
          ],
        },
        isPending: false,
      });
      useBookableUnitsQuery.mockReturnValue({
        data: [
          {
            id: 5,
            bookable_unit_type: 'HOTEL_ROOM',
            unit_label: 'Standard Room',
            time_slot_start: null,
            time_slot_end: null,
          },
        ],
        isPending: false,
      });
      useListingCalendarQuery.mockReturnValue({
        data: [],
        isPending: false,
        isError: false,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('tab', { name: 'Շաբաթ' }));

      expect(screen.queryByText('06:00')).not.toBeInTheDocument();
      // prev/next week nav (2) + 7 plain date-cell buttons, never an
      // hour-axis timeline, for a unit whose own `time_slot_start` is null.
      const weekTabpanel = screen.getByRole('tabpanel', { name: 'Շաբաթ' });
      const buttons = within(weekTabpanel).getAllByRole('button');
      expect(buttons).toHaveLength(9);
    });

    test('a time-sliced unit (time_slot_start set) shows a real hour-axis Week grid with a block per sibling departure', async () => {
      useMyListingsQuery.mockReturnValue({
        data: {
          pages: [
            {
              results: [
                { id: 1, title: 'Dilijan Trail Tour', status: 'PUBLISHED' },
              ],
            },
          ],
        },
        isPending: false,
      });
      useBookableUnitsQuery.mockReturnValue({
        data: [
          {
            id: 10,
            bookable_unit_type: 'TOUR_DEPARTURE',
            unit_label: 'Morning Departure',
            time_slot_start: '09:00:00',
            time_slot_end: '13:00:00',
          },
          {
            id: 11,
            bookable_unit_type: 'TOUR_DEPARTURE',
            unit_label: 'Afternoon Departure',
            time_slot_start: '14:00:00',
            time_slot_end: '18:00:00',
          },
        ],
        isPending: false,
      });
      useListingCalendarQuery.mockReturnValue({
        data: [],
        isPending: false,
        isError: false,
      });
      useUnitBreakdownQuery.mockReturnValue({
        data: [
          {
            date: '2026-09-03',
            total: 12,
            available: 12,
            confirmed: 0,
            held: 0,
            external: 0,
            manual: 0,
          },
        ],
        isPending: false,
        isError: false,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('tab', { name: 'Շաբաթ' }));

      expect(screen.getByText('06:00')).toBeInTheDocument();
      expect(screen.getByText('23:00')).toBeInTheDocument();
      // One resource-picker pill + one TimeSlotBlock per day of the week (7).
      expect(screen.getAllByText('Morning Departure')).toHaveLength(8);
      expect(screen.getAllByText('Afternoon Departure')).toHaveLength(8);
    });

    test('a date-only unit Day view shows a plain single-day summary, not an hour timeline', async () => {
      useMyListingsQuery.mockReturnValue({
        data: {
          pages: [
            {
              results: [
                { id: 1, title: 'Ararat Valley Fleet', status: 'PUBLISHED' },
              ],
            },
          ],
        },
        isPending: false,
      });
      useBookableUnitsQuery.mockReturnValue({
        data: [
          {
            id: 20,
            bookable_unit_type: 'VEHICLE',
            unit_label: 'Toyota RAV4',
            time_slot_start: null,
            time_slot_end: null,
          },
        ],
        isPending: false,
      });
      useListingCalendarQuery.mockReturnValue({
        data: [],
        isPending: false,
        isError: false,
      });
      useUnitBreakdownQuery.mockReturnValue({
        data: [
          {
            date: '2026-09-03',
            total: 1,
            available: 1,
            confirmed: 0,
            held: 0,
            external: 0,
            manual: 0,
          },
        ],
        isPending: false,
        isError: false,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('tab', { name: 'Օր' }));

      expect(screen.queryByText('06:00')).not.toBeInTheDocument();
      expect(screen.getByText(/1 ընդամենը/)).toBeInTheDocument();
    });
  });
});
