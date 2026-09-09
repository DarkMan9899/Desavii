import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import AdminPromotionsPageContent from './AdminPromotionsPageContent.jsx';
import { useCategoriesQuery } from '../../../search/index.js';
import {
  usePlacementCatalogQuery,
  useAdvertisementsQuery,
  useCreateAdvertisementMutation,
  useMarkAdvertisementPaidMutation,
  useApproveAdvertisementMutation,
  useRejectAdvertisementMutation,
  useCancelAdvertisementMutation,
  useExtendAdvertisementMutation,
} from '../../../advertising/index.js';

vi.mock('../../../search/index.js', async () => {
  const actual = await vi.importActual('../../../search/index.js');
  return { ...actual, useCategoriesQuery: vi.fn() };
});

vi.mock('../../../advertising/index.js', async () => {
  const actual = await vi.importActual('../../../advertising/index.js');
  return {
    ...actual,
    usePlacementCatalogQuery: vi.fn(),
    useAdvertisementsQuery: vi.fn(),
    useCreateAdvertisementMutation: vi.fn(),
    useMarkAdvertisementPaidMutation: vi.fn(),
    useApproveAdvertisementMutation: vi.fn(),
    useRejectAdvertisementMutation: vi.fn(),
    useCancelAdvertisementMutation: vi.fn(),
    useExtendAdvertisementMutation: vi.fn(),
  };
});

const NOOP_MUTATION = {
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
};
const EMPTY_LIST_QUERY = {
  data: { pages: [{ results: [], meta: {} }] },
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};

const CATALOG = [
  {
    code: 'HOMEPAGE_SECTION',
    maxConcurrentSlots: 6,
    products: [
      {
        id: 5,
        name: 'HOMEPAGE_SECTION - 7 days',
        duration_days: 7,
        price_amount: '30000.00',
        currency_code: 'AMD',
      },
      {
        id: 8,
        name: 'HOMEPAGE_SECTION - Custom Period',
        duration_days: null,
        price_amount: '30000.00',
        currency_code: 'AMD',
      },
    ],
  },
  {
    code: 'CATEGORY_TOP',
    maxConcurrentSlots: 3,
    products: [
      {
        id: 9,
        name: 'CATEGORY_TOP - 7 days',
        duration_days: 7,
        price_amount: '20000.00',
        currency_code: 'AMD',
      },
    ],
  },
];

const HOME_AD = {
  id: 1,
  listing_id: 86,
  placement_code: 'HOMEPAGE_SECTION',
  status_code: 'ACTIVE',
  start_date: '2027-07-01',
  end_date: '2027-07-08',
  payment_marked_paid_at: '2027-07-01T00:00:00Z',
};

const AWAITING_PAYMENT_AD = {
  id: 2,
  listing_id: 90,
  placement_code: 'CATEGORY_TOP',
  status_code: 'AWAITING_OFFLINE_PAYMENT',
  start_date: '2027-08-01',
  end_date: '2027-08-08',
  payment_marked_paid_at: null,
};

