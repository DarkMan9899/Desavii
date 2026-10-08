import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// The shared Vitest setup (`tests/setup.js`) already initializes a real
// i18next instance (inline EN/HY/RU `common.json` resources, default
// `hy`) via `initReactI18next` — importing the `i18next` package here
// gets that SAME already-initialized instance, never a second one.
import i18n from 'i18next';
import ListingRoomsSection from './ListingRoomsSection.jsx';
import CurrencyProvider from '../../../../../providers/CurrencyProvider.jsx';
import { useListingBookableUnitsQuery } from '../../../queries/useListingBookableUnitsQuery.js';

vi.mock('../../../queries/useListingBookableUnitsQuery.js', () => ({
  useListingBookableUnitsQuery: vi.fn(),
}));
vi.mock('../../../../../api/fx.js', () => ({
  getRates: vi.fn().mockResolvedValue({
    success: true,
    data: {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000', USD: '400.00000000', RUB: '4.50000000' },
      effectiveAt: '2026-01-01',
      source: 'fixture',
    },
    meta: null,
    error: null,
  }),
}));

const AMENITY_GROUPS = [
  {
    code: 'CONNECTIVITY',
    amenities: [
      { value: 1, code: 'WiFi' },
      { value: 2, code: 'Air Conditioning' },
    ],
  },
  {
    code: 'IN_ROOM',
    amenities: [{ value: 3, code: 'Minibar' }],
  },
];

const STANDARD_ROOM = {
  id: 101,
  bookable_unit_type: 'HOTEL_ROOM',
  capacity: 4,
  unit_label: 'Standard Room',
  max_guests: 2,
  bed_configuration: [{ type: 'QUEEN', count: 1 }],
  room_size_sqm: '18.00',
  bathroom_type: 'PRIVATE',
  view_type: 'GARDEN',
  smoking_policy: 'NON_SMOKING',
  base_price_amount: '25000.00',
  base_price_currency: 'AMD',
  translations: [{ language_code: 'en', description: 'A cozy standard room.' }],
  amenity_ids: [1],
  media: [
    {
      id: 1,
      media_type: 'IMAGE',
      url: 'https://example.test/standard-1.jpg',
      thumbnail_url: 'https://example.test/standard-1-thumb.jpg',
      position: 0,
      is_cover: true,
    },
  ],
};

const DELUXE_SUITE = {
  id: 102,
  bookable_unit_type: 'HOTEL_ROOM',
  capacity: 2,
  unit_label: 'Deluxe Suite',
  max_guests: 4,
  bed_configuration: [{ type: 'KING', count: 1 }],
  room_size_sqm: '32.00',
  bathroom_type: 'ENSUITE',
  view_type: 'MOUNTAIN',
  smoking_policy: 'NON_SMOKING',
  base_price_amount: '45000.00',
  base_price_currency: 'AMD',
  translations: [
    { language_code: 'en', description: 'A spacious deluxe suite.' },
  ],
  amenity_ids: [2, 3],
  media: [
    {
      id: 2,
      media_type: 'IMAGE',
      url: 'https://example.test/deluxe-1.jpg',
      thumbnail_url: 'https://example.test/deluxe-1-thumb.jpg',
      position: 0,
      is_cover: true,
    },
  ],
};

function renderSection(props = {}) {
  const finalProps = {
    listingId: 81,
    amenityGroups: AMENITY_GROUPS,
    pricing: {
      pricing_model: 'PER_NIGHT',
      amount: '25000.00',
      currency: 'AMD',
    },
    locale: 'en',
    selectedUnitId: null,
    onSelectUnit: vi.fn(),
    ...props,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider locale={finalProps.locale}>
        {/* eslint-disable-next-line react/jsx-props-no-spreading -- test-only prop overrides */}
        <ListingRoomsSection {...finalProps} />
      </CurrencyProvider>
    </QueryClientProvider>,
  );
}

