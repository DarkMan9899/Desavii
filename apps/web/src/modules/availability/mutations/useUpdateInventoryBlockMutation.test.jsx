import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateInventoryBlockMutation } from './useUpdateInventoryBlockMutation.js';
import { updateInventoryBlock } from '../../../api/availability.js';
import availabilityKeys from '../constants/queryKeys.js';

vi.mock('../../../api/availability.js', () => ({
  updateInventoryBlock: vi.fn(),
}));

const LISTING_ID = 4;
const EDIT = {
  id: 31,
  dateFrom: '2026-11-02',
  dateTo: '2026-11-05',
  quantity: 2,
  reasonCode: 'OWNER_USE',
};

function Harness() {
  const { mutate, isSuccess } = useUpdateInventoryBlockMutation(LISTING_ID);
  return (
    <div>
      <button type="button" onClick={() => mutate(EDIT)}>
        save
      </button>
      <p data-testid="status">{isSuccess ? 'success' : 'idle'}</p>
    </div>
  );
}

describe('useUpdateInventoryBlockMutation (apps/web/src/modules/availability)', () => {
  let queryClient;

  beforeEach(() => {
    updateInventoryBlock.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  test('sends the edit for the block id and refreshes every view the block touches', async () => {
    updateInventoryBlock.mockResolvedValue({ data: { id: EDIT.id } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );

    const { id, ...payload } = EDIT;
    expect(updateInventoryBlock).toHaveBeenCalledWith(id, payload);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: availabilityKeys.blocks(LISTING_ID),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...availabilityKeys.all, 'breakdown'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...availabilityKeys.all, 'ledger'],
    });
  });

  test('a refused edit leaves every cached view untouched', async () => {
    updateInventoryBlock.mockRejectedValue({ code: 'AVAILABILITY_CONFLICT' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(updateInventoryBlock).toHaveBeenCalled());
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
