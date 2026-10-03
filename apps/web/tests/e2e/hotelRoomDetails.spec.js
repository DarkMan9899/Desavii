/**
 * Step L6.3A — hotel room details and decision information, end to end.
 *
 * A Partner creates a room type through the real rooms editor (2 single
 * beds, 1 double bed, 1 child bed, breakfast included, room size, private
 * bathroom), adds room amenities, reloads and finds every value still
 * there; a traveler then sees the same information on the public room card
 * and room detail. A second room stays distinguishable, and a minimal room
 * with none of these details remains selectable.
 *
 * Runs against the demo-seeded test database. Room names are salted per
 * run, so reruns never collide.
 */

import { test, expect, request as playwrightRequest } from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const HOTEL_SLUG = 'demo-vendor-boutique-yerevan-hotel';
const RUN = Date.now().toString(36);
const FAMILY_ROOM = `Family Room ${RUN}`;
const MINIMAL_ROOM = `Minimal Room ${RUN}`;

async function api(token) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function hotelListing() {
  const ctx = await api();
  const res = await ctx.get(`listings/${HOTEL_SLUG}`);
  const { data } = await res.json();
  await ctx.dispose();
  return data;
}

async function vendorToken() {
  const ctx = await api();
  const res = await ctx.post('auth/login', { data: VENDOR });
  const token = (await res.json()).data.access_token;
  await ctx.dispose();
  return token;
}

async function loginAsVendor(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(VENDOR.email);
  await page.getByLabel('Password').fill(VENDOR.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

async function choose(page, selectLabel, optionLabel) {
  await page.getByRole('button', { name: selectLabel, exact: true }).click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

async function setNumber(page, label, value) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
}

/** The Partner's summary card for one room type, by its exact name. */
function roomRow(page, name) {
  return (
    page
      .locator('strong', { hasText: name })
      // strong -> title row -> the summary card's stack.
      .locator('xpath=ancestor::*[2]')
  );
}

function roomCard(page, name) {
  return page
    .getByRole('heading', { level: 3, name })
    .locator('xpath=ancestor::*[.//button[normalize-space()="View room"]][1]');
}

test.describe('Step L6.3A — hotel room details', () => {
  test('a Partner describes a room, it survives a reload, and travelers see the same details', async ({
    page,
  }) => {
    const hotel = await hotelListing();
    await loginAsVendor(page);
    await page.goto(`/en/partner/listings/${hotel.id}/rooms`);
    await page.getByRole('button', { name: 'Add room type' }).click();

    await page.getByLabel('Name', { exact: true }).fill(FAMILY_ROOM);
    await setNumber(page, 'Rooms of this type', 2);
    await setNumber(page, 'Max guests per room', 4);
    await setNumber(page, 'Single bed', 2);
    await setNumber(page, 'Double bed', 1);
    await setNumber(page, 'Child bed', 1);
    await setNumber(page, 'Room size (m²)', 26);
    await choose(page, 'Bathroom', 'Private bathroom');
    await choose(page, 'Meal plan', 'Breakfast included');
    await page.getByLabel('Base price per night').fill('30000');
    await choose(page, 'Currency', 'AMD');
    await page.getByRole('button', { name: 'Add room type' }).last().click();

    const row = roomRow(page, FAMILY_ROOM);
    await expect(row).toContainText(
      '2 single beds, 1 double bed, 1 child bed available',
    );
    await expect(row).toContainText('Breakfast included');

    // Room amenities are added on the created room.
    await row.getByRole('button', { name: 'Edit' }).click();
    // The styled box intercepts the input's pointer events — click the
    // label text, as a real user does (same as the room authoring spec).
    await page.getByText('Hair dryer', { exact: true }).click();
    await page.getByText('Bathtub', { exact: true }).click();
    await page.getByRole('button', { name: 'Save amenities' }).click();
    await expect(page.getByRole('checkbox', { name: 'Bathtub' })).toBeChecked();

    // Resume: a reload keeps every value.
    await page.reload();
    await roomRow(page, FAMILY_ROOM)
      .getByRole('button', { name: 'Edit' })
      .click();
    await expect(page.getByLabel('Single bed', { exact: true })).toHaveValue(
      '2',
    );
    await expect(page.getByLabel('Double bed', { exact: true })).toHaveValue(
      '1',
    );
    await expect(page.getByLabel('Child bed', { exact: true })).toHaveValue(
      '1',
    );
    await expect(
      page.getByLabel('Room size (m²)', { exact: true }),
    ).toHaveValue('26.00');
    await expect(
      page.getByRole('button', { name: 'Meal plan', exact: true }),
    ).toContainText('Breakfast included');
    await expect(
      page.getByRole('button', { name: 'Bathroom', exact: true }),
    ).toContainText('Private bathroom');
    await expect(
      page.getByRole('checkbox', { name: 'Hair dryer' }),
    ).toBeChecked();

    // The traveler sees the same room.
    await page.goto(`/en/listings/${HOTEL_SLUG}`);
    const card = roomCard(page, FAMILY_ROOM);
    await expect(card).toContainText('Breakfast included');
    await expect(card).toContainText(
      '2 single beds, 1 double bed, 1 child bed available',
    );
    await expect(card).toContainText('Private bathroom');
    await expect(card).toContainText('26 m²');
    await expect(card).toContainText('Sleeps 4');

    await card
      .getByRole('button', { name: `View ${FAMILY_ROOM} details` })
      .click();
    const dialog = page.getByRole('dialog');
    const sleeping = dialog
      .getByRole('heading', { name: 'Sleeping arrangements' })
      .locator('..');
    await expect(sleeping.getByRole('listitem')).toHaveText([
      '2 single beds',
      '1 double bed',
      '1 child bed available',
    ]);
    await expect(dialog).toContainText('Breakfast included');
    await expect(dialog).toContainText('Hair dryer');
    await expect(dialog).toContainText('Bathtub');
  });

  test('a second room stays distinguishable, and a minimal room is still selectable', async ({
    page,
  }) => {
    const hotel = await hotelListing();
    const ctx = await api(await vendorToken());
    const created = await ctx.post('availability/units', {
      data: {
        listingId: hotel.id,
        bookableUnitType: 'HOTEL_ROOM',
        capacity: 1,
        unitLabel: MINIMAL_ROOM,
        basePriceAmount: 15000,
        basePriceCurrency: 'AMD',
      },
    });
    expect(created.status()).toBe(201);
    await ctx.dispose();

    await page.goto(`/en/listings/${HOTEL_SLUG}`);
    const standard = roomCard(page, 'Standard Room');
    const deluxe = roomCard(page, 'Deluxe Suite');
    await expect(standard).toContainText(
      'Breakfast available for an extra charge',
    );
    await expect(standard).toContainText('1 double bed');
    await expect(deluxe).toContainText('Breakfast included');
    await expect(deluxe).toContainText('1 baby cot available');
    await expect(standard).not.toContainText('baby cot');

    const minimal = roomCard(page, MINIMAL_ROOM);
    await expect(minimal).not.toContainText(/included|meals|bed/i);
    const select = minimal.getByRole('button', {
      name: `Select ${MINIMAL_ROOM}`,
    });
    await select.click();
    await expect(select).toHaveText('Selected');
    await expect(select).toBeDisabled();
  });
});
