import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import PartnerApplicationPageContent from './PartnerApplicationPageContent.jsx';
import * as partnersApi from '../../../../api/partners.js';

vi.mock('../../../../api/partners.js', () => ({
  getMyApplications: vi.fn(),
  getPartnerApplication: vi.fn(),
  createPartnerApplication: vi.fn(),
  updatePartnerApplication: vi.fn(),
  submitPartnerApplication: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/partner/apply']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/partner/apply"
              element={<PartnerApplicationPageContent />}
            />
            <Route
              path="/:locale/partner"
              element={<div>Partner Dashboard</div>}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PartnerApplicationPageContent (apps/web/src/modules/partner-onboarding)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows the create form for a first-time applicant', async () => {
    partnersApi.getMyApplications.mockResolvedValue({ data: [] });
    renderPage();

    expect(
      await screen.findByLabelText(/Հանրային բիզնես անվանում/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Պահպանել սևագիրը' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել վերանայման' }),
    ).toBeInTheDocument();
  });

  test('offers a new application after every prior one was rejected', async () => {
    partnersApi.getMyApplications.mockResolvedValue({
      data: [
        {
          partner_id: 1,
          slug: 'old-co',
          display_name: 'Old Co',
          role: 'OWNER',
          verification_status: 'REJECTED',
        },
      ],
    });
    renderPage();

    expect(
      await screen.findByLabelText(/Հանրային բիզնես անվանում/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ձեր նախորդ հայտը չի հաստատվել։ Կարող եք ներկայացնել նոր հայտ ստորև։',
      ),
    ).toBeInTheDocument();
  });

  test('shows the editable draft view when an in-progress application exists', async () => {
    partnersApi.getMyApplications.mockResolvedValue({
      data: [
        {
          partner_id: 2,
          slug: 'sunrise-tours',
          display_name: 'Sunrise Tours',
          role: 'OWNER',
          verification_status: 'DRAFT',
        },
      ],
    });
    partnersApi.getPartnerApplication.mockResolvedValue({
      data: {
        id: 2,
        slug: 'sunrise-tours',
        display_name: 'Sunrise Tours',
        legal_name: '',
        email: '',
        phone: '',
        website: '',
        description: '',
        verification_status: 'DRAFT',
        review_note: null,
      },
    });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Պահպանել սևագիրը' }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sunrise Tours')).toBeInTheDocument();
  });

  test('is read-only and shows a notice while PENDING', async () => {
    partnersApi.getMyApplications.mockResolvedValue({
      data: [
        {
          partner_id: 3,
          slug: 'ararat-adventures',
          display_name: 'Ararat Adventures',
          role: 'OWNER',
          verification_status: 'PENDING',
        },
      ],
    });
    partnersApi.getPartnerApplication.mockResolvedValue({
      data: {
        id: 3,
        slug: 'ararat-adventures',
        display_name: 'Ararat Adventures',
        legal_name: 'Ararat Adventures LLC',
        email: 'contact@ararat.example',
        phone: '+37400000000',
        website: '',
        description: '',
        verification_status: 'PENDING',
        review_note: null,
      },
    });
    renderPage();

    expect(
      await screen.findByText(
        'Ձեր հայտը գտնվում է վերանայման փուլում։ Կտեղեկացնենք որոշման կայացումից անմիջապես հետո։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Պահպանել սևագիրը' }),
    ).not.toBeInTheDocument();
    // The pending notice comes from useMyApplicationsQuery (the first,
    // outer query) and is already visible by the time the `await
    // findByText` above resolves. The form itself - including this field
    // - only renders once the second, sequential useApplicationQuery
    // (gated behind `enabled: Boolean(inProgressSummary)`, so it can't
    // even start until the first query resolves) finishes too; it's
    // rendered behind a Skeleton until then. A synchronous getByLabelText
    // right after the notice appears races that second query - this
    // await is what the real component's own async data flow requires.
    const businessNameInput = await screen.findByLabelText(
      /Հանրային բիզնես անվանում/,
    );
    expect(businessNameInput).toBeDisabled();
  });

  test('shows the admin review note while NEEDS_CHANGES and allows resubmission', async () => {
    partnersApi.getMyApplications.mockResolvedValue({
      data: [
        {
          partner_id: 4,
          slug: 'dilijan-cabins',
          display_name: 'Dilijan Cabins',
          role: 'OWNER',
          verification_status: 'NEEDS_CHANGES',
        },
      ],
    });
    partnersApi.getPartnerApplication.mockResolvedValue({
      data: {
        id: 4,
        slug: 'dilijan-cabins',
        display_name: 'Dilijan Cabins',
        legal_name: 'Dilijan Cabins LLC',
        email: 'contact@dilijan.example',
        phone: '+37400000001',
        website: '',
        description: '',
        verification_status: 'NEEDS_CHANGES',
        review_note: 'Please add a valid business phone number.',
      },
    });
    renderPage();

    expect(
      await screen.findByText('Please add a valid business phone number.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել վերանայման' }),
    ).toBeEnabled();
  });

  test('redirects to the partner dashboard once approved with nothing in progress', async () => {
    partnersApi.getMyApplications.mockResolvedValue({
      data: [
        {
          partner_id: 5,
          slug: 'yerevan-hosts',
          display_name: 'Yerevan Hosts',
          role: 'OWNER',
          verification_status: 'APPROVED',
        },
      ],
    });
    renderPage();

    expect(await screen.findByText('Partner Dashboard')).toBeInTheDocument();
  });

  test('submitting the create form creates the application then submits it for review', async () => {
    const user = userEvent.setup();
    partnersApi.getMyApplications.mockResolvedValue({ data: [] });
    partnersApi.createPartnerApplication.mockResolvedValue({
      data: { id: 9, display_name: 'New Co' },
    });
    partnersApi.submitPartnerApplication.mockResolvedValue({ data: {} });
    renderPage();

    await screen.findByLabelText(/Հանրային բիզնես անվանում/);
    await user.type(
      screen.getByLabelText(/Հանրային բիզնես անվանում/),
      'New Co',
    );
    await user.type(
      screen.getByLabelText('Իրավաբանական անվանում'),
      'New Co LLC',
    );
    await user.type(
      screen.getByLabelText('Բիզնես էլ. փոստ'),
      'contact@newco.example',
    );
    await user.type(screen.getByLabelText('Բիզնես հեռախոս'), '+37400000002');

    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել վերանայման' }),
    );

    await waitFor(() => {
      expect(partnersApi.createPartnerApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'New Co',
          legalName: 'New Co LLC',
          email: 'contact@newco.example',
          phone: '+37400000002',
        }),
      );
    });
    await waitFor(() => {
      expect(partnersApi.submitPartnerApplication).toHaveBeenCalledWith(9);
    });
  });
});
