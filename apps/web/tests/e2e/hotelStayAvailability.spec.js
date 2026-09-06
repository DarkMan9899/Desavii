/**
 * Sprint C-3 (Date-Range Room Availability + Stay Pricing) — end to end
 * against the real backend + a fresh, throwaway HOTEL listing (registered
 * directly via the API, never seed data — mirrors
 * `p22bCustomerRoomSelection.spec.js`'s own `createThrowawayListing`
 * pattern exactly, so this spec never collides with demo fixtures or
 * other specs sharing them, and its AVAILABLE/LOW/SOLD_OUT room
 * capacities are deterministic rather than dependent on whatever the
 * shared demo listing's current consumption happens to be).
 *
 * Proves the actual customer-facing flow this sprint added: no stay claim
 * before a valid date range, a real server-derived stay snapshot once
 * dates are picked, a sold-out room that cannot be selected, an available
 * room that can, a date change invalidating a stale room selection, and
 * the exact selected room/dates/stay-total reaching checkout — never a
 * client-side re-derivation of any of it.
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(page, credentials, expectedUrlPattern) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function accessibleDayName(isoDateStr) {
  const [year, month, day] = isoDateStr.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${monthName} ${day}, ${year}`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Reads the calendar's own currently-displayed "{Month} {Year}" heading
 * (Intl `{month: 'long', year: 'numeric'}`, see `DatePicker.jsx`) and
 * clicks "Next month" until it reaches the target month — never assumes
 * the calendar reopens on today's month. It doesn't: a second
 * `pickDateRange` call on the same widget reopens wherever the
 * previously-picked range left it, not back at today, which a fixed
 * "months from today" delta (this helper's own first draft) got wrong.
 */
