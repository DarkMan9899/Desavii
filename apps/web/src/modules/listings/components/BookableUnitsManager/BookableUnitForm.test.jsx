import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import ApiError from '../../../../api/ApiError.js';
import { resolveBookableUnitProfile } from '../../utils/resolveBookableUnitProfile.js';
import { BED_TYPES } from '../../../availability/constants/bedTypes.js';
import BookableUnitForm from './BookableUnitForm.jsx';

// Sprint C-1: these three room sub-editors have their own real query/
// mutation hooks (network-backed) — out of scope for this file, which
// only exercises BookableUnitForm's OWN gating logic (does it render
// them at all, for which unit type/mode).
vi.mock('./RoomDescriptionEditor.jsx', () => ({
  default: () => <div data-testid="room-description-editor" />,
}));
vi.mock('./RoomAmenitiesEditor.jsx', () => ({
  default: () => <div data-testid="room-amenities-editor" />,
}));
vi.mock('./RoomMediaGallery.jsx', () => ({
  default: () => <div data-testid="room-media-gallery" />,
}));

// Step L6.2B — one real profile per category family.
const HOTEL = resolveBookableUnitProfile({
  listingType: 'HOTEL',
  categorySlug: 'hotels',
  pricingModel: 'PER_NIGHT',
});
const APARTMENT = resolveBookableUnitProfile({
  listingType: 'PROPERTY',
  categorySlug: 'apartments',
  pricingModel: 'PER_NIGHT',
});
const RESTAURANT = resolveBookableUnitProfile({
  listingType: 'RESTAURANT',
  categorySlug: 'restaurants',
  pricingModel: 'PER_PERSON',
});
const TOUR = resolveBookableUnitProfile({
  listingType: 'TOUR',
  categorySlug: 'tours',
  pricingModel: 'PER_PERSON',
});
const CAR_RENTAL = resolveBookableUnitProfile({
  listingType: 'CAR_RENTAL',
  categorySlug: 'car-rentals',
  pricingModel: 'PER_DAY',
});
const ATTRACTION = resolveBookableUnitProfile({
  listingType: 'ATTRACTION',
  categorySlug: 'attractions',
  pricingModel: 'PER_HOUR',
});

const NAME = 'Անվանում';
const HOTEL_CAPACITY = 'Այս տեսակի սենյակներ';
const HOTEL_MAX_GUESTS = 'Առավելագույն հյուրեր մեկ սենյակում';
const APARTMENT_CAPACITY = 'Հասանելի միավորներ';
const APARTMENT_MAX_GUESTS = 'Առավելագույն հյուրեր մեկ միավորում';
const PER_NIGHT_PRICE = 'Հիմնական գին մեկ գիշերվա համար';
const START_TIME = 'Սկզբի ժամ';
const END_TIME = 'Ավարտի ժամ';
const SINGLE_BEDS = 'Մեկտեղանոց մահճակալ';
const DOUBLE_BEDS = 'Երկտեղանոց մահճակալ';
const CHILD_BEDS = 'Մանկական մահճակալ';
const MEAL_PLAN = 'Սննդի տարբերակ';
const BED_COUNT_ERROR = 'Մուտքագրեք ամբողջ թիվ՝ 0-ից 20։';
const ROOM_SIZE = 'Սենյակի մակերես (մ²)';