function renderPage(initialEntries = ['/hy/admin/promotions']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route
              path="/:locale/admin/promotions"
              element={<AdminPromotionsPageContent />}
            />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('AdminPromotionsPageContent (Sprint E — Promotion Engine)', () => {
  beforeEach(() => {
    useCategoriesQuery.mockReturnValue({
      data: [{ id: 7, name: 'Car Rentals' }],
      isPending: false,
    });
    usePlacementCatalogQuery.mockReturnValue({
      data: CATALOG,
      isPending: false,
    });
    useAdvertisementsQuery.mockReturnValue(EMPTY_LIST_QUERY);
    useCreateAdvertisementMutation.mockReturnValue(NOOP_MUTATION);
    useMarkAdvertisementPaidMutation.mockReturnValue(NOOP_MUTATION);
    useApproveAdvertisementMutation.mockReturnValue(NOOP_MUTATION);
    useRejectAdvertisementMutation.mockReturnValue(NOOP_MUTATION);
    useCancelAdvertisementMutation.mockReturnValue(NOOP_MUTATION);
    useExtendAdvertisementMutation.mockReturnValue(NOOP_MUTATION);
  });

  test('shows the empty state when there are no promotions', () => {
    renderPage();
    expect(
      screen.getByText(
        'Ակտիվացրեք, երկարացրեք կամ դադարեցրեք հայտարարության Գլխավոր էջի կամ Կատեգորիայի առաջխաղացումը։',
      ),
    ).toBeInTheDocument();
  });

  test('renders each promotion row with its placement, status, and listing link', () => {
    useAdvertisementsQuery.mockReturnValue({
      ...EMPTY_LIST_QUERY,
      data: { pages: [{ results: [HOME_AD], meta: {} }] },
    });
    renderPage();
    expect(screen.getByRole('link', { name: '#86' })).toHaveAttribute(
      'href',
      '/hy/admin/listings/86',
    );
  });

  test('reads ?listingId= from the URL and filters the list by it', () => {
    renderPage(['/hy/admin/promotions?listingId=86']);
    expect(useAdvertisementsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 86 }),
    );
  });

  test('an AWAITING_OFFLINE_PAYMENT row shows Mark paid but not Approve; an ACTIVE row shows neither', () => {
    useAdvertisementsQuery.mockReturnValue({
      ...EMPTY_LIST_QUERY,
      data: { pages: [{ results: [HOME_AD, AWAITING_PAYMENT_AD], meta: {} }] },
    });
    renderPage();
    expect(
      screen.getAllByRole('button', { name: 'Նշել որպես վճարված' }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Հաստատել' }),
    ).not.toBeInTheDocument();
  });

  test('every open-status row offers Extend and End promotion', () => {
    useAdvertisementsQuery.mockReturnValue({
      ...EMPTY_LIST_QUERY,
      data: { pages: [{ results: [HOME_AD], meta: {} }] },
    });
    renderPage();
    expect(
      screen.getByRole('button', { name: 'Երկարացնել' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Դադարեցնել առաջխաղացումը' }),
    ).toBeInTheDocument();
  });

  test('opening the create dialog and picking CATEGORY_TOP reveals the category selector and requires it before submit', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Առաջխաղացնել հայտարարություն' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Ստեղծել առաջխաղացում' }),
    ).toBeInTheDocument();

    // The page's own filter Card also has a "Listing ID"/"Placement"
    // field with the identical translated label — every query below is
    // scoped to the modal dialog to disambiguate.
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', {
      name: 'Ստեղծել առաջխաղացում',
    });
    // Nothing entered yet (no listing id, no product) — disabled.
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Հայտարարության ID'), {
      target: { value: '86' },
    });
    // The custom `Select` primitive is a listbox, not a native <select> —
    // open it via its trigger (accessible name = the field's own label,
    // via aria-labelledby), then click the desired option, same pattern
    // `BasicInfoStep.test.jsx` already establishes for this component.
    await user.click(
      within(dialog).getByRole('button', { name: 'Տեղաբաշխում' }),
    );
    await user.click(within(dialog).getByRole('option', { name: 'Կատեգորիա' }));
    // A category is now required by CATEGORY_TOP but not yet chosen.
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Կատեգորիա' }));
    await user.click(
      within(dialog).getByRole('option', { name: 'Car Rentals' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Տևողություն / գին' }),
    );
    // The rendered option text is the translated
    // `productDurationLabel`/`productCustomLabel`, never the catalog
    // row's own internal `name` field.
    await user.click(
      within(dialog).getByRole('option', { name: '7 օր — 20000.00 AMD' }),
    );
    expect(submit).toBeEnabled();
  });

  test('submitting the create form calls the mutation with the entered fields', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    useCreateAdvertisementMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Առաջխաղացնել հայտարարություն' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Հայտարարության ID'), {
      target: { value: '86' },
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Տևողություն / գին' }),
    );
    await user.click(
      within(dialog).getByRole('option', { name: '7 օր — 30000.00 AMD' }),
    );

    await user.click(
      within(dialog).getByRole('button', { name: 'Ստեղծել առաջխաղացում' }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: 86,
          placementCode: 'HOMEPAGE_SECTION',
          productId: 5,
          markPaidNow: true,
        }),
      ),
    );
  });
});
