import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import PartnerListingsList from './PartnerListingsList.jsx';
import {
  usePublishListingMutation,
  useUnpublishListingMutation,
  useArchiveListingMutation,
  useDeleteListingMutation,
} from '../../../listings/index.js';

// `resolvePresentationGroup`/`PRESENTATION_GROUPS` are real, pure domain
// logic (no hooks, no side effects) reused as-is here — mirrors the real
// `categoryPresentation.js` mapping exactly (P2.2A: this is the
// "accommodation-only Manage Rooms" gate's actual condition under test).
// Shared by both `PartnerListingsList.jsx` and (2026 Partner Workspace
// redesign) the extracted `PartnerListingRowActions.jsx`, which imports
// the same `../../../listings/index.js` module path — one mock covers
// both, since vi.mock keys off the resolved module, not the literal
// specifier string.
vi.mock('../../../listings/index.js', () => {
  function MockListingStatusBadge({ status }) {
    return <span>{status}</span>;
  }
  MockListingStatusBadge.propTypes = { status: PropTypes.string.isRequired };
  // Listing Lifetime / Renewal, Step B5 — none of this file's existing
  // fixtures carry an `expires_at`, so the real `isRenewEligible` would
  // already return false for every one of them (the LEGACY branch); this
  // stub keeps that same "no Renew button in these tests" behavior
  // explicit rather than depending on fixture shape.
  function MockListingLifecycleStatus() {
    return null;
  }
  function MockRenewListingModal() {
    return null;
  }
  const PRESENTATION_GROUPS = Object.freeze({
    ACCOMMODATION: 'ACCOMMODATION',
    EXPERIENCE: 'EXPERIENCE',
    TRANSPORT: 'TRANSPORT',
    GENERIC: 'GENERIC',
  });
  const GROUP_BY_LISTING_TYPE = {
    HOTEL: PRESENTATION_GROUPS.ACCOMMODATION,
    PROPERTY: PRESENTATION_GROUPS.ACCOMMODATION,
    TOUR: PRESENTATION_GROUPS.EXPERIENCE,
    ATTRACTION: PRESENTATION_GROUPS.EXPERIENCE,
    CAR_RENTAL: PRESENTATION_GROUPS.TRANSPORT,
  };
  return {
    usePublishListingMutation: vi.fn(),
    useUnpublishListingMutation: vi.fn(),
    useArchiveListingMutation: vi.fn(),
    useDeleteListingMutation: vi.fn(),
    ListingStatusBadge: MockListingStatusBadge,
    ListingLifecycleStatus: MockListingLifecycleStatus,
    RenewListingModal: MockRenewListingModal,
    isRenewEligible: () => false,
    PRESENTATION_GROUPS,
    resolvePresentationGroup: (code) =>
      GROUP_BY_LISTING_TYPE[code] ?? PRESENTATION_GROUPS.GENERIC,
    // Listing Lifetime / Renewal, Step B3: the dashboard's quick "Publish"
    // action has no period-picker UI of its own, so it always sends this
    // same real default.
    DEFAULT_PUBLICATION_PERIOD_DAYS: 90,
  };
});

const MORE_ACTIONS_LABEL = 'Լրացուցիչ գործողություններ';

// 2026 Partner Workspace redesign: Publish/Unpublish/Archive/Delete/
// Manage rooms now live behind a "More actions" overflow menu
// (`PartnerListingRowActions`) instead of being directly visible
// buttons — opens the given row's menu (0-indexed among however many
// "More actions" triggers are currently rendered) before a test can see
// its `role="menuitem"` entries.
async function openMoreMenu(user, index = 0) {
  const triggers = screen.getAllByRole('button', { name: MORE_ACTIONS_LABEL });
  await user.click(triggers[index]);
}

