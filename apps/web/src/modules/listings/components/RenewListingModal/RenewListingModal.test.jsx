import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RenewListingModal from './RenewListingModal.jsx';
import { useRenewListingMutation } from '../../mutations/useRenewListingMutation.js';
import { PUBLICATION_PERIOD_DAYS_OPTIONS } from '../../constants/publicationPeriod.js';

vi.mock('../../mutations/useRenewListingMutation.js', () => ({
  useRenewListingMutation: vi.fn(),
}));

const ACTIVE_LISTING = { id: 7, publication_period_days: 90, frozen_at: null };
const FROZEN_LISTING = {
  id: 7,
  publication_period_days: 30,
  frozen_at: '2026-01-01T00:00:00.000Z',
};

function renderModal(overrides = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    listing: ACTIVE_LISTING,
    onRenewed: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <RenewListingModal
      isOpen={props.isOpen}
      onClose={props.onClose}
      listing={props.listing}
      onRenewed={props.onRenewed}
    />,
  );
  return { ...utils, props };
}

describe('RenewListingModal (PartnerListingsList)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: { id: 7 } });
    useRenewListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders exactly the 4 approved periods', () => {
    renderModal();
    const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(PUBLICATION_PERIOD_DAYS_OPTIONS.length);
  });

  test("preselects the listing's own current publication_period_days", () => {
    renderModal({ listing: ACTIVE_LISTING });
    const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
    const selected = within(group).getByRole('button', { pressed: true });
    expect(selected).toHaveTextContent('90');
  });

  test('selecting a different period and confirming sends that period to the mutation', async () => {
    const user = userEvent.setup();
    renderModal();
    const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
    await user.click(within(group).getByRole('button', { name: /365/ }));

    await user.click(
      screen.getByRole('button', { name: 'Հաստատել երկարաձգումը' }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 7,
        publicationPeriodDays: 365,
      }),
    );
  });

  test('a successful renewal calls onRenewed then onClose', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(
      screen.getByRole('button', { name: 'Հաստատել երկարաձգումը' }),
    );
    await waitFor(() =>
      expect(props.onRenewed).toHaveBeenCalledWith({ id: 7 }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  test('a readiness-failure (422) renders the itemized issues and never calls onRenewed', async () => {
    const user = userEvent.setup();
    mutateAsync = vi.fn().mockRejectedValue(
      Object.assign(new Error('Listing is not ready to renew.'), {
        details: [{ field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' }],
      }),
    );
    useRenewListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: {
        message: 'Listing is not ready to renew.',
        details: [{ field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' }],
      },
    });
    const { props } = renderModal({ listing: FROZEN_LISTING });

    expect(
      screen.getByText('Հրապարակելուց առաջ ավելացրեք առնվազն մեկ լուսանկար։'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Հաստատել երկարաձգումը' }),
    );
    expect(props.onRenewed).not.toHaveBeenCalled();
  });

  test('shows the frozen-specific description for a frozen listing', () => {
    renderModal({ listing: FROZEN_LISTING });
    expect(
      screen.getByText(
        'Այս հայտարարության ժամկետը լրացել է։ Ընտրեք նոր հրապարակման ժամկետ՝ այն վերականգնելու համար։',
      ),
    ).toBeInTheDocument();
  });

  test('cancel calls onClose without submitting', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Չեղարկել' }));
    expect(props.onClose).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
