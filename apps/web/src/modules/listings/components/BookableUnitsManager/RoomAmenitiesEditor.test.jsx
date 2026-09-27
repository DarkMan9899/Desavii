import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RoomAmenitiesEditor from './RoomAmenitiesEditor.jsx';
import { useListingMetadataQuery } from '../../queries/useListingMetadataQuery.js';
import { useReplaceBookableUnitAmenitiesMutation } from '../../../availability/index.js';

vi.mock('../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../../availability/index.js', () => ({
  useReplaceBookableUnitAmenitiesMutation: vi.fn(),
}));

const METADATA = {
  amenity_groups: [
    {
      code: 'IN_ROOM',
      amenities: [
        { value: 27, code: 'Minibar' },
        { value: 28, code: 'TV' },
      ],
    },
  ],
  amenity_catalog: [
    { value: 26, code: 'Live Music' },
    { value: 27, code: 'Minibar' },
    { value: 28, code: 'TV' },
  ],
};

function renderEditor(amenityIds) {
  return render(
    <MemoryRouter>
      <RoomAmenitiesEditor
        unitId={5}
        listingId={7}
        categoryId={1}
        amenityIds={amenityIds}
      />
    </MemoryRouter>,
  );
}

describe('RoomAmenitiesEditor', () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn();
    useReplaceBookableUnitAmenitiesMutation.mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    });
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: METADATA,
    });
  });

  test("lists the parent category's amenities and saves the selection", async () => {
    const user = userEvent.setup();
    renderEditor([27]);
    expect(screen.getByLabelText('Minibar')).toBeChecked();

    await user.click(screen.getByLabelText('TV'));
    await user.click(screen.getByRole('button', { name: /Պահպանել/ }));

    expect(mutate).toHaveBeenCalledWith({
      id: 5,
      listingId: 7,
      amenityIds: [27, 28],
    });
  });

  // Step L6.1: a stored room amenity the listing's category no longer
  // offers is kept (round-trips unchanged) until the Partner removes it.
  describe('previously saved amenities outside the category (Step L6.1)', () => {
    test('are shown checked in their own section and kept on save', async () => {
      const user = userEvent.setup();
      renderEditor([27, 26]);

      expect(
        screen.getByRole('group', { name: 'Նախկինում պահպանված' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Live Music')).toBeChecked();

      await user.click(screen.getByRole('button', { name: /Պահպանել/ }));
      expect(mutate.mock.calls[0][0].amenityIds.sort()).toEqual([26, 27]);
    });

    test('unchecking removes it on save and it cannot be re-added', async () => {
      const user = userEvent.setup();
      renderEditor([27, 26]);

      await user.click(screen.getByLabelText('Live Music'));
      expect(
        screen.getByLabelText('Live Music — կհեռացվի պահպանելիս'),
      ).toBeDisabled();

      await user.click(screen.getByRole('button', { name: /Պահպանել/ }));
      expect(mutate.mock.calls[0][0].amenityIds).toEqual([27]);
    });
  });
});