describe('ListingRoomsSection (Sprint C-2)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useListingBookableUnitsQuery.mockReset();
  });

  test('renders one real room card per HOTEL_ROOM unit — including a single-room hotel', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM],
      isPending: false,
    });
    renderSection();

    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
    expect(screen.getByText('Standard Room')).toBeInTheDocument();
    expect(screen.queryByText('Deluxe Suite')).not.toBeInTheDocument();
  });

  test('an unlabeled room falls back to its generic unit-type name, never the section\'s own "Rooms" heading text', () => {
    const unlabeledRoom = { ...STANDARD_ROOM, unit_label: null };
    useListingBookableUnitsQuery.mockReturnValue({
      data: [unlabeledRoom],
      isPending: false,
    });
    renderSection();

    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hotel room' }),
    ).toBeInTheDocument();
  });

  test('renders every room type for a multi-room hotel, each with its own real data', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM, DELUXE_SUITE],
      isPending: false,
    });
    renderSection();

    expect(screen.getByText('Standard Room')).toBeInTheDocument();
    expect(screen.getByText('Deluxe Suite')).toBeInTheDocument();
    expect(screen.getByText('A cozy standard room.')).toBeInTheDocument();
    expect(screen.getByText('A spacious deluxe suite.')).toBeInTheDocument();
  });

  test('never renders a Rooms section for a listing with no HOTEL_ROOM units', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ id: 1, bookable_unit_type: 'PROPERTY_UNIT', capacity: 1 }],
      isPending: false,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  test('shows max_guests ("Sleeps N"), never the pooled room capacity, as the guest count', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM],
      isPending: false,
    });
    renderSection();

    expect(screen.getByText('Sleeps 2')).toBeInTheDocument();
    expect(screen.queryByText(/Sleeps 4/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/rooms? (left|available)/i),
    ).not.toBeInTheDocument();
  });

  test('selecting a room card calls onSelectUnit with that exact unit id, and marks it selected', async () => {
    const user = userEvent.setup();
    const onSelectUnit = vi.fn();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM, DELUXE_SUITE],
      isPending: false,
    });
    renderSection({ onSelectUnit });

    await user.click(
      screen.getByRole('button', { name: 'Select Deluxe Suite' }),
    );
    expect(onSelectUnit).toHaveBeenCalledWith(102);
  });

  test('the selected room shows an obvious, non-color-only indicator', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM, DELUXE_SUITE],
      isPending: false,
    });
    renderSection({ selectedUnitId: 101 });

    // "Selected" appears twice — the card's own badge and its now-
    // disabled action button both say so, never color alone.
    expect(screen.getAllByText('Selected').length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole('button', { name: 'Select Standard Room' }),
    ).toBeDisabled();
  });

  test('opening a room detail shows its own gallery, description, beds, size, bathroom, view, and amenities — never the sibling room’s', async () => {
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM, DELUXE_SUITE],
      isPending: false,
    });
    renderSection();

    await user.click(
      screen.getByRole('button', { name: 'View Standard Room details' }),
    );

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('A cozy standard room.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('A spacious deluxe suite.'),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/1 queen bed/)).toBeInTheDocument();
    expect(within(dialog).getByText('18 m²')).toBeInTheDocument();
    expect(within(dialog).getByText('Private bathroom')).toBeInTheDocument();
    expect(within(dialog).getByText('Garden view')).toBeInTheDocument();
    expect(within(dialog).getByText('WiFi')).toBeInTheDocument();
    expect(within(dialog).queryByText('Minibar')).not.toBeInTheDocument();
    // Room media carries no partner-authored alt_text/caption (Sprint C-1
    // scope), so ListingGallery's own established fallback applies —
    // same "{{title}} — photo N of total" pattern the main listing
    // gallery already uses for an unlabeled image.
    expect(
      within(dialog).getByRole('img', {
        name: 'Standard Room — photo 1 of 1',
      }),
    ).toHaveAttribute('src', 'https://example.test/standard-1-thumb.jpg');
  });

  test('selecting a room from its detail view closes the detail and updates the canonical selection', async () => {
    const user = userEvent.setup();
    const onSelectUnit = vi.fn();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM, DELUXE_SUITE],
      isPending: false,
    });
    renderSection({ onSelectUnit });

    await user.click(
      screen.getByRole('button', { name: 'View Standard Room details' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Select room' }),
    );

    expect(onSelectUnit).toHaveBeenCalledWith(101);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a room with no room-specific photos shows an honest fallback, never the wrong room’s photo', async () => {
    const user = userEvent.setup();
    const noPhotoRoom = { ...STANDARD_ROOM, media: [] };
    useListingBookableUnitsQuery.mockReturnValue({
      data: [noPhotoRoom],
      isPending: false,
    });
    renderSection();

    await user.click(
      screen.getByRole('button', { name: 'View Standard Room details' }),
    );
    expect(
      within(screen.getByRole('dialog')).getByText('No room photos available'),
    ).toBeInTheDocument();
  });

  test('Sprint C-3: shows a "select dates" hint and no stay claims before a valid date range is chosen', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM],
      isPending: false,
    });
    renderSection();

    expect(
      screen.getByText(
        'Select your dates in the reservation panel to see live availability and pricing for each room.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/night stay total/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sold out/i)).not.toBeInTheDocument();
  });

  test('Sprint C-3: fetches with checkIn/checkOut once a valid dateRange is supplied, never with a plain date-less read', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM],
      isPending: false,
    });
    renderSection({
      dateRange: { start: '2027-03-01', end: '2027-03-04' },
    });

    expect(useListingBookableUnitsQuery).toHaveBeenCalledWith(81, {
      checkIn: '2027-03-01',
      checkOut: '2027-03-04',
    });
  });

  test('Sprint C-3: renders the server stay total, night count, and a scarcity badge once stay data is present, and drops the hint', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          ...STANDARD_ROOM,
          availability_status_for_stay: 'LOW',
          remaining_count_for_stay: 2,
          night_count_for_stay: 3,
          stay_total_amount: '75000.00',
          stay_total_currency: 'AMD',
        },
      ],
      isPending: false,
    });
    renderSection({
      dateRange: { start: '2027-03-01', end: '2027-03-04' },
    });

    expect(
      screen.queryByText(/Select your dates in the reservation panel/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('3-night stay total')).toBeInTheDocument();
    expect(screen.getByText('Only 2 left for these dates')).toBeInTheDocument();
  });

  test('Sprint C-3: a SOLD_OUT room disables Select room (never removes the card) and still allows View room', async () => {
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          ...STANDARD_ROOM,
          availability_status_for_stay: 'SOLD_OUT',
          remaining_count_for_stay: 0,
          night_count_for_stay: 3,
          stay_total_amount: '75000.00',
          stay_total_currency: 'AMD',
        },
      ],
      isPending: false,
    });
    renderSection({
      dateRange: { start: '2027-03-01', end: '2027-03-04' },
    });

    expect(screen.getByText('Standard Room')).toBeInTheDocument();
    expect(
      screen.getAllByText('Sold out for these dates').length,
    ).toBeGreaterThan(0);
    const selectButton = screen.getByRole('button', {
      name: 'Sold out for these dates',
    });
    expect(selectButton).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'View Standard Room details' }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: 'View Standard Room details' }),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Select room',
      }),
    ).toBeDisabled();
  });

  test('renders honest HY structured-value labels, never raw enum codes', async () => {
    await i18n.changeLanguage('hy');
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [STANDARD_ROOM],
      isPending: false,
    });
    renderSection({ locale: 'hy' });

    await user.click(
      screen.getByRole('button', { name: /Դիտել Standard Room/ }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Սեփական լոգարան')).toBeInTheDocument();
    expect(within(dialog).getByText('Այգու տեսարան')).toBeInTheDocument();
    expect(within(dialog).queryByText('PRIVATE')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('GARDEN')).not.toBeInTheDocument();
  });
});

