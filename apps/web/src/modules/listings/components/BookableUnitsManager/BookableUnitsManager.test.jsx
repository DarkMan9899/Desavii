import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookableUnitsManager from './BookableUnitsManager.jsx';
import { resolveBookableUnitProfile } from '../../utils/resolveBookableUnitProfile.js';
import {
  useBookableUnitsQuery,
  useRegisterBookableUnitMutation,
  useUpdateBookableUnitMutation,
} from '../../../availability/index.js';

vi.mock('../../../availability/index.js', async () => {
  const applicability = await vi.importActual(
    '../../../availability/constants/bookableUnitFieldApplicability.js',
  );
  const unitTypes = await vi.importActual(
    '../../../availability/constants/listingTypeBookableUnitTypes.js',
  );
  return {
    BED_TYPES: [
      'SINGLE',
      'DOUBLE',
      'QUEEN',
      'KING',
      'TWIN',
      'SOFA_BED',
      'BUNK',
    ],
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
    unitTypeUsesField: applicability.unitTypeUsesField,
    supportsRoomDetails: applicability.supportsRoomDetails,
    getBookableUnitTypeForListingType:
      unitTypes.getBookableUnitTypeForListingType,
    isSingleUnitListingType: unitTypes.isSingleUnitListingType,
    useBookableUnitsQuery: vi.fn(),
    useRegisterBookableUnitMutation: vi.fn(),
    useUpdateBookableUnitMutation: vi.fn(),
    useUpdateBookableUnitDescriptionMutation: vi.fn(),
    useReplaceBookableUnitAmenitiesMutation: vi.fn(),
    useAttachBookableUnitMediaMutation: vi.fn(),
    useRemoveBookableUnitMediaMutation: vi.fn(),
  };
});

const APARTMENT = resolveBookableUnitProfile({
  listingType: 'PROPERTY',
  categorySlug: 'apartments',
  pricingModel: 'PER_NIGHT',
});
const HOTEL = resolveBookableUnitProfile({
  listingType: 'HOTEL',
  categorySlug: 'hotels',
  pricingModel: 'PER_NIGHT',
});
const CAR_RENTAL = resolveBookableUnitProfile({
  listingType: 'CAR_RENTAL',
  categorySlug: 'car-rentals',
  pricingModel: 'PER_DAY',
});

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

const VEHICLE_UNIT = {
  id: 77,
  unit_label: 'Toyota RAV4',
  bookable_unit_type: 'VEHICLE',
  capacity: 3,
  max_guests: null,
  bed_configuration: null,
  base_price_amount: '30000.00',
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
      reset: vi.fn(),
      isPending: false,
      error: null,
    });
    useUpdateBookableUnitMutation.mockReturnValue({
      mutate: updateMutate,
      reset: vi.fn(),
      isPending: false,
      error: null,
    });
  });

  test('a single-unit property renders exactly one row in the category’s own words', () => {
    useBookableUnitsQuery.mockReturnValue({ data: [APARTMENT_UNIT] });
    render(<BookableUnitsManager listingId={11} profile={APARTMENT} />);

    // No custom label — falls back to the category's own unit noun.
    expect(screen.getByText('Բնակարան / միավոր')).toBeInTheDocument();
    expect(screen.getByText('Ընդունում է 4 հյուր')).toBeInTheDocument();
    expect(screen.getByText('1 × Քուին')).toBeInTheDocument();
    expect(screen.getByText('95.00 AMD / գիշեր')).toBeInTheDocument();
  });

  test('clicking Edit opens the form pre-filled, and saving calls the update mutation for that unit id', async () => {
    const user = userEvent.setup();
    useBookableUnitsQuery.mockReturnValue({ data: [APARTMENT_UNIT] });
    render(<BookableUnitsManager listingId={11} profile={APARTMENT} />);

    await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));
    const maxGuestsInput = screen.getByLabelText(
      'Առավելագույն հյուրեր մեկ միավորում',
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
    render(<BookableUnitsManager listingId={11} profile={APARTMENT} />);

    await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));
    expect(
      screen.getByRole('button', { name: 'Պահպանել փոփոխությունները' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ավելացնել միավոր' }));
    // Starting to add a new unit exits edit mode for the existing one.
    expect(
      screen.queryByRole('button', { name: 'Պահպանել փոփոխությունները' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ավելացնել միավոր' }),
    ).toBeInTheDocument();
  });

  test('a hotel registers a new room type of its own unit type — never a type choice', async () => {
    const user = userEvent.setup();
    useBookableUnitsQuery.mockReturnValue({ data: [] });
    render(<BookableUnitsManager listingId={11} profile={HOTEL} />);

    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել սենյակի տեսակ' }),
    );
    await user.type(screen.getByLabelText('Անվանում'), 'Standard Room');
    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել սենյակի տեսակ' }),
    );

    expect(registerMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 11,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: 'Standard Room',
      }),
      expect.anything(),
    );
  });

  describe('Car Rental — one vehicle per listing (Step L6.2B)', () => {
    test('offers "add vehicle" only while the listing has none', () => {
      useBookableUnitsQuery.mockReturnValue({ data: [] });
      const { rerender } = render(
        <BookableUnitsManager listingId={12} profile={CAR_RENTAL} />,
      );
      expect(
        screen.getByRole('button', { name: 'Ավելացնել ավտոմեքենա' }),
      ).toBeInTheDocument();

      useBookableUnitsQuery.mockReturnValue({ data: [VEHICLE_UNIT] });
      rerender(<BookableUnitsManager listingId={12} profile={CAR_RENTAL} />);
      expect(
        screen.queryByRole('button', { name: 'Ավելացնել ավտոմեքենա' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Toyota RAV4')).toBeInTheDocument();
      expect(screen.getByText('30000.00 AMD / օր')).toBeInTheDocument();
    });

    test('the existing vehicle stays editable, with no lodging fields', async () => {
      const user = userEvent.setup();
      useBookableUnitsQuery.mockReturnValue({ data: [VEHICLE_UNIT] });
      render(<BookableUnitsManager listingId={12} profile={CAR_RENTAL} />);

      await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));
      expect(screen.getByLabelText('Հասանելի ավտոմեքենաներ')).toHaveValue(3);
      expect(
        screen.queryByText(/Առավելագույն հյուրեր/),
      ).not.toBeInTheDocument();
    });
  });
});
