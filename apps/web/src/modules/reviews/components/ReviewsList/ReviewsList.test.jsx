import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ReviewsList from './ReviewsList.jsx';
import { listListingReviews } from '../../../../api/reviews.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useReportReviewMutation } from '../../mutations/useReportReviewMutation.js';
import { useReplyToReviewMutation } from '../../mutations/useReplyToReviewMutation.js';
import { useDeleteReviewReplyMutation } from '../../mutations/useDeleteReviewReplyMutation.js';

vi.mock('../../../../api/reviews.js', () => ({
  listListingReviews: vi.fn(),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../../../contexts/ConfirmContext.jsx', () => ({
  useConfirm: vi.fn(),
}));
vi.mock('../../mutations/useReportReviewMutation.js', () => ({
  useReportReviewMutation: vi.fn(),
}));
vi.mock('../../mutations/useReplyToReviewMutation.js', () => ({
  useReplyToReviewMutation: vi.fn(),
}));
vi.mock('../../mutations/useDeleteReviewReplyMutation.js', () => ({
  useDeleteReviewReplyMutation: vi.fn(),
}));

function renderList(listingId = 3, companySlug = undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReviewsList listingId={listingId} companySlug={companySlug} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const REVIEW_ROW = {
  id: 1,
  customer_display_name: 'Anna K.',
  rating: 5,
  title: 'Wonderful stay',
  content: 'Everything was great.',
  vendor_response: null,
  created_at: '2026-07-01T10:00:00.000Z',
};

describe('ReviewsList (apps/web/src/modules/reviews)', () => {
  let reportMutateAsync;
  let replyMutateAsync;
  let deleteReplyMutateAsync;
  let confirmMock;

  beforeEach(() => {
    listListingReviews.mockReset();
    reportMutateAsync = vi.fn().mockResolvedValue({});
    replyMutateAsync = vi.fn().mockResolvedValue({});
    deleteReplyMutateAsync = vi.fn().mockResolvedValue({});
    confirmMock = vi.fn().mockResolvedValue(true);
    useAuth.mockReturnValue({ isAuthenticated: false, partnerships: [] });
    useConfirm.mockReturnValue(confirmMock);
    useReportReviewMutation.mockReturnValue({
      mutateAsync: reportMutateAsync,
      isPending: false,
    });
    useReplyToReviewMutation.mockReturnValue({
      mutateAsync: replyMutateAsync,
      isPending: false,
    });
    useDeleteReviewReplyMutation.mockReturnValue({
      mutateAsync: deleteReplyMutateAsync,
      isPending: false,
    });
  });

  test('shows an empty state when the listing has no reviews yet', async () => {
    listListingReviews.mockResolvedValue({
      data: [],
      meta: { has_more: false, rating_average: null, review_count: 0 },
    });
    renderList();
    expect(await screen.findByText('Կարծիքներ դեռ չկան')).toBeInTheDocument();
  });

  test('renders each review row on success — the caller owns the summary', async () => {
    listListingReviews.mockResolvedValue({
      data: [REVIEW_ROW],
      meta: { has_more: false, rating_average: 4.5, review_count: 3 },
    });
    renderList();

    expect(await screen.findByText('Anna K.')).toBeInTheDocument();
    expect(screen.getByText('Wonderful stay')).toBeInTheDocument();
    expect(screen.getByText('Everything was great.')).toBeInTheDocument();
    // `ListingReviewsSection` shows the one rating summary; never twice.
    expect(screen.queryByRole('img', { name: /4\.5/ })).not.toBeInTheDocument();
  });

  test('shows a retryable error state when the request fails', async () => {
    listListingReviews.mockRejectedValue(new Error('boom'));
    renderList();
    await waitFor(() =>
      expect(
        screen.getByText('Չհաջողվեց բեռնել կարծիքները։'),
      ).toBeInTheDocument(),
    );
  });

  test('renders a vendor response when present', async () => {
    listListingReviews.mockResolvedValue({
      data: [{ ...REVIEW_ROW, vendor_response: 'Thank you for staying!' }],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    renderList();

    expect(
      await screen.findByText('Thank you for staying!'),
    ).toBeInTheDocument();
  });

  test('a logged-out visitor sees no Report action', async () => {
    listListingReviews.mockResolvedValue({
      data: [REVIEW_ROW],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    renderList();

    await screen.findByText('Anna K.');
    expect(
      screen.queryByRole('button', { name: 'Հայտնել' }),
    ).not.toBeInTheDocument();
  });

  test('a signed-in visitor can report a review', async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, partnerships: [] });
    listListingReviews.mockResolvedValue({
      data: [REVIEW_ROW],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole('button', { name: 'Հայտնել' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել հայտնումը' }),
    );

    await waitFor(() => {
      expect(reportMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, reasonCode: 'SPAM' }),
      );
    });
  });

  test('a customer with no partnership sees no Reply action, even when authenticated', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      partnerships: [{ partner_id: 9, slug: 'other-company', role: 'OWNER' }],
    });
    listListingReviews.mockResolvedValue({
      data: [REVIEW_ROW],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    renderList(3, 'ararat-stays');

    await screen.findByText('Anna K.');
    expect(
      screen.queryByRole('button', { name: 'Պատասխանել' }),
    ).not.toBeInTheDocument();
  });

  test('a BOOKING_MANAGER of the owning partner sees no Reply action (below the required trust tier)', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      partnerships: [
        { partner_id: 42, slug: 'ararat-stays', role: 'BOOKING_MANAGER' },
      ],
    });
    listListingReviews.mockResolvedValue({
      data: [REVIEW_ROW],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    renderList(3, 'ararat-stays');

    await screen.findByText('Anna K.');
    expect(
      screen.queryByRole('button', { name: 'Պատասխանել' }),
    ).not.toBeInTheDocument();
  });

  test('an OWNER of the owning partner can post a reply', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      partnerships: [{ partner_id: 42, slug: 'ararat-stays', role: 'OWNER' }],
    });
    listListingReviews.mockResolvedValue({
      data: [REVIEW_ROW],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    const user = userEvent.setup();
    renderList(3, 'ararat-stays');

    await user.click(await screen.findByRole('button', { name: 'Պատասխանել' }));
    const textarea = screen.getByLabelText('Ձեր պատասխանը');
    await user.type(textarea, 'Thanks for staying with us!');
    await user.click(
      screen.getByRole('button', { name: 'Հրապարակել պատասխանը' }),
    );

    await waitFor(() => {
      expect(replyMutateAsync).toHaveBeenCalledWith({
        id: 1,
        response: 'Thanks for staying with us!',
      });
    });
  });

  test('a MANAGER of the owning partner can delete an existing reply after confirming', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      partnerships: [{ partner_id: 42, slug: 'ararat-stays', role: 'MANAGER' }],
    });
    listListingReviews.mockResolvedValue({
      data: [{ ...REVIEW_ROW, vendor_response: 'Thank you for staying!' }],
      meta: { has_more: false, rating_average: 5, review_count: 1 },
    });
    const user = userEvent.setup();
    renderList(3, 'ararat-stays');

    await user.click(
      await screen.findByRole('button', { name: 'Ջնջել պատասխանը' }),
    );

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled();
      expect(deleteReplyMutateAsync).toHaveBeenCalledWith(1);
    });
  });
});