// Step L6.3A — the room details a guest decides by: the full sleeping
// setup, the meal basis and prices in their own currency.
describe('ListingRoomsSection — room decision information (Step L6.3A)', () => {
  const FAMILY_ROOM = {
    ...STANDARD_ROOM,
    id: 103,
    unit_label: 'Family Room',
    bed_configuration: [
      { type: 'DOUBLE', count: 1 },
      { type: 'SINGLE', count: 2 },
      { type: 'CHILD_BED', count: 1 },
      { type: 'CRIB', count: 1 },
    ],
    meal_plan: 'BREAKFAST_INCLUDED',
  };

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useListingBookableUnitsQuery.mockReset();
  });

  test('the card shows the meal basis and the natural bed setup', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [FAMILY_ROOM],
      isPending: false,
    });
    renderSection();

    expect(screen.getByText('Breakfast included')).toBeInTheDocument();
    expect(
      screen.getByText(
        /1 double bed, 2 single beds, 1 child bed available, 1 baby cot available/,
      ),
    ).toBeInTheDocument();
  });

  test('the room detail lists each bed type and the meals on their own lines', async () => {
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [FAMILY_ROOM],
      isPending: false,
    });
    renderSection();

    await user.click(screen.getByRole('button', { name: /View Family Room/ }));
    const dialog = screen.getByRole('dialog');
    const sleeping = within(dialog).getByRole('heading', {
      name: 'Sleeping arrangements',
    }).parentElement;
    const beds = within(sleeping).getAllByRole('listitem');
    expect(beds.map((item) => item.textContent)).toEqual([
      '1 double bed',
      '2 single beds',
      '1 child bed available',
      '1 baby cot available',
    ]);
    expect(
      within(dialog).getByRole('heading', { name: 'Meals' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Breakfast included')).toBeInTheDocument();
  });

  test('a room with no stated beds or meals simply omits them — no empty headings', async () => {
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          ...STANDARD_ROOM,
          bed_configuration: null,
          meal_plan: null,
          bathroom_type: null,
          view_type: null,
          smoking_policy: null,
          room_size_sqm: null,
        },
      ],
      isPending: false,
    });
    renderSection();

    await user.click(
      screen.getByRole('button', { name: /View Standard Room/ }),
    );
    const dialog = screen.getByRole('dialog');
    ['Sleeping arrangements', 'Meals', 'Room details'].forEach((heading) =>
      expect(
        within(dialog).queryByRole('heading', { name: heading }),
      ).not.toBeInTheDocument(),
    );
  });

  test('a non-AMD room price is shown in its own currency, never as AMD', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          ...STANDARD_ROOM,
          base_price_amount: '120.00',
          base_price_currency: 'USD',
        },
      ],
      isPending: false,
    });
    renderSection();

    expect(screen.getByText(/\$120\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/֏/)).not.toBeInTheDocument();
  });

  test.each([
    [
      'hy',
      'Նախաճաշը ներառված է',
      /1 երկտեղանոց մահճակալ, 2 մեկտեղանոց մահճակալ, Հասանելի է 1 մանկական մահճակալ/,
    ],
    [
      'ru',
      'Завтрак включён',
      /1 двуспальная кровать, 2 односпальные кровати, Доступна 1 детская кровать/,
    ],
  ])('%s renders natural bed and meal wording', async (lng, meal, beds) => {
    await i18n.changeLanguage(lng);
    useListingBookableUnitsQuery.mockReturnValue({
      data: [FAMILY_ROOM],
      isPending: false,
    });
    renderSection({ locale: lng });

    expect(screen.getByText(meal)).toBeInTheDocument();
    expect(screen.getByText(beds)).toBeInTheDocument();
    expect(
      screen.queryByText(/BREAKFAST_INCLUDED|CHILD_BED/),
    ).not.toBeInTheDocument();
  });
});