describe('BookableUnitForm (P2.2A)', () => {
  test('never offers a unit-type choice — a new unit gets its listing type’s one unit type (Step L6.2B)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={TOUR}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByText('Միավորի տեսակ')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ bookableUnitType: 'TOUR_DEPARTURE' }),
    );
  });

  test('editing never re-sends the (immutable) unit type', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('bookableUnitType');
  });

  test('submits capacity/maxGuests/unitLabel for a new hotel room, with no bed configuration or price when none was entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(NAME), 'Deluxe Suite');
    await user.type(screen.getByLabelText(HOTEL_CAPACITY), '4');
    await user.type(screen.getByLabelText(HOTEL_MAX_GUESTS), '2');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit).toHaveBeenCalledWith({
      bookableUnitType: 'HOTEL_ROOM',
      unitLabel: 'Deluxe Suite',
      capacity: 4,
      maxGuests: 2,
      bedConfiguration: undefined,
      basePriceAmount: undefined,
      basePriceCurrency: undefined,
      // A hotel room carries the room-only fields (none were entered).
      roomSizeSqm: undefined,
      bathroomType: undefined,
      viewType: undefined,
      smokingPolicy: undefined,
      mealPlan: undefined,
    });
  });

  // Step L6.3A — one quantity per bed type, never free-form rows.
  test('single, double and child bed quantities submit as one structured setup', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(HOTEL_CAPACITY), '2');
    await user.clear(screen.getByLabelText(SINGLE_BEDS));
    await user.type(screen.getByLabelText(SINGLE_BEDS), '2');
    await user.clear(screen.getByLabelText(DOUBLE_BEDS));
    await user.type(screen.getByLabelText(DOUBLE_BEDS), '1');
    await user.clear(screen.getByLabelText(CHILD_BEDS));
    await user.type(screen.getByLabelText(CHILD_BEDS), '1');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit.mock.calls[0][0].bedConfiguration).toEqual([
      { type: 'SINGLE', count: 2 },
      { type: 'DOUBLE', count: 1 },
      { type: 'CHILD_BED', count: 1 },
    ]);
  });

  test('every bed type has exactly one quantity field, starting at 0', () => {
    render(
      <BookableUnitForm
        profile={HOTEL}
        isCreating
        submitLabel="Register"
        onSubmit={vi.fn()}
      />,
    );

    BED_TYPES.forEach((type) => {
      const label = i18n.t(`partner.listingWizard.bedTypes.${type}`);
      expect(screen.getAllByLabelText(label)).toHaveLength(1);
      expect(screen.getByLabelText(label)).toHaveValue(0);
    });
  });

  test('editing pre-fills the stated beds, and setting them all to 0 clears the setup', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        initialValues={{
          bookableUnitType: 'HOTEL_ROOM',
          bedConfiguration: [
            { type: 'DOUBLE', count: 1 },
            { type: 'CRIB', count: 1 },
          ],
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText(DOUBLE_BEDS)).toHaveValue(1);
    await user.clear(screen.getByLabelText(DOUBLE_BEDS));
    await user.type(screen.getByLabelText(DOUBLE_BEDS), '0');
    await user.clear(screen.getByLabelText('Մանկական օրորոց'));
    await user.type(screen.getByLabelText('Մանկական օրորոց'), '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit.mock.calls[0][0].bedConfiguration).toBeNull();
  });

  test('a meal plan is chosen from translated options and submitted as its code', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: MEAL_PLAN }));
    await user.click(
      screen.getByRole('option', { name: 'Նախաճաշը ներառված է' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit.mock.calls[0][0].mealPlan).toBe('BREAKFAST_INCLUDED');
  });

  test('editing clears blanked room details with null instead of keeping the old values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        initialValues={{
          bookableUnitType: 'HOTEL_ROOM',
          maxGuests: 2,
          roomSizeSqm: '24.00',
          bathroomType: 'PRIVATE',
          mealPlan: 'HALF_BOARD',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    await user.clear(screen.getByLabelText(HOTEL_MAX_GUESTS));
    await user.clear(screen.getByLabelText(ROOM_SIZE));
    await user.click(screen.getByRole('button', { name: 'Լոգարան' }));
    await user.click(screen.getByRole('option', { name: 'Նշված չէ' }));
    await user.click(screen.getByRole('button', { name: MEAL_PLAN }));
    await user.click(screen.getByRole('option', { name: 'Նշված չէ' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      maxGuests: null,
      roomSizeSqm: null,
      bathroomType: null,
      mealPlan: null,
      bedConfiguration: null,
    });
  });

  test('the room editor is grouped into labelled sections', () => {
    render(
      <BookableUnitForm
        profile={HOTEL}
        isCreating
        submitLabel="Register"
        onSubmit={vi.fn()}
      />,
    );

    ['Քնելու համար', 'Սնունդ', 'Սենյակի առանձնահատկություններ'].forEach(
      (legend) =>
        expect(screen.getByRole('group', { name: legend })).toBeInTheDocument(),
    );
  });

  test('entering a base price amount without a currency shows an incomplete warning and disables submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '100');

    expect(
      screen.getByText(
        'Նշեք և՛ գումարը, և՛ արժույթը, կամ թողեք երկուսն էլ դատարկ։',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('start/end time fields only show when creating a departure, never in edit mode', () => {
    const { rerender } = render(
      <BookableUnitForm
        profile={TOUR}
        isCreating
        submitLabel="Register"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(START_TIME)).toBeInTheDocument();
    expect(screen.getByLabelText(END_TIME)).toBeInTheDocument();

    rerender(
      <BookableUnitForm
        profile={TOUR}
        initialValues={{ bookableUnitType: 'TOUR_DEPARTURE' }}
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(START_TIME)).not.toBeInTheDocument();
  });

  test('a time-sliced departure (both start and end filled in) submits real timeSlotStart/timeSlotEnd', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={TOUR}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(NAME), 'Morning Departure');
    await user.type(screen.getByLabelText('Տեղեր մեկ մեկնումում'), '12');
    await user.type(screen.getByLabelText(START_TIME), '09:00');
    await user.type(screen.getByLabelText(END_TIME), '13:00');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        bookableUnitType: 'TOUR_DEPARTURE',
        timeSlotStart: '09:00',
        timeSlotEnd: '13:00',
      }),
    );
  });

  test('leaving both start and end time blank keeps the departure date-only — never sends a fake time', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={TOUR}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(NAME), 'Day tour');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        timeSlotStart: undefined,
        timeSlotEnd: undefined,
      }),
    );
  });

  test('filling only one of start/end shows an incomplete warning and disables submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={TOUR}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(START_TIME), '09:00');

    expect(
      screen.getByText(
        'Նշեք և՛ սկզբի, և՛ ավարտի ժամը, կամ թողեք երկուսն էլ դատարկ։',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('an end time at or before the start time is rejected with a real error, submit disabled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={TOUR}
        isCreating
        submitLabel="Register"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(START_TIME), '14:00');
    await user.type(screen.getByLabelText(END_TIME), '09:00');

    expect(
      screen.getByText('Ավարտի ժամը պետք է լինի սկզբի ժամից ուշ։'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('edit mode pre-fills from initialValues and Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        initialValues={{
          bookableUnitType: 'HOTEL_ROOM',
          unitLabel: 'Standard Room',
          capacity: 5,
          maxGuests: 2,
        }}
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByLabelText(NAME)).toHaveValue('Standard Room');
    expect(screen.getByLabelText(HOTEL_CAPACITY)).toHaveValue(5);
    expect(screen.getByLabelText(HOTEL_MAX_GUESTS)).toHaveValue(2);

    await user.click(screen.getByRole('button', { name: 'Չեղարկել' }));
    expect(onCancel).toHaveBeenCalled();
  });

  // Step L6.2B — every category family shows only its own unit fields and
  // speaks its own words; nothing hotel-specific leaks elsewhere.
  describe('category families (Step L6.2B)', () => {
    test.each([
      ['Hotel', HOTEL, HOTEL_CAPACITY, true, true, false, PER_NIGHT_PRICE],
      [
        'Apartment',
        APARTMENT,
        APARTMENT_CAPACITY,
        true,
        false,
        false,
        PER_NIGHT_PRICE,
      ],
      [
        'Restaurant',
        RESTAURANT,
        'Միաժամանակյա ամրագրումներ',
        false,
        false,
        false,
        'Հիմնական գին',
      ],
      [
        'Tour',
        TOUR,
        'Տեղեր մեկ մեկնումում',
        false,
        false,
        true,
        'Հիմնական գին մեկ անձի համար',
      ],
      [
        'Car rental',
        CAR_RENTAL,
        'Հասանելի ավտոմեքենաներ',
        false,
        false,
        false,
        'Հիմնական գին մեկ օրվա համար',
      ],
      [
        'Attraction',
        ATTRACTION,
        'Տեղեր մեկ սեանսում',
        false,
        false,
        true,
        'Հիմնական գին',
      ],
    ])(
      '%s: capacity/price wording and which unit fields render',
      (
        _family,
        profile,
        capacityLabel,
        lodging,
        room,
        timeSlot,
        priceLabel,
      ) => {
        render(
          <BookableUnitForm
            profile={profile}
            isCreating
            submitLabel="Register"
            onSubmit={vi.fn()}
          />,
        );

        expect(screen.getByLabelText(capacityLabel)).toBeInTheDocument();
        expect(screen.getByLabelText(priceLabel)).toBeInTheDocument();
        expect(Boolean(screen.queryByText(/Առավելագույն հյուրեր/))).toBe(
          lodging,
        );
        expect(Boolean(screen.queryByLabelText(SINGLE_BEDS))).toBe(lodging);
        expect(Boolean(screen.queryByRole('button', { name: MEAL_PLAN }))).toBe(
          room,
        );
        expect(Boolean(screen.queryByLabelText(ROOM_SIZE))).toBe(room);
        expect(Boolean(screen.queryByLabelText(START_TIME))).toBe(timeSlot);
      },
    );

    test('a restaurant table never sends lodging, room or time-slot fields', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={RESTAURANT}
          isCreating
          submitLabel="Register"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(NAME), 'Main hall');
      await user.type(screen.getByLabelText('Միաժամանակյա ամրագրումներ'), '6');
      await user.click(screen.getByRole('button', { name: 'Register' }));

      const payload = onSubmit.mock.calls[0][0];
      expect(payload).toMatchObject({
        bookableUnitType: 'RESTAURANT_TABLE',
        unitLabel: 'Main hall',
        capacity: 6,
      });
      expect(payload.maxGuests).toBeUndefined();
      expect(payload.bedConfiguration).toBeUndefined();
      [
        'timeSlotStart',
        'timeSlotEnd',
        'roomSizeSqm',
        'bathroomType',
        'viewType',
        'smokingPolicy',
        'mealPlan',
      ].forEach((field) => expect(payload).not.toHaveProperty(field));
    });

    test('a legacy unit keeps the fields of its own stored type', () => {
      render(
        <BookableUnitForm
          profile={TOUR}
          initialValues={{ bookableUnitType: 'HOTEL_ROOM', maxGuests: 2 }}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.getByLabelText('Առավելագույն հյուրեր մեկ միավորում'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(ROOM_SIZE)).toBeInTheDocument();
    });

    test('a rejected unit type reaches the summary alert, since the type has no field of its own', () => {
      render(
        <BookableUnitForm
          profile={CAR_RENTAL}
          isCreating
          submitLabel="Register"
          onSubmit={vi.fn()}
          serverError={
            new ApiError({
              code: 'VALIDATION_FAILED',
              status: 422,
              message: 'This listing already has its vehicle.',
              details: [
                { field: 'bookableUnitType', issue: 'ONE_VEHICLE_PER_LISTING' },
              ],
            })
          }
        />,
      );

      expect(
        screen.getByText(/Այս հայտարարությունն արդեն ունի իր ավտոմեքենան/),
      ).toBeInTheDocument();
    });
  });

  describe('Sprint C-1 (Accommodation room-level product data)', () => {
    test('a HOTEL_ROOM unit shows room size, bathroom, view, and smoking fields', () => {
      render(
        <BookableUnitForm
          profile={HOTEL}
          initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getByLabelText(ROOM_SIZE)).toBeInTheDocument();
      expect(screen.getByText('Լոգարան')).toBeInTheDocument();
      expect(screen.getByText('Տեսարան')).toBeInTheDocument();
      expect(screen.getByText('Ծխելու կանոն')).toBeInTheDocument();
    });

    test('a non-HOTEL_ROOM unit (e.g. PROPERTY_UNIT) never shows room-only fields — no regression for other unit types', () => {
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.queryByLabelText(ROOM_SIZE)).not.toBeInTheDocument();
      expect(screen.queryByText('Լոգարան')).not.toBeInTheDocument();
      expect(screen.queryByText('Տեսարան')).not.toBeInTheDocument();
      expect(screen.queryByText('Ծխելու կանոն')).not.toBeInTheDocument();
    });

    test('room fields are included in the submitted payload only for a HOTEL_ROOM unit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={HOTEL}
          initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(ROOM_SIZE), '24');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ roomSizeSqm: 24 }),
      );
    });

    test('the description/amenities/photo sub-editors never appear while creating a brand-new room (no unitId yet)', () => {
      render(
        <BookableUnitForm
          profile={HOTEL}
          isCreating
          submitLabel="Register"
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.queryByTestId('room-description-editor'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('room-amenities-editor'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('room-media-gallery'),
      ).not.toBeInTheDocument();
    });

    test('editing an already-created HOTEL_ROOM unit (real unitId) shows the description/amenities/photo sub-editors', () => {
      render(
        <BookableUnitForm
          profile={HOTEL}
          initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
          unitId={42}
          listingId={7}
        />,
      );

      expect(screen.getByTestId('room-description-editor')).toBeInTheDocument();
      expect(screen.getByTestId('room-amenities-editor')).toBeInTheDocument();
      expect(screen.getByTestId('room-media-gallery')).toBeInTheDocument();
    });

    test('editing an already-created non-room unit never shows the room sub-editors, even with a real unitId', () => {
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
          unitId={42}
          listingId={7}
        />,
      );

      expect(
        screen.queryByTestId('room-description-editor'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('room-amenities-editor'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('room-media-gallery'),
      ).not.toBeInTheDocument();
    });
  });

  // Step L4.1 (brief §5-7, §10, §12-13, §19, §25): capacity/maxGuests/
  // basePriceAmount/bed-count now mirror `availabilityValidators.js`'s own
  // contract exactly, client-side. An apartment unit keeps these tests
  // focused (no room-only Selects — bathroom/view/smoking/roomSizeSqm —
  // cluttering the form).
  describe('numeric field validation (Step L4.1)', () => {
    test('capacity of 0 is rejected, onSubmit never called', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '0');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ առնվազն 1։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a negative capacity is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '-2');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ առնվազն 1։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a decimal capacity is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '2.5');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Մուտքագրեք ամբողջ թիվ՝ առնվազն 1։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('maxGuests of 0 is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_MAX_GUESTS), '0');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          'Մուտքագրեք ամբողջ թիվ՝ 1-ից 100-ի միջակայքում։',
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('maxGuests above the metadata-derived max (100) is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_MAX_GUESTS), '101');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          'Մուտքագրեք ամբողջ թիվ՝ 1-ից 100-ի միջակայքում։',
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('maxGuests at the exact max (100) is accepted', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_MAX_GUESTS), '100');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ maxGuests: 100 }),
      );
    });

    async function fillCurrency(user) {
      const [currencyTrigger] = screen.getAllByTestId('select-trigger');
      await user.click(currencyTrigger);
      await user.click(screen.getByRole('option', { name: 'AMD' }));
    }

    test('a base price of 0 is rejected — unlike listing pricing/menu price, basePriceAmount requires strictly positive (backend .positive())', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '0');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Գինը պետք է լինի 0-ից մեծ։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a negative base price is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '-10');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Գինը պետք է լինի 0-ից մեծ։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a base price with more than 2 decimal places is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '49.999');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          'Մուտքագրեք գին՝ ոչ ավելի, քան 2 տասնորդական նիշով։',
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a valid two-decimal base price is accepted', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '49.99');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          basePriceAmount: 49.99,
          basePriceCurrency: 'AMD',
        }),
      );
    });

    test('a base price at the exact DECIMAL(12,2) max is accepted', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '9999999999.99');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ basePriceAmount: 9999999999.99 }),
      );
    });

    test('a base price above the DECIMAL(12,2) max is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(screen.getByLabelText(PER_NIGHT_PRICE), '10000000000');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Գումարը չափազանց մեծ է։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('capacity at the minimum (1) is accepted', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '1');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ capacity: 1 }),
      );
    });

    test('an unsafe (beyond Number.MAX_SAFE_INTEGER) capacity is rejected rather than silently rounded', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(
        screen.getByLabelText(APARTMENT_CAPACITY),
        '99999999999999999999',
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Առավելագույնը 4 294 967 295 է։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    // Step L4.2 — capacity mirrors the backend's new INT UNSIGNED ceiling.
    test('capacity at the INT UNSIGNED max (4294967295) is accepted', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '4294967295');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ capacity: 4294967295 }),
      );
    });

    test('capacity one above the INT UNSIGNED max is rejected with the max message', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '4294967296');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Առավելագույնը 4 294 967 295 է։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test.each([
      ['a negative', '-1'],
      ['a fractional', '1.5'],
      ['an above-the-max (20)', '21'],
    ])(
      '%s bed count is rejected, onSubmit never called',
      async (_label, typed) => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        render(
          <BookableUnitForm
            profile={APARTMENT}
            initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
            submitLabel="Save"
            onSubmit={onSubmit}
          />,
        );

        const countField = screen.getByLabelText(SINGLE_BEDS);
        await user.clear(countField);
        await user.type(countField, typed);
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText(BED_COUNT_ERROR)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
      },
    );

    test('a bed count of 0 is valid and simply means none of that bed', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          isCreating
          submitLabel="Register"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText(APARTMENT_CAPACITY), '1');
      await user.click(screen.getByRole('button', { name: 'Register' }));

      expect(onSubmit.mock.calls[0][0].bedConfiguration).toBeUndefined();
    });
  });

  // Step L4.2 (brief §4, §14) — roomSizeSqm mirrors `availabilityValidators
  // .js`: optional, strictly positive, <= 1000, at most 2 decimal places
  // (`DECIMAL(6,2)` would otherwise silently round). A hotel room renders
  // the field.
  describe('room size validation (Step L4.2)', () => {
    const ROOM_SIZE_LABEL = ROOM_SIZE;

    async function submitRoomSize(user, typed) {
      if (typed !== '') {
        await user.type(screen.getByLabelText(ROOM_SIZE_LABEL), typed);
      }
      await user.click(screen.getByRole('button', { name: 'Save' }));
    }

    test.each([
      ['a valid decimal', '24.5', 24.5],
      ['the exact max', '1000', 1000],
      ['the smallest 2-decimal value', '0.01', 0.01],
    ])('%s is accepted', async (_label, typed, expected) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={HOTEL}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await submitRoomSize(user, typed);

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ roomSizeSqm: expected }),
      );
    });

    test('blank stays undefined when creating — never coerced to 0', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={HOTEL}
          isCreating
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await submitRoomSize(user, '');

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ roomSizeSqm: undefined }),
      );
    });

    test.each([
      ['zero', '0', 'Մուտքագրեք 0 մ²-ից մեծ մակերես։'],
      ['a negative value', '-5', 'Մուտքագրեք 0 մ²-ից մեծ մակերես։'],
      ['above the max', '1000.01', 'Առավելագույնը 1000 մ² է։'],
      [
        'more than 2 decimal places',
        '24.555',
        'Մուտքագրեք մակերես՝ ոչ ավելի, քան 2 տասնորդական նիշով։',
      ],
    ])(
      '%s is rejected with a field-level error',
      async (_label, typed, message) => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        render(
          <BookableUnitForm
            profile={HOTEL}
            submitLabel="Save"
            onSubmit={onSubmit}
          />,
        );

        await submitRoomSize(user, typed);

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.getByLabelText(ROOM_SIZE_LABEL)).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        expect(onSubmit).not.toHaveBeenCalled();
      },
    );

    // user-event normalizes a typed "1e3" in a number input to "1000";
    // `fireEvent.change` keeps the raw string a real browser would hold.
    test('scientific notation is rejected, not read as 1000', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={HOTEL}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText(ROOM_SIZE_LABEL), {
        target: { value: '1e3' },
      });
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Մուտքագրեք սենյակի վավեր մակերես։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('editing the field clears its error', async () => {
      const user = userEvent.setup();
      render(
        <BookableUnitForm
          profile={HOTEL}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      await submitRoomSize(user, '0');
      expect(
        await screen.findByText('Մուտքագրեք 0 մ²-ից մեծ մակերես։'),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText(ROOM_SIZE_LABEL), '5');

      expect(
        screen.queryByText('Մուտքագրեք 0 մ²-ից մեծ մակերես։'),
      ).not.toBeInTheDocument();
    });

    test('a stale invalid room size never blocks saving a non-room unit type', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{
            bookableUnitType: 'PROPERTY_UNIT',
            roomSizeSqm: 5000,
          }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('roomSizeSqm');
    });
  });
  // Step L5 (brief §8): a rejected register/update names its fields.
  describe('server field errors (Step L5)', () => {
    const REJECTED = new ApiError({
      code: 'VALIDATION_FAILED',
      status: 422,
      message: 'One or more fields are invalid.',
      details: [
        {
          field: 'body.capacity',
          issue: 'too_big',
          maximum: 4294967295,
          type: 'number',
        },
        { field: 'body', issue: 'custom' },
      ],
    });

    test('a server error lands on its exact field, marked aria-invalid, and clears when that field is edited', async () => {
      const user = userEvent.setup();
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
          serverError={REJECTED}
        />,
      );

      const capacity = screen.getByLabelText(APARTMENT_CAPACITY);
      expect(capacity).toHaveAttribute('aria-invalid', 'true');
      expect(
        screen.getByText('Առավելագույնը 4294967295 է։'),
      ).toBeInTheDocument();

      await user.type(capacity, '5');
      expect(capacity).not.toHaveAttribute('aria-invalid', 'true');
      expect(
        screen.queryByText('Առավելագույնը 4294967295 է։'),
      ).not.toBeInTheDocument();
    });

    test('an issue with no field of its own is listed in the summary, never dropped', () => {
      render(
        <BookableUnitForm
          profile={APARTMENT}
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
          serverError={REJECTED}
        />,
      );
      const summary = screen
        .getAllByRole('alert')
        .find((alert) => alert.textContent.includes('Որոշ տվյալներ'));
      expect(within(summary).getAllByRole('listitem')).toHaveLength(1);
      expect(summary).not.toHaveTextContent('One or more fields are invalid.');
    });
  });
});
