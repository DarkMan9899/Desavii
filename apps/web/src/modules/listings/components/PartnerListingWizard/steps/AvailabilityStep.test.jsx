import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AvailabilityStep from './AvailabilityStep.jsx';
import {
  useBookableUnitsQuery,
  useBlackoutsQuery,
  useRegisterBookableUnitMutation,
  useUpdateBookableUnitMutation,
  useCreateBlackoutMutation,
  useRemoveBlackoutMutation,
} from '../../../../availability/index.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../../availability/index.js', () => ({
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
  useBlackoutsQuery: vi.fn(),
  useRegisterBookableUnitMutation: vi.fn(),
  useUpdateBookableUnitMutation: vi.fn(),
  useUpdateBookableUnitDescriptionMutation: vi.fn(),
  useReplaceBookableUnitAmenitiesMutation: vi.fn(),
  useAttachBookableUnitMediaMutation: vi.fn(),
  useRemoveBookableUnitMediaMutation: vi.fn(),
  useCreateBlackoutMutation: vi.fn(),
  useRemoveBlackoutMutation: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

// `AvailabilityStep` reads the URL's `:locale` segment (to pass a
// locale-aware `DatePicker`), so every render needs a Router context.
function renderStep(props) {
  return render(
    <MemoryRouter initialEntries={['/hy/partner/listings/new']}>
      <Routes>
        <Route
          path="/:locale/partner/listings/new"
          element={
            // eslint-disable-next-line react/jsx-props-no-spreading -- test harness forwards per-test overrides
            <AvailabilityStep {...props} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AvailabilityStep (PartnerListingWizard)', () => {
  let registerUnitMutate;
  let updateUnitMutate;
  let createBlackoutMutate;
  let removeBlackoutMutate;
  let updateListingMutateAsync;

  beforeEach(() => {
    registerUnitMutate = vi.fn();
    updateUnitMutate = vi.fn();
    createBlackoutMutate = vi.fn();
    removeBlackoutMutate = vi.fn();
    updateListingMutateAsync = vi.fn().mockResolvedValue({ data: {} });

    useBookableUnitsQuery.mockReturnValue({ data: [] });
    useBlackoutsQuery.mockReturnValue({ data: [] });
    useRegisterBookableUnitMutation.mockReturnValue({
      mutate: registerUnitMutate,
      isPending: false,
      error: null,
    });
    useUpdateBookableUnitMutation.mockReturnValue({
      mutate: updateUnitMutate,
      isPending: false,
      error: null,
    });
    useCreateBlackoutMutation.mockReturnValue({
      mutate: createBlackoutMutate,
      isPending: false,
    });
    useRemoveBlackoutMutation.mockReturnValue({
      mutate: removeBlackoutMutate,
      isPending: false,
    });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync: updateListingMutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('offers unit registration when no unit exists yet', async () => {
    const user = userEvent.setup();
    renderStep({ listingId: 7, onNext: vi.fn() });

    // Reveals the registration form (P2.2A: no longer an immediate
    // mutation — the button now opens `BookableUnitForm`).
    await user.click(
      screen.getByRole('button', {
        name: 'Գրանցել միավոր',
      }),
    );
    // The form's own submit button shares the same label — `.last()`
    // equivalent via querying all matches and taking the one inside the
    // now-visible form.
    const submitButtons = screen.getAllByRole('button', {
      name: 'Գրանցել միավոր',
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(registerUnitMutate).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 7, bookableUnitType: 'HOTEL_ROOM' }),
      expect.anything(),
    );
  });

  // P2.2A regression proof: this is the exact behavior the audit found
  // broken (the register form used to permanently disappear once one
  // unit existed, making a real multi-room-type hotel impossible to
  // build). This test proves the fix, not the old bug.
  test('still offers "add another room type" once a unit already exists, and a second unit can be registered', async () => {
    const user = userEvent.setup();
    useBookableUnitsQuery.mockReturnValue({
      data: [
        {
          id: 1,
          unit_label: 'Standard Room',
          bookable_unit_type: 'HOTEL_ROOM',
          capacity: 5,
          max_guests: 2,
          bed_configuration: null,
          base_price_amount: null,
          base_price_currency: null,
        },
      ],
    });
    renderStep({ listingId: 7, onNext: vi.fn() });

    // The existing unit is shown, not hidden behind a bare count.
    expect(screen.getByText('Standard Room')).toBeInTheDocument();

    // The old bug: this button did not exist once a unit was registered.
    const addAnotherButton = screen.getByRole('button', {
      name: 'Ավելացնել սենյակի նոր տեսակ',
    });
    expect(addAnotherButton).toBeInTheDocument();

    await user.click(addAnotherButton);
    const submitButtons = screen.getAllByRole('button', {
      name: 'Գրանցել միավոր',
    });
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(registerUnitMutate).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 7, bookableUnitType: 'HOTEL_ROOM' }),
      expect.anything(),
    );
  });

  test('lists existing blackout ranges and removes one on click', async () => {
    const user = userEvent.setup();
    useBlackoutsQuery.mockReturnValue({
      data: [{ id: 9, date_from: '2026-08-01', date_to: '2026-08-05' }],
    });
    renderStep({ listingId: 7, onNext: vi.fn() });

    expect(screen.getByText(/2026-08-01/)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Հեռացնել',
      }),
    );
    expect(removeBlackoutMutate).toHaveBeenCalledWith({ id: 9, listingId: 7 });
  });

  test('the add-blackout button is disabled until a full range is picked', () => {
    renderStep({ listingId: 7, onNext: vi.fn() });
    expect(
      screen.getByRole('button', {
        name: 'Ավելացնել արգելափակում',
      }),
    ).toBeDisabled();
  });

  // Step L2 (brief §10): each booking-rule field states its unit and
  // meaning in plain language, since "nights"/"hours"/"days" alone in
  // the label isn't enough context for a first-time Partner.
  test('each booking-rule field has helper text explaining its unit and effect', () => {
    renderStep({ listingId: 7, onNext: vi.fn() });

    expect(
      screen.getByText(
        'Ամենակարճ մնալը, որը դուք ընդունելի եք համարում, գիշերներով։ Թողեք դատարկ՝ նվազագույն սահմանափակում չունենալու համար։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ամենաերկար մնալը, որը դուք ընդունելի եք համարում, գիշերներով։ Թողեք դատարկ՝ առավելագույն սահմանափակում չունենալու համար։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Որքան նախապես պետք է հյուրերը ամրագրեն՝ մուտքից առաջ, ժամերով։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Որքան առաջ կարող են հյուրերը ամրագրել, օրերով։'),
    ).toBeInTheDocument();
  });

  test('Continue with no booking-rule fields filled in skips the updateListing PATCH', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({ listingId: 7, onNext });
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(updateListingMutateAsync).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  test('Continue with booking-rule fields filled in calls updateListing with parsed integers', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({ listingId: 7, onNext });

    await user.type(
      screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
      '2',
    );
    await user.type(
      screen.getByLabelText('Առավելագույն մնալու տևողություն (գիշեր)'),
      '14',
    );

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(updateListingMutateAsync).toHaveBeenCalled());
    expect(updateListingMutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        bookingRules: {
          minimumStayNights: 2,
          maximumStayNights: 14,
          advanceBookingMinHours: undefined,
          advanceBookingMaxDays: undefined,
        },
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  // Step L4 (brief §6-7, §12, §25): booking-rule numeric domain rules
  // enforced client-side, matching the backend's own positive/nonnegative
  // contract exactly, plus the minimumStayNights <= maximumStayNights
  // cross-field rule.
  describe('numeric validation (Step L4)', () => {
    test('0 nights is rejected for a positive-required field, PATCH never sent', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, onNext: vi.fn() });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '0',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ առնվազն 1 գիշեր։'),
      ).toBeInTheDocument();
      expect(updateListingMutateAsync).not.toHaveBeenCalled();
    });

    test('a negative night count is rejected, PATCH never sent', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, onNext: vi.fn() });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '-1',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ առնվազն 1 գիշեր։'),
      ).toBeInTheDocument();
      expect(updateListingMutateAsync).not.toHaveBeenCalled();
    });

    test('1 night is accepted for a positive-required field', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      renderStep({ listingId: 7, onNext });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '1',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(updateListingMutateAsync).toHaveBeenCalled());
      expect(updateListingMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            bookingRules: expect.objectContaining({ minimumStayNights: 1 }),
          },
        }),
      );
    });

    test('a decimal value is rejected as not a whole number', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, onNext: vi.fn() });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '1.5',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ առնվազն 1 գիշեր։'),
      ).toBeInTheDocument();
      expect(updateListingMutateAsync).not.toHaveBeenCalled();
    });

    test('0 is accepted for a nonnegative field (advance booking hours)', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      renderStep({ listingId: 7, onNext });

      await user.type(
        screen.getByLabelText('Ամրագրման նվազագույն ժամկետ (ժամ)'),
        '0',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(updateListingMutateAsync).toHaveBeenCalled());
      expect(updateListingMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            bookingRules: expect.objectContaining({
              advanceBookingMinHours: 0,
            }),
          },
        }),
      );
    });

    test('a negative advance-booking value is rejected, PATCH never sent', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, onNext: vi.fn() });

      await user.type(
        screen.getByLabelText('Ամրագրման նվազագույն ժամկետ (ժամ)'),
        '-3',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ 0 կամ ավելի ժամ։'),
      ).toBeInTheDocument();
      expect(updateListingMutateAsync).not.toHaveBeenCalled();
    });

    test('minimumStayNights > maximumStayNights is rejected with a cross-field error, PATCH never sent', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, onNext: vi.fn() });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '6',
      );
      await user.type(
        screen.getByLabelText('Առավելագույն մնալու տևողություն (գիշեր)'),
        '5',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText(
          'Նվազագույն մնալու տևողությունը չի կարող գերազանցել առավելագույնը։',
        ),
      ).toBeInTheDocument();
      expect(updateListingMutateAsync).not.toHaveBeenCalled();
    });

    test('minimumStayNights === maximumStayNights is accepted (equality is not forbidden)', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      renderStep({ listingId: 7, onNext });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '5',
      );
      await user.type(
        screen.getByLabelText('Առավելագույն մնալու տևողություն (գիշեր)'),
        '5',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(updateListingMutateAsync).toHaveBeenCalled());
      expect(onNext).toHaveBeenCalled();
    });

    test('an empty optional field is sent as undefined, never coerced to 0', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, onNext: vi.fn() });

      await user.type(
        screen.getByLabelText('Նվազագույն մնալու տևողություն (գիշեր)'),
        '3',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(updateListingMutateAsync).toHaveBeenCalled());
      const [[call]] = updateListingMutateAsync.mock.calls;
      expect(call.payload.bookingRules.advanceBookingMinHours).toBeUndefined();
      expect(call.payload.bookingRules.advanceBookingMaxDays).toBeUndefined();
    });
  });
});