describe('ListingRoomsSection — optional hourly stays (Step L6.3B)', () => {
  const DAY_ROOM = {
    ...STANDARD_ROOM,
    id: 104,
    unit_label: 'Day Room',
    hourly_enabled: true,
    hourly_price_amount: '8000.00',
    hourly_price_currency: 'AMD',
    hourly_min_duration_hours: 2,
    hourly_max_duration_hours: 6,
    hourly_available_from: '10:00',
    hourly_available_until: '20:00',
  };

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useListingBookableUnitsQuery.mockReset();
  });

  test('a nightly-only room says nothing about hourly booking', async () => {
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ ...STANDARD_ROOM, hourly_enabled: false }],
      isPending: false,
    });
    renderSection();

    expect(
      screen.queryByText('Hourly booking available'),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /View Standard Room/ }),
    );
    expect(
      within(screen.getByRole('dialog')).queryByRole('heading', {
        name: 'Hourly stays',
      }),
    ).not.toBeInTheDocument();
  });

  test('an hourly room keeps its nightly price and adds its hourly rate', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [DAY_ROOM],
      isPending: false,
    });
    renderSection();

    expect(screen.getByText('Hourly booking available')).toBeInTheDocument();
    expect(screen.getByText(/8,000/)).toBeInTheDocument();
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  test('the room detail explains the hourly window and duration range', async () => {
    const user = userEvent.setup();
    useListingBookableUnitsQuery.mockReturnValue({
      data: [DAY_ROOM],
      isPending: false,
    });
    renderSection();

    await user.click(screen.getByRole('button', { name: /View Day Room/ }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Hourly stays' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Available from 10:00 to 20:00'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('From 2 to 6 hours')).toBeInTheDocument();
  });
});
