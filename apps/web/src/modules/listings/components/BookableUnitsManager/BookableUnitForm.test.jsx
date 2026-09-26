import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('BookableUnitForm (P2.2A)', () => {
  test('shows the unit-type selector only when showTypeSelector is true', () => {
    const { rerender } = render(
      <BookableUnitForm
        showTypeSelector
        submitLabel="Register"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('Միավորի տեսակ')).toBeInTheDocument();

    rerender(
      <BookableUnitForm
        showTypeSelector={false}
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByText('Միավորի տեսակ')).not.toBeInTheDocument();
  });

  test('submits capacity/maxGuests/unitLabel and the default unit type, with no bed configuration or price when none was entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        showTypeSelector
        submitLabel="Գրանցել միավոր"
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByLabelText('Սենյակի/միավորի անվանում'),
      'Deluxe Suite',
    );
    await user.type(screen.getByLabelText('Գույքագրման քանակ'), '4');
    await user.type(
      screen.getByLabelText('Առավելագույն հյուրեր մեկ սենյակում'),
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Գրանցել միավոր' }));

    expect(onSubmit).toHaveBeenCalledWith({
      bookableUnitType: 'HOTEL_ROOM',
      unitLabel: 'Deluxe Suite',
      capacity: 4,
      maxGuests: 2,
      bedConfiguration: undefined,
      basePriceAmount: undefined,
      basePriceCurrency: undefined,
      // Sprint C-1: the default unit type is HOTEL_ROOM, so the room-only
      // fields are included (all empty/undefined — none were entered).
      roomSizeSqm: undefined,
      bathroomType: undefined,
      viewType: undefined,
      smokingPolicy: undefined,
    });
  });

  test('adding a bed row includes it (with the default type/count) in the submitted payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել մահճակալ' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        bedConfiguration: [{ type: 'SINGLE', count: 1 }],
      }),
    );
  });

  test('removing a bed row leaves bedConfiguration undefined again', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել մահճակալ' }),
    );
    await user.click(screen.getByRole('button', { name: 'Հեռացնել' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ bedConfiguration: undefined }),
    );
  });

  test('entering a base price amount without a currency shows an incomplete warning and disables submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
      '100',
    );

    expect(
      screen.getByText(
        'Նշեք և՛ գումարը, և՛ արժույթը, կամ թողեք երկուսն էլ դատարկ։',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('start/end time fields only show when creating (showTypeSelector), never in edit mode', () => {
    const { rerender } = render(
      <BookableUnitForm
        showTypeSelector
        submitLabel="Register"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Մեկնման սկզբի ժամը')).toBeInTheDocument();
    expect(screen.getByLabelText('Մեկնման ավարտի ժամը')).toBeInTheDocument();

    rerender(
      <BookableUnitForm
        showTypeSelector={false}
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText('Մեկնման սկզբի ժամը'),
    ).not.toBeInTheDocument();
  });

  test('a time-sliced unit (both start and end filled in) submits real timeSlotStart/timeSlotEnd', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        showTypeSelector
        submitLabel="Գրանցել միավոր"
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByLabelText('Սենյակի/միավորի անվանում'),
      'Morning Departure',
    );
    await user.type(screen.getByLabelText('Գույքագրման քանակ'), '12');
    await user.type(screen.getByLabelText('Մեկնման սկզբի ժամը'), '09:00');
    await user.type(screen.getByLabelText('Մեկնման ավարտի ժամը'), '13:00');
    await user.click(screen.getByRole('button', { name: 'Գրանցել միավոր' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        timeSlotStart: '09:00',
        timeSlotEnd: '13:00',
      }),
    );
  });

  test('leaving both start and end time blank keeps the unit date-only — never sends a fake time', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        showTypeSelector
        submitLabel="Գրանցել միավոր"
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByLabelText('Սենյակի/միավորի անվանում'),
      'Standard Room',
    );
    await user.click(screen.getByRole('button', { name: 'Գրանցել միավոր' }));

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
        showTypeSelector
        submitLabel="Գրանցել միավոր"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText('Մեկնման սկզբի ժամը'), '09:00');

    expect(
      screen.getByText(
        'Նշեք և՛ սկզբի, և՛ ավարտի ժամը, կամ թողեք երկուսն էլ դատարկ։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Գրանցել միավոր' }),
    ).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('an end time at or before the start time is rejected with a real error, submit disabled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        showTypeSelector
        submitLabel="Գրանցել միավոր"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText('Մեկնման սկզբի ժամը'), '14:00');
    await user.type(screen.getByLabelText('Մեկնման ավարտի ժամը'), '09:00');

    expect(
      screen.getByText('Ավարտի ժամը պետք է լինի սկզբի ժամից ուշ։'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Գրանցել միավոր' }),
    ).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('edit mode pre-fills from initialValues and Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <BookableUnitForm
        initialValues={{
          unitLabel: 'Standard Room',
          capacity: 5,
          maxGuests: 2,
        }}
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByLabelText('Սենյակի/միավորի անվանում')).toHaveValue(
      'Standard Room',
    );
    expect(screen.getByLabelText('Գույքագրման քանակ')).toHaveValue(5);
    expect(
      screen.getByLabelText('Առավելագույն հյուրեր մեկ սենյակում'),
    ).toHaveValue(2);

    await user.click(screen.getByRole('button', { name: 'Չեղարկել' }));
    expect(onCancel).toHaveBeenCalled();
  });

  describe('Sprint C-1 (Accommodation room-level product data)', () => {
    test('a HOTEL_ROOM unit shows room size, bathroom, view, and smoking fields', () => {
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getByLabelText('Սենյակի մակերես (մ²)')).toBeInTheDocument();
      expect(screen.getByText('Լոգարան')).toBeInTheDocument();
      expect(screen.getByText('Տեսարան')).toBeInTheDocument();
      expect(screen.getByText('Ծխելու կանոն')).toBeInTheDocument();
    });

    test('a non-HOTEL_ROOM unit (e.g. PROPERTY_UNIT) never shows room-only fields — no regression for other unit types', () => {
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.queryByLabelText('Սենյակի մակերես (մ²)'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Լոգարան')).not.toBeInTheDocument();
      expect(screen.queryByText('Տեսարան')).not.toBeInTheDocument();
      expect(screen.queryByText('Ծխելու կանոն')).not.toBeInTheDocument();
    });

    test('room fields are included in the submitted payload only for a HOTEL_ROOM unit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Սենյակի մակերես (մ²)'), '24');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ roomSizeSqm: 24 }),
      );
    });

    test('the description/amenities/photo sub-editors never appear while creating a brand-new room (no unitId yet)', () => {
      render(
        <BookableUnitForm
          showTypeSelector
          initialValues={{ bookableUnitType: 'HOTEL_ROOM' }}
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
  // contract exactly, client-side. `initialValues.bookableUnitType:
  // 'PROPERTY_UNIT'` keeps these tests focused (no room-only Selects —
  // bathroom/view/smoking/roomSizeSqm — cluttering the form).
  describe('numeric field validation (Step L4.1)', () => {
    test('capacity of 0 is rejected, onSubmit never called', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Գույքագրման քանակ'), '0');
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Գույքագրման քանակ'), '-2');
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Գույքագրման քանակ'), '2.5');
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(
        screen.getByLabelText('Առավելագույն հյուրեր մեկ սենյակում'),
        '0',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(
        screen.getByLabelText('Առավելագույն հյուրեր մեկ սենյակում'),
        '101',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(
        screen.getByLabelText('Առավելագույն հյուրեր մեկ սենյակում'),
        '100',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(
        screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
        '0',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(
        screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
        '-10',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(
        screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
        '49.999',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(
        screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
        '49.99',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(
        screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
        '9999999999.99',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await fillCurrency(user);
      await user.type(
        screen.getByLabelText('Հիմնական գին մեկ գիշերվա համար'),
        '10000000000',
      );
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Գույքագրման քանակ'), '1');
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(
        screen.getByLabelText('Գույքագրման քանակ'),
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Գույքագրման քանակ'), '4294967295');
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
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.type(screen.getByLabelText('Գույքագրման քանակ'), '4294967296');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Առավելագույնը 4 294 967 295 է։'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a bed count of 0 is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Ավելացնել մահճակալ' }),
      );
      const countField = screen.getByLabelText('Քանակ');
      await user.clear(countField);
      await user.type(countField, '0');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          'Մուտքագրեք մահճակալների ամբողջ թիվ՝ 1-ից 20-ի միջակայքում։',
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a bed count above the metadata-derived max (20) is rejected', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={onSubmit}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Ավելացնել մահճակալ' }),
      );
      const countField = screen.getByLabelText('Քանակ');
      await user.clear(countField);
      await user.type(countField, '21');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          'Մուտքագրեք մահճակալների ամբողջ թիվ՝ 1-ից 20-ի միջակայքում։',
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('"Add bed" disables once 12 rows (the schema array max) are reached', async () => {
      const user = userEvent.setup();
      render(
        <BookableUnitForm
          initialValues={{ bookableUnitType: 'PROPERTY_UNIT' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
        />,
      );

      const addBedButton = screen.getByRole('button', {
        name: 'Ավելացնել մահճակալ',
      });
      // eslint-disable-next-line no-plusplus -- straightforward fixed-count loop, not worth a reduce/array-from rewrite
      for (let i = 0; i < 12; i++) {
        // eslint-disable-next-line no-await-in-loop -- each click must land before the next (state-dependent disabled check)
        await user.click(addBedButton);
      }

      expect(addBedButton).toBeDisabled();
    });
  });

  // Step L4.2 (brief §4, §14) — roomSizeSqm mirrors `availabilityValidators
  // .js`: optional, strictly positive, <= 1000, at most 2 decimal places
  // (`DECIMAL(6,2)` would otherwise silently round). The default unit type
  // is HOTEL_ROOM, so the field renders without extra setup.
  describe('room size validation (Step L4.2)', () => {
    const ROOM_SIZE_LABEL = 'Սենյակի մակերես (մ²)';

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
      render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

      await submitRoomSize(user, typed);

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ roomSizeSqm: expected }),
      );
    });

    test('blank stays undefined — never coerced to 0', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

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
        render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

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
      render(<BookableUnitForm submitLabel="Save" onSubmit={onSubmit} />);

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
      render(<BookableUnitForm submitLabel="Save" onSubmit={vi.fn()} />);

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
});
