import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookableUnitsManager from './BookableUnitsManager.jsx';
import {
  useBookableUnitsQuery,
  useRegisterBookableUnitMutation,
  useUpdateBookableUnitMutation,
} from '../../../availability/index.js';

vi.mock('../../../availability/index.js', () => ({
  BOOKABLE_UNIT_TYPES: ['HOTEL_ROOM', 'PROPERTY_UNIT'],
  BED_TYPES: ['SINGLE', 'DOUBLE', 'QUEEN', 'KING', 'TWIN', 'SOFA_BED', 'BUNK'],
  INT_UNSIGNED_MAX: 4294967295,
  BATHROOM_TYPES: ['PRIVATE', 'SHARED', 'ENSUITE'],
  VIEW_TYPES: [
    'CITY',
    'MOUNTAIN',
    'GARDEN',
    'COURTYARD',
    'POOL',
    'LANDMARK',
    'NONE',
  ],
  SMOKING_POLICIES: ['NON_SMOKING', 'SMOKING_ALLOWED'],
  useBookableUnitsQuery: vi.fn(),
  useRegisterBookableUnitMutation: vi.fn(),
  useUpdateBookableUnitMutation: vi.fn(),
  useUpdateBookableUnitDescriptionMutation: vi.fn(),
  useReplaceBookableUnitAmenitiesMutation: vi.fn(),
  useAttachBookableUnitMediaMutation: vi.fn(),
  useRemoveBookableUnitMediaMutation: vi.fn(),
}));

const APARTMENT_UNIT = {
  id: 42,
  unit_label: null,
  bookable_unit_type: 'PROPERTY_UNIT',
  capacity: 1,
  max_guests: 4,
  bed_configuration: [{ type: 'QUEEN', count: 1 }],
  base_price_amount: '95.00',
  base_price_currency: 'AMD',
};

describe('BookableUnitsManager (P2.2A)', () => {
  let registerMutate;
  let updateMutate;

  beforeEach(() => {
    registerMutate = vi.fn();
    updateMutate = vi.fn();
    useRegisterBookableUnitMutation.mockReturnValue({
      mutate: registerMutate,
      isPending: false,
      error: null,
    });
    useUpdateBookableUnitMutation.mockReturnValue({
      mutate: updateMutate,
      isPending: false,
      error: null,
    });
  });

  test('a single-unit property renders exactly one row with no separate "simple mode" branching', () => {
    useBookableUnitsQuery.mockReturnValue({ data: [APARTMENT_UNIT] });
    render(<BookableUnitsManager listingId={11} />);

    // Falls back to the type label since this unit has no custom label —
    // the same generic-listing display logic as any other unit.
    expect(screen.getByText('Անշարժ գույքի միավոր')).toBeInTheDocument();
    expect(screen.getByText('Ընդունում է 4 հյուր')).toBeInTheDocument();
    expect(screen.getByText('1 × Քուին')).toBeInTheDocument();
    expect(screen.getByText('95.00 AMD / գիշեր')).toBeInTheDocument();
  });

  test('clicking Edit opens the form pre-filled, and saving calls the update mutation for that unit id', async () => {
    const user = userEvent.setup();
    useBookableUnitsQuery.mockReturnValue({ data: [APARTMENT_UNIT] });
    render(<BookableUnitsManager listingId={11} />);

    await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));
    const maxGuestsInput = screen.getByLabelText(
      'Առավելագույն հյուրեր մեկ սենյակում',
    );
    expect(maxGuestsInput).toHaveValue(4);

    await user.clear(maxGuestsInput);
    await user.type(maxGuestsInput, '6');
    await user.click(
      screen.getByRole('button', { name: 'Պահպանել փոփոխությունները' }),
    );

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        listingId: 11,
        payload: expect.objectContaining({ maxGuests: 6 }),
      }),
      expect.anything(),
    );
  });

  test('the register/edit forms never appear at the same time', async () => {
    const user = userEvent.setup();
    useBookableUnitsQuery.mockReturnValue({ data: [APARTMENT_UNIT] });
    render(<BookableUnitsManager listingId={11} />);

    await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));
    expect(
      screen.getByRole('button', { name: 'Պահպանել փոփոխությունները' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել սենյակի նոր տեսակ' }),
    );
    // Starting to add a new unit exits edit mode for the existing one.
    expect(
      screen.queryByRole('button', { name: 'Պահպանել փոփոխությունները' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Գրանցել միավոր' }),
    ).toBeInTheDocument();
  });
});
