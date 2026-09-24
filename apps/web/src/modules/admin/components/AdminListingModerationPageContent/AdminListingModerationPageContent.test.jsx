import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import AdminListingModerationPageContent from './AdminListingModerationPageContent.jsx';
import { useAdminListingsQuery } from '../../queries/useAdminListingsQuery.js';
import { useUpdateListingModerationStatusMutation } from '../../mutations/useUpdateListingModerationStatusMutation.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';

vi.mock('../../queries/useAdminListingsQuery.js', () => ({
  useAdminListingsQuery: vi.fn(),
}));
vi.mock('../../mutations/useUpdateListingModerationStatusMutation.js', () => ({
  useUpdateListingModerationStatusMutation: vi.fn(),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

function listingFixture(overrides) {
  return {
    id: 1,
    title: 'Cozy Mountain Cabin',
    partner_id: 5,
    partner_display_name: 'Highland Experiences',
    status: 'PENDING_REVIEW',
    moderation_status: 'PENDING',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    frozen_at: null,
    purge_after: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hy/admin/listings']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route
              path="/:locale/admin/listings"
              element={<AdminListingModerationPageContent />}
            />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const noopQueryExtras = {
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

describe('AdminListingModerationPageContent (apps/web/src/modules/admin)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({});
    useUpdateListingModerationStatusMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      variables: undefined,
    });
    useAuth.mockReturnValue({ permissions: ['listing.moderate'] });
  });

  test('shows a retryable error state', async () => {
    const refetch = vi.fn();
    useAdminListingsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      ...noopQueryExtras,
      refetch,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Կրկին փորձել' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('renders real listing rows with title/partner/status/moderation', () => {
    useAdminListingsQuery.mockReturnValue({
      data: { pages: [{ results: [listingFixture()] }] },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    renderPage();

    expect(screen.getByText('Cozy Mountain Cabin')).toBeInTheDocument();
    expect(screen.getByText('Highland Experiences')).toBeInTheDocument();
    // Each appears twice: the row's own badge, and its filter Select's
    // current-value trigger (default filters are moderationStatus='',
    // status='PENDING_REVIEW' — see the "defaults the status filter" test
    // below — so only the status label, not moderation, duplicates here).
    expect(screen.getAllByText('Վերանայման սպասում')).toHaveLength(2);
    expect(screen.getByText('Սպասման մեջ')).toBeInTheDocument();
  });

  // Step M3 (brief §4): landing on the page defaults to the real
  // moderation queue (status=PENDING_REVIEW), not moderationStatus=PENDING
  // (which would also match never-submitted drafts).
  test('defaults the status filter to PENDING_REVIEW so the queue is the real M2B queue', () => {
    useAdminListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    renderPage();

    const lastCall =
      useAdminListingsQuery.mock.calls[
        useAdminListingsQuery.mock.calls.length - 1
      ][0];
    expect(lastCall.status).toBe('PENDING_REVIEW');
  });

  test('shows a lifecycle badge for a frozen listing, alongside its own status badge', () => {
    useAdminListingsQuery.mockReturnValue({
      data: {
        pages: [
          {
            results: [
              listingFixture({
                status: 'UNPUBLISHED',
                frozen_at: '2026-01-01T00:00:00Z',
                purge_after: '2026-07-01T00:00:00Z',
              }),
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    renderPage();

    expect(screen.getByText('Հանված հրապարակումից')).toBeInTheDocument();
    expect(screen.getByText('Ժամկետանց / Սառեցված')).toBeInTheDocument();
  });

  test('changing the lifecycle filter re-queries with the selected value', async () => {
    useAdminListingsQuery.mockReturnValue({
      data: { pages: [{ results: [listingFixture()] }] },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Կենսացիկլ' }));
    await user.click(
      screen.getByRole('option', { name: 'Ժամկետը մոտենում է' }),
    );

    const lastCall =
      useAdminListingsQuery.mock.calls[
        useAdminListingsQuery.mock.calls.length - 1
      ][0];
    expect(lastCall.lifecycleFilter).toBe('EXPIRING_SOON');
  });

  describe('permission gating (brief §5)', () => {
    test('a holder of listing.moderate sees the moderation action buttons', () => {
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      renderPage();

      expect(
        screen.getByRole('button', { name: 'Հաստատել' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Վերադարձնել ուղղումների համար' }),
      ).toBeInTheDocument();
    });

    test('a non-holder sees no moderation action buttons at all', () => {
      useAuth.mockReturnValue({ permissions: [] });
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      renderPage();

      expect(
        screen.queryByRole('button', { name: 'Հաստատել' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Վերադարձնել ուղղումների համար',
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe('invalid actions hidden (brief §9-10)', () => {
    test('a DRAFT row shows no moderation action at all', () => {
      useAdminListingsQuery.mockReturnValue({
        data: {
          pages: [{ results: [listingFixture({ status: 'DRAFT' })] }],
        },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      renderPage();

      expect(
        screen.queryByRole('button', { name: 'Հաստատել' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Նշագրել' }),
      ).not.toBeInTheDocument();
    });

    test('a PUBLISHED row shows Reject + Flag, never Approve/Return for changes', () => {
      useAdminListingsQuery.mockReturnValue({
        data: {
          pages: [{ results: [listingFixture({ status: 'PUBLISHED' })] }],
        },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      renderPage();

      expect(
        screen.getByRole('button', { name: 'Մերժել' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Նշագրել' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Հաստատել' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Վերադարձնել ուղղումների համար',
        }),
      ).not.toBeInTheDocument();
    });
  });

  test('approving a PENDING_REVIEW listing asks for confirmation, then calls the mutation with APPROVED', async () => {
    useAdminListingsQuery.mockReturnValue({
      data: { pages: [{ results: [listingFixture()] }] },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Հաստատել' }));
    expect(
      screen.getByText('Հաստատե՞լ «Cozy Mountain Cabin»-ը։'),
    ).toBeInTheDocument();

    const approveButtons = screen.getAllByRole('button', { name: 'Հաստատել' });
    await user.click(approveButtons[approveButtons.length - 1]);
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 1,
      status: 'APPROVED',
      notes: undefined,
    });
  });

  describe('Return for changes (brief §6/§8)', () => {
    test('requires a non-empty reason — the submit button is disabled until one is entered', async () => {
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(
        screen.getByRole('button', { name: 'Վերադարձնել ուղղումների համար' }),
      );
      expect(
        screen.getByText(
          'Վերադարձնե՞լ «Cozy Mountain Cabin»-ը ուղղումների համար։',
        ),
      ).toBeInTheDocument();

      const submitButtons = screen.getAllByRole('button', {
        name: 'Վերադարձնել ուղղումների համար',
      });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText('Պատճառը պարտադիր է։')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Պատճառ/), 'Missing photos');
      await user.click(submitButton);

      expect(mutateAsync).toHaveBeenCalledWith({
        id: 1,
        status: 'REJECTED',
        notes: 'Missing photos',
      });
    });

    test('trims leading/trailing whitespace from the reason', async () => {
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(
        screen.getByRole('button', { name: 'Վերադարձնել ուղղումների համար' }),
      );
      await user.type(screen.getByLabelText(/Պատճառ/), '  Missing photos  ');
      const submitButtons = screen.getAllByRole('button', {
        name: 'Վերադարձնել ուղղումների համար',
      });
      await user.click(submitButtons[submitButtons.length - 1]);

      expect(mutateAsync).toHaveBeenCalledWith({
        id: 1,
        status: 'REJECTED',
        notes: 'Missing photos',
      });
    });
  });

  test('flagging a PUBLISHED listing asks for confirmation (no reason), then calls the mutation with FLAGGED', async () => {
    useAdminListingsQuery.mockReturnValue({
      data: {
        pages: [{ results: [listingFixture({ status: 'PUBLISHED' })] }],
      },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Նշագրել' }));
    const flagButtons = screen.getAllByRole('button', { name: 'Նշագրել' });
    await user.click(flagButtons[flagButtons.length - 1]);

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 1,
      status: 'FLAGGED',
      notes: undefined,
    });
  });

  describe('error handling (brief §16)', () => {
    test('a 403 shows the permission-specific message', async () => {
      mutateAsync.mockRejectedValueOnce({ code: 'FORBIDDEN', status: 403 });
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Հաստատել' }));
      const approveButtons = screen.getAllByRole('button', {
        name: 'Հաստատել',
      });
      await user.click(approveButtons[approveButtons.length - 1]);

      expect(
        await screen.findByText(
          'Դուք իրավունք չունեք մոդերացնելու այս հայտարարությունը։',
        ),
      ).toBeInTheDocument();
    });

    test('a 409 conflict shows the stale-state message', async () => {
      mutateAsync.mockRejectedValueOnce({
        code: 'INVALID_MODERATION_TRANSITION',
        status: 409,
      });
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Հաստատել' }));
      const approveButtons = screen.getAllByRole('button', {
        name: 'Հաստատել',
      });
      await user.click(approveButtons[approveButtons.length - 1]);

      expect(
        await screen.findByText(
          'Այս հայտարարության կարգավիճակը փոփոխվել է այլ տեղից․ ցուցադրվում են վերջին տվյալները։',
        ),
      ).toBeInTheDocument();
    });

    test('a network failure shows the network-specific message', async () => {
      mutateAsync.mockRejectedValueOnce({ code: 'NETWORK_ERROR' });
      useAdminListingsQuery.mockReturnValue({
        data: { pages: [{ results: [listingFixture()] }] },
        isPending: false,
        isError: false,
        ...noopQueryExtras,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Հաստատել' }));
      const approveButtons = screen.getAllByRole('button', {
        name: 'Հաստատել',
      });
      await user.click(approveButtons[approveButtons.length - 1]);

      expect(
        await screen.findByText(
          'Հնարավոր չէ կապվել սերվերի հետ։ Ստուգեք կապակցումը և կրկին փորձեք։',
        ),
      ).toBeInTheDocument();
    });
  });

  test('actions are disabled while a mutation is pending, across every row', () => {
    useUpdateListingModerationStatusMutation.mockReturnValue({
      mutateAsync,
      isPending: true,
      variables: { id: 1, status: 'APPROVED' },
    });
    useAdminListingsQuery.mockReturnValue({
      data: {
        pages: [
          {
            results: [
              listingFixture({ id: 1 }),
              listingFixture({ id: 2, title: 'Second Listing' }),
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      ...noopQueryExtras,
    });
    renderPage();

    screen
      .getAllByRole('button', { name: 'Հաստատել' })
      .forEach((button) => expect(button).toBeDisabled());
  });
});