async function navigateToMonth(page, targetDate) {
  const targetLabel = `${MONTH_NAMES[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
  // eslint-disable-next-line no-constant-condition -- bounded below
  while (true) {
    // eslint-disable-next-line no-await-in-loop -- sequential UI navigation
    const currentLabel = await page
      .locator('[aria-live="polite"]')
      .first()
      .textContent();
    if (currentLabel?.trim() === targetLabel) return;
    // eslint-disable-next-line no-await-in-loop -- sequential UI navigation
    await page.getByRole('button', { name: 'Next month' }).click();
  }
}

/** Opens the reservation widget's DatePicker and picks a check-in/check-out range. */
async function pickDateRange(page, checkIn, checkOut) {
  await page.getByLabel('Dates', { exact: true }).click();
  await navigateToMonth(page, checkIn);
  await page
    .getByRole('gridcell', {
      name: new RegExp(`^${accessibleDayName(isoDate(checkIn))}`),
    })
    .click();

  await navigateToMonth(page, checkOut);
  await page
    .getByRole('gridcell', {
      name: new RegExp(`^${accessibleDayName(isoDate(checkOut))}`),
    })
    .click();
}

/**
 * Creates a fresh, published, throwaway HOTEL listing with three real
 * room types of deliberately distinct capacities — a "Spacious Room"
 * (capacity 10, clears `LOW_STOCK_THRESHOLD` so it reads AVAILABLE), a
 * "Cozy Room" (capacity 3, reads LOW even unconsumed), and a "Tiny Room"
 * (capacity 1, fully consumed below via a real hold so it reads
 * SOLD_OUT) — mirrors `p22bCustomerRoomSelection.spec.js`'s own
 * `createThrowawayListing` helper.
 */
async function createThrowawayHotel() {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: VENDOR });
  const { access_token: accessToken } = (await loginRes.json()).data;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const createRes = await ctx.post('listings', {
    headers: authHeaders,
    data: {
      partnerId: 1,
      listingType: 'HOTEL',
      translations: [{ languageId: 1, title: `C-3 Stay Test ${Date.now()}` }],
    },
  });
  const listing = (await createRes.json()).data;

  await ctx.patch(`listings/${listing.id}`, {
    headers: authHeaders,
    data: { location: { latitude: 40.1772, longitude: 44.5035 } },
  });
  await ctx.post(`listings/${listing.id}/media`, {
    headers: { ...authHeaders, 'Content-Type': 'image/png' },
    data: ONE_PX_PNG,
  });

  const units = [
    {
      unitLabel: 'Spacious Room',
      capacity: 10,
      maxGuests: 2,
      basePriceAmount: 20000,
      basePriceCurrency: 'AMD',
    },
    {
      unitLabel: 'Cozy Room',
      capacity: 3,
      maxGuests: 2,
      basePriceAmount: 15000,
      basePriceCurrency: 'AMD',
    },
    {
      unitLabel: 'Tiny Room',
      capacity: 1,
      maxGuests: 1,
      basePriceAmount: 10000,
      basePriceCurrency: 'AMD',
    },
  ];
  const unitIdByLabel = {};
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    // eslint-disable-next-line no-await-in-loop -- sequential setup
    const unitRes = await ctx.post('availability/units', {
      headers: authHeaders,
      data: { listingId: listing.id, bookableUnitType: 'HOTEL_ROOM', ...unit },
    });
    // eslint-disable-next-line no-await-in-loop -- sequential setup
    unitIdByLabel[unit.unitLabel] = (await unitRes.json()).data.id;
  }

  await ctx.post(`listings/${listing.id}/publish`, { headers: authHeaders });
  await ctx.dispose();
  return { listingId: listing.id, unitIdByLabel };
}

/** Fully consumes a unit's capacity for the given range via a real customer hold — the same transactional path a real booking attempt goes through. */
async function soldOutUnitForRange(unitId, dateFrom, dateTo, quantity) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: CUSTOMER });
  const { access_token: accessToken } = (await loginRes.json()).data;
  await ctx.post('booking-holds', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity }] },
  });
  await ctx.dispose();
}

async function deleteListing(request, listingId) {
  try {
    const loginRes = await request.post(`${API_BASE}auth/login`, {
      data: VENDOR,
    });
    if (!loginRes.ok()) return;
    const { data } = await loginRes.json();
    await request.delete(`${API_BASE}listings/${listingId}`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
  } catch {
    // Best-effort teardown only — mirrors partnerBookableUnits.spec.js.
  }
}

test.describe('Sprint C-3 — Hotel date-range stay availability', () => {
  let listingId;

  test.afterEach(async ({ request }) => {
    if (!listingId) return;
    await deleteListing(request, listingId);
    listingId = undefined;
  });

  test('the full stay flow: no claim before dates, a real server stay snapshot after, a sold-out room blocked, an available room selectable, a date change invalidating the stale pick, and the exact room/dates/total reaching checkout', async ({
    page,
  }) => {
    const checkIn = futureDate(150);
    const checkOut = futureDate(153);
    const otherCheckIn = futureDate(200);
    const otherCheckOut = futureDate(202);
    const created = await createThrowawayHotel();
    listingId = created.listingId;
    await soldOutUnitForRange(
      created.unitIdByLabel['Tiny Room'],
      isoDate(checkIn),
      isoDate(checkOut),
      1,
    );

    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${listingId}`);

    const roomsSection = page.getByRole('region', { name: 'Rooms' });
    await expect(
      roomsSection.getByRole('heading', { name: 'Rooms', level: 2 }),
    ).toBeVisible({ timeout: 15_000 });

    // 1. No stay-availability claim before a valid range exists.
    await expect(
      page.getByText(
        'Select your dates in the reservation panel to see live availability and pricing for each room.',
      ),
    ).toBeVisible();
    await expect(roomsSection.getByText(/night stay total/)).toHaveCount(0);
    await expect(roomsSection.getByText(/sold out/i)).toHaveCount(0);
    await expect(roomsSection.getByText(/left for these dates/)).toHaveCount(0);

    // 2. A valid check-in/check-out triggers the real stay query — the
    // hint disappears and every card gets a server-derived snapshot.
    await pickDateRange(page, checkIn, checkOut);
    await expect(
      page.getByText('Select your dates in the reservation panel'),
    ).toHaveCount(0);

    // 3. Real server-derived remaining quantity and stay totals appear —
    // each room's own base price (20,000 / 15,000 / 10,000 per night)
    // makes its 3-night total (60,000 / 45,000 / 30,000) unique, so these
    // assertions prove the CORRECT room's own figure, not just "a" total.
    await expect(page.getByText('Only 3 left for these dates')).toBeVisible();
    await expect(page.getByText(/60,000/)).toBeVisible();
    await expect(page.getByText(/45,000/)).toBeVisible();
    await expect(page.getByText(/30,000/)).toBeVisible();

    // 4. The sold-out room cannot be selected — disabled, never removed.
    await expect(
      page.getByText('Sold out for these dates').first(),
    ).toBeVisible();
    const tinySelectButton = page.getByRole('button', {
      name: 'Sold out for these dates',
    });
    await expect(tinySelectButton).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'View Tiny Room details' }),
    ).toBeEnabled();

    // 5. An available room can be selected, and the reservation widget
    // (the "one canonical selection") reflects it immediately.
    await page.getByRole('button', { name: 'Select Spacious Room' }).click();
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('3-night stay')).toBeVisible();
    await expect(sidebar.getByLabel('Unit')).toContainText('Spacious Room');

    // 6. Changing the stay dates clears the now-unchecked room selection —
    // the widget's own quantity/guest fields (only shown once a room is
    // selected) disappear until the customer picks again.
    await pickDateRange(page, otherCheckIn, otherCheckOut);
    await expect(sidebar.getByLabel('Guests')).toHaveCount(0);
    await expect(sidebar.getByLabel('Unit')).toContainText('Select a unit');

    // 7. Re-pick the same available room for the new range and complete
    // the hand-off — the exact room/dates/stay-total reach checkout.
    await page.getByRole('button', { name: 'Select Spacious Room' }).click();
    await expect(
      page.getByRole('button', { name: 'Check availability' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Check availability' }).click();
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);

    await expect(page.getByText('Room / unit type')).toBeVisible();
    await expect(page.getByText('Spacious Room')).toBeVisible();
    await expect(page.getByText('Nights')).toBeVisible();
    // 2 nights at 20,000/night = 40,000, the server-computed stay total.
    await expect(page.getByText(/40,000/)).toBeVisible();

    await page.getByRole('button', { name: 'Confirm booking request' }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/);
    await expect(page.getByText('Room / unit type')).toBeVisible();
    await expect(page.getByText('Spacious Room')).toBeVisible();
  });
});