function listingFixture(overrides) {
  return {
    id: 1,
    title: 'Seaside Villa',
    slug: 'seaside-villa',
    listing_type: 'PROPERTY',
    status: 'DRAFT',
    cover_image_url: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

// Step L1: probes wherever `onEdit`'s `navigate()` actually lands, since
// there's no real wizard route mounted in this test — a plain
// `<Route path="*">` catch-all reading `useLocation` is enough to assert
// the resulting URL without needing to render the real wizard.
function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderList({
  listings = [],
  isPending = false,
  isError = false,
  onRetry = vi.fn(),
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore = vi.fn(),
} = {}) {
  return render(
    <MemoryRouter initialEntries={['/hy/partner/listings']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route
              path="/:locale/partner/listings"
              element={
                <PartnerListingsList
                  listings={listings}
                  isPending={isPending}
                  isError={isError}
                  onRetry={onRetry}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  onLoadMore={onLoadMore}
                />
              }
            />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const noop = { isPending: false, variables: undefined };

describe('PartnerListingsList (apps/web/src/modules/partner)', () => {
  let publishMutateAsync;
  let unpublishMutateAsync;
  let archiveMutateAsync;
  let deleteMutateAsync;

  beforeEach(() => {
    publishMutateAsync = vi.fn().mockResolvedValue({});
    unpublishMutateAsync = vi.fn().mockResolvedValue({});
    archiveMutateAsync = vi.fn().mockResolvedValue({});
    deleteMutateAsync = vi.fn().mockResolvedValue({});
    usePublishListingMutation.mockReturnValue({
      ...noop,
      mutateAsync: publishMutateAsync,
    });
    useUnpublishListingMutation.mockReturnValue({
      ...noop,
      mutateAsync: unpublishMutateAsync,
    });
    useArchiveListingMutation.mockReturnValue({
      ...noop,
      mutateAsync: archiveMutateAsync,
    });
    useDeleteListingMutation.mockReturnValue({
      ...noop,
      mutateAsync: deleteMutateAsync,
    });
  });

  test('shows skeleton placeholders while pending', () => {
    renderList({
      listings: [],
      isPending: true,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.queryByText('Seaside Villa')).not.toBeInTheDocument();
  });

  test('shows a retryable error state', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderList({
      listings: [],
      isPending: false,
      isError: true,
      onRetry,
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await user.click(screen.getByRole('button', { name: 'Կրկին փորձել' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('shows an empty state when there are no listings', () => {
    renderList({
      listings: [],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(
      screen.getByText('Ձեր ֆիլտրերին համապատասխան հայտարարություններ չկան'),
    ).toBeInTheDocument();
  });

  test('shows View and Edit as always-visible buttons, not behind the overflow menu', () => {
    renderList({
      listings: [listingFixture()],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Դիտել' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Խմբագրել' }),
    ).toBeInTheDocument();
  });

  // Step L1 (brief §5): omitting `step=` here made the wizard fall back
  // to the Category step for every existing listing, regardless of
  // progress (L0's #1 finding) — Edit must resume at Basic Information,
  // never at the now-fixed Category step.
  test('Edit navigates to the wizard at step=basicInfo, never a bare listingId with no step', async () => {
    const user = userEvent.setup();
    renderList({ listings: [listingFixture({ id: 9 })] });

    await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/hy/partner/listings/new',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('listingId=9');
    expect(screen.getByTestId('location')).toHaveTextContent('step=basicInfo');
  });

  test('the overflow menu shows Publish for a DRAFT listing and not Unpublish', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ status: 'DRAFT' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    expect(
      screen.getByRole('menuitem', { name: 'Հրապարակել' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Հանել հրապարակումից' }),
    ).not.toBeInTheDocument();
  });

  test('the overflow menu shows Unpublish and Archive for a PUBLISHED listing and not Publish', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ status: 'PUBLISHED' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    expect(
      screen.getByRole('menuitem', { name: 'Հանել հրապարակումից' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Արխիվացնել' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Հրապարակել' }),
    ).not.toBeInTheDocument();
  });

  test('the overflow menu shows neither Publish/Unpublish/Archive for an ARCHIVED listing, only Delete', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ status: 'ARCHIVED' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    expect(
      screen.queryByRole('menuitem', { name: 'Հրապարակել' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Հանել հրապարակումից' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Արխիվացնել' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ջնջել' })).toBeInTheDocument();
  });

  test('publishing (from the overflow menu) calls the mutation and shows a success toast', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ id: 5, status: 'DRAFT' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Հրապարակել' }));
    await waitFor(() =>
      expect(publishMutateAsync).toHaveBeenCalledWith({
        id: 5,
        publicationPeriodDays: 90,
      }),
    );
    expect(
      await screen.findByText('Ձեր հայտարարությունը հրապարակվել է։'),
    ).toBeInTheDocument();
  });

  test('a failed publish shows the server error message as a toast', async () => {
    publishMutateAsync.mockRejectedValue({
      message: 'Add at least one photo before publishing.',
    });
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ id: 5, status: 'DRAFT' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Հրապարակել' }));
    expect(
      await screen.findByText('Add at least one photo before publishing.'),
    ).toBeInTheDocument();
  });

  test('archiving (from the overflow menu) requires confirmation, then calls the mutation and shows a success toast', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ id: 9, status: 'PUBLISHED' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Արխիվացնել' }));
    expect(archiveMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Այո, արխիվացնել' }));
    await waitFor(() => expect(archiveMutateAsync).toHaveBeenCalledWith(9));
    expect(
      await screen.findByText('Հայտարարությունը արխիվացվել է։'),
    ).toBeInTheDocument();
  });

  test('deleting (from the overflow menu) requires confirmation, then calls the mutation and shows a success toast', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [listingFixture({ id: 3, status: 'PUBLISHED' })],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    await openMoreMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Ջնջել' }));
    expect(deleteMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Այո, ջնջել' }));
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith(3));
    expect(
      await screen.findByText('Հայտարարությունը ջնջվել է։'),
    ).toBeInTheDocument();
  });

  // P2.2A: "Manage rooms" reuses bookable_units, a generic mechanism
  // every listing_type technically has — but the label/action only
  // makes sense for accommodation. Confirms the fix survives the 2026
  // redesign's move into each row's own overflow menu. Each row owns
  // independent open state, but Popover's own click-outside handling
  // closes a row's menu the moment another row's trigger is clicked
  // (a real, correct dropdown behaviour, not a test artifact) — so this
  // checks one row's menu at a time rather than opening all five at
  // once.
  test('the overflow menu offers Manage rooms for HOTEL and PROPERTY, not for TOUR/CAR_RENTAL/ATTRACTION', async () => {
    const user = userEvent.setup();
    renderList({
      listings: [
        listingFixture({ id: 1, listing_type: 'HOTEL' }),
        listingFixture({ id: 2, listing_type: 'PROPERTY' }),
        listingFixture({ id: 3, listing_type: 'TOUR' }),
        listingFixture({ id: 4, listing_type: 'CAR_RENTAL' }),
        listingFixture({ id: 5, listing_type: 'ATTRACTION' }),
      ],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    const expectedByIndex = [true, true, false, false, false];
    for (let index = 0; index < expectedByIndex.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await openMoreMenu(user, index);
      if (expectedByIndex[index]) {
        expect(
          screen.getByRole('menuitem', { name: 'Կառավարել սենյակները' }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole('menuitem', { name: 'Կառավարել սենյակները' }),
        ).not.toBeInTheDocument();
      }
    }
  });

  test('renders a Load More button when hasNextPage is true', () => {
    renderList({
      listings: [listingFixture()],
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(
      screen.getByRole('button', { name: 'Բեռնել ավելին' }),
    ).toBeInTheDocument();
  });
});
