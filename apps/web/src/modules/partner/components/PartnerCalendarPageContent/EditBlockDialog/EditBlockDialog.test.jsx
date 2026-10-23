import {
  describe,
  test,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import EditBlockDialog from './EditBlockDialog.jsx';
import { useUpdateInventoryBlockMutation } from '../../../../availability/index.js';

vi.mock('../../../../availability/index.js', async () => {
  const actual = await vi.importActual('../../../../availability/index.js');
  return { ...actual, useUpdateInventoryBlockMutation: vi.fn() };
});

const BLOCK = {
  id: 31,
  date_from: '2026-11-02',
  date_to: '2026-11-05',
  quantity: 2,
  reason_code: 'MAINTENANCE',
  notes: 'Painting',
};

function renderDialog() {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <EditBlockDialog
      block={BLOCK}
      listingId={4}
      bookableUnitType="HOTEL_ROOM"
      locale="en"
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onClose };
}

const save = (user) =>
  user.click(screen.getByRole('button', { name: 'Save changes' }));

describe('EditBlockDialog (apps/web/src/modules/partner)', () => {
  let mutateAsync;

  beforeAll(() => i18n.changeLanguage('en'));
  afterAll(() => i18n.changeLanguage('hy'));

  beforeEach(() => {
    mutateAsync = vi.fn();
    useUpdateInventoryBlockMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
  });

  test('opens on the block as it is and saves the full edit', async () => {
    mutateAsync.mockResolvedValue({ data: { id: BLOCK.id } });
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
    // 2 → 5 November in a hotel room: three nights.
    expect(
      screen.getByText('Takes 3 nights out of availability.'),
    ).toBeInTheDocument();
    const quantity = screen.getByLabelText(/Quantity to block/);
    expect(quantity).toHaveValue(2);

    await user.clear(quantity);
    await user.type(quantity, '1');
    await save(user);

    expect(mutateAsync).toHaveBeenCalledWith({
      id: BLOCK.id,
      dateFrom: '2026-11-02',
      dateTo: '2026-11-05',
      quantity: 1,
      reasonCode: 'MAINTENANCE',
      notes: 'Painting',
    });
    expect(onSaved).toHaveBeenCalled();
  });

  test('clearing the notes removes them', async () => {
    mutateAsync.mockResolvedValue({ data: { id: BLOCK.id } });
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Notes (optional)'));
    await save(user);

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ notes: undefined }),
    );
  });

  test('an invalid quantity is caught before anything is sent', async () => {
    const user = userEvent.setup();
    renderDialog();

    const quantity = screen.getByLabelText(/Quantity to block/);
    await user.clear(quantity);
    await user.type(quantity, '0');
    await save(user);

    expect(
      screen.getByText('Enter a whole number, at least 1.'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('dates that no longer fit are refused, explained, and the dialog stays open', async () => {
    mutateAsync.mockRejectedValue({
      status: 409,
      code: 'AVAILABILITY_CONFLICT',
    });
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    await save(user);

    expect(
      await screen.findByText(
        "The requested quantity isn't available for one or more of these dates.",
      ),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  });

  test('a block someone has just removed says so', async () => {
    mutateAsync.mockRejectedValue({ status: 409, code: 'ALREADY_RELEASED' });
    const user = userEvent.setup();
    renderDialog();

    await save(user);

    expect(
      await screen.findByText('This block has already been removed.'),
    ).toBeInTheDocument();
  });

  test('a range longer than the server allows is shown on the dates field', async () => {
    mutateAsync.mockRejectedValue({
      status: 422,
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'body.dateTo', issue: 'DATE_SPAN_TOO_LONG', maximum: 366 },
      ],
    });
    const user = userEvent.setup();
    renderDialog();

    await save(user);

    await waitFor(() =>
      expect(
        screen.getByText('Choose a range of at most 366 days.'),
      ).toBeInTheDocument(),
    );
  });
});
