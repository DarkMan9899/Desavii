/**
 * Step L6.3B — the hotel room's optional "Hourly booking" section: off by
 * default and hidden until enabled, HOTEL_ROOM only, every setting required
 * once on, and switching it off on an existing room sends only the switch
 * (the stored settings stay for re-enabling).
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveBookableUnitProfile } from '../../utils/resolveBookableUnitProfile.js';
import BookableUnitForm from './BookableUnitForm.jsx';

vi.mock('./RoomDescriptionEditor.jsx', () => ({
  default: () => <div data-testid="room-description-editor" />,
}));
vi.mock('./RoomAmenitiesEditor.jsx', () => ({
  default: () => <div data-testid="room-amenities-editor" />,
}));
vi.mock('./RoomMediaGallery.jsx', () => ({
  default: () => <div data-testid="room-media-gallery" />,
}));

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

const SECTION = 'Ժամավճարով ամրագրում';
const ENABLE = 'Հասանելի է ժամավճարով ամրագրում';
const RATE = 'Ժամավճար';
const CURRENCY = 'Արժույթ';
const MIN = 'Նվազագույն տևողություն';
const MAX = 'Առավելագույն տևողություն';
const FROM = 'Հասանելի է սկսած';
const UNTIL = 'Հասանելի է մինչև';
const HOTEL_CAPACITY = 'Այս տեսակի սենյակներ';
const REQUIRED = 'Պարտադիր է ժամավճարով ամրագրման համար։';

function renderHotelForm() {
  const onSubmit = vi.fn();
  render(
    <BookableUnitForm
      profile={HOTEL}
      isCreating
      submitLabel="Register"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

async function choose(user, section, label, option) {
  await user.click(within(section).getByRole('button', { name: label }));
  await user.click(screen.getByRole('option', { name: option }));
}

async function fillHourly(user, { min = '2 ժամ', max = '6 ժամ' } = {}) {
  const section = screen.getByRole('group', { name: SECTION });
  await user.type(within(section).getByLabelText(RATE), '8000');
  await choose(user, section, CURRENCY, 'AMD');
  await choose(user, section, MIN, min);
  await choose(user, section, MAX, max);
  await choose(user, section, FROM, '10:00');
  await choose(user, section, UNTIL, '20:00');
}

describe('BookableUnitForm — optional hourly booking (Step L6.3B)', () => {
  test('is off by default: no hourly settings shown and none sent', async () => {
    const user = userEvent.setup();
    const onSubmit = renderHotelForm();
    const section = screen.getByRole('group', { name: SECTION });
    expect(
      within(section).getByRole('checkbox', { name: ENABLE }),
    ).not.toBeChecked();
    expect(within(section).queryByLabelText(RATE)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(HOTEL_CAPACITY), '3');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    const payload = onSubmit.mock.calls[0][0];
    expect(Object.keys(payload).some((key) => key.startsWith('hourly'))).toBe(
      false,
    );
  });

  test('is never offered for a non-hotel unit', () => {
    render(
      <BookableUnitForm
        profile={APARTMENT}
        isCreating
        submitLabel="Register"
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('group', { name: SECTION }),
    ).not.toBeInTheDocument();
  });

  test('enabled with every setting, it sends the full hourly configuration', async () => {
    const user = userEvent.setup();
    const onSubmit = renderHotelForm();
    await user.type(screen.getByLabelText(HOTEL_CAPACITY), '3');
    await user.click(screen.getByRole('checkbox', { name: ENABLE }));
    await fillHourly(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      hourlyEnabled: true,
      hourlyPriceAmount: 8000,
      hourlyPriceCurrency: 'AMD',
      hourlyMinDurationHours: 2,
      hourlyMaxDurationHours: 6,
      hourlyAvailableFrom: '10:00',
      hourlyAvailableUntil: '20:00',
    });
  });

  test('enabled without its settings, nothing is saved and each field says what is missing', async () => {
    const user = userEvent.setup();
    const onSubmit = renderHotelForm();
    await user.type(screen.getByLabelText(HOTEL_CAPACITY), '3');
    await user.click(screen.getByRole('checkbox', { name: ENABLE }));
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit).not.toHaveBeenCalled();
    const section = screen.getByRole('group', { name: SECTION });
    expect(
      within(section).getAllByText(REQUIRED).length,
    ).toBeGreaterThanOrEqual(5);
  });

  test('a maximum shorter than the minimum is refused', async () => {
    const user = userEvent.setup();
    const onSubmit = renderHotelForm();
    await user.type(screen.getByLabelText(HOTEL_CAPACITY), '3');
    await user.click(screen.getByRole('checkbox', { name: ENABLE }));
    await fillHourly(user, { min: '4 ժամ', max: '2 ժամ' });
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Առավելագույնը չի կարող նվազագույնից կարճ լինել։'),
    ).toBeInTheDocument();
  });

  test('switching an hourly room off sends only the switch, keeping its stored settings', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BookableUnitForm
        profile={HOTEL}
        initialValues={{
          bookableUnitType: 'HOTEL_ROOM',
          capacity: 3,
          hourlyEnabled: true,
          hourlyPriceAmount: '8000.00',
          hourlyPriceCurrency: 'AMD',
          hourlyMinDurationHours: 2,
          hourlyMaxDurationHours: 6,
          hourlyAvailableFrom: '10:00',
          hourlyAvailableUntil: '20:00',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
    const section = screen.getByRole('group', { name: SECTION });
    expect(within(section).getByLabelText(RATE)).toHaveValue(8000);

    await user.click(within(section).getByRole('checkbox', { name: ENABLE }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.hourlyEnabled).toBe(false);
    expect(payload).not.toHaveProperty('hourlyPriceAmount');
    expect(payload).not.toHaveProperty('hourlyAvailableFrom');
  });
});
