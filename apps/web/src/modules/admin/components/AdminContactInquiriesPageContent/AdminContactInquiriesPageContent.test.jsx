import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import AdminContactInquiriesPageContent from './AdminContactInquiriesPageContent.jsx';
import {
  useAdminContactInquiriesQuery,
  useAdminContactInquiryDetailQuery,
  useResolveContactInquiryMutation,
} from '../../../contact/index.js';

vi.mock('../../../contact/index.js', () => ({
  useAdminContactInquiriesQuery: vi.fn(),
  useAdminContactInquiryDetailQuery: vi.fn(),
  useResolveContactInquiryMutation: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hy/admin/contact-inquiries']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/:locale/admin/contact-inquiries"
            element={<AdminContactInquiriesPageContent />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const INQUIRY = {
  id: 7,
  name: 'Ani Sargsyan',
  email: 'ani@example.test',
  subject: 'Question about a hotel booking',
  message: 'Is breakfast included?',
  type: 'BOOKING_SUPPORT',
  status: 'NEW',
  resolved_at: null,
  created_at: '2026-09-10T00:00:00.000Z',
  updated_at: '2026-09-10T00:00:00.000Z',
};

describe('AdminContactInquiriesPageContent (Sprint G)', () => {
  test('shows the empty state when there are no inquiries yet', () => {
    useAdminContactInquiriesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useAdminContactInquiryDetailQuery.mockReturnValue({ data: undefined });
    useResolveContactInquiryMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('Դեռ հարցումներ չկան')).toBeInTheDocument();
  });

  test('renders each inquiry row with subject, type, email, and status', () => {
    useAdminContactInquiriesQuery.mockReturnValue({
      data: [INQUIRY],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useAdminContactInquiryDetailQuery.mockReturnValue({ data: undefined });
    useResolveContactInquiryMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPage();
    expect(
      screen.getByText('Question about a hotel booking'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ամրագրում / հաճախորդների աջակցություն'),
    ).toBeInTheDocument();
    expect(screen.getByText('ani@example.test')).toBeInTheDocument();
    expect(screen.getByText('Նոր')).toBeInTheDocument();
  });

  test('clicking a row opens the detail modal and resolving calls the mutation', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useAdminContactInquiriesQuery.mockReturnValue({
      data: [INQUIRY],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useAdminContactInquiryDetailQuery.mockReturnValue({ data: INQUIRY });
    useResolveContactInquiryMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('Question about a hotel booking'));
    expect(screen.getByText('Is breakfast included?')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Նշել որպես լուծված' }),
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(7));
  });

  test('a RESOLVED inquiry does not show the resolve action', async () => {
    const resolvedInquiry = { ...INQUIRY, status: 'RESOLVED' };
    useAdminContactInquiriesQuery.mockReturnValue({
      data: [resolvedInquiry],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useAdminContactInquiryDetailQuery.mockReturnValue({
      data: resolvedInquiry,
    });
    useResolveContactInquiryMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('Question about a hotel booking'));
    expect(
      screen.queryByRole('button', { name: 'Նշել որպես լուծված' }),
    ).not.toBeInTheDocument();
  });
});
