/**
 * Regression — on a phone (390x844) the listing page's reservation widget
 * lives in `MobileBookingBar`'s bottom `Drawer`. `DatePicker` used to
 * portal its calendar to `document.body` at `$z-dropdown`, BENEATH the
 * drawer's `$z-drawer` layer: `document.elementFromPoint()` at a day cell
 * returned the drawer content underneath, so no day could be tapped and
 * phone customers could not pick dates at all. The calendar now portals
 * into the enclosing overlay's dialog (`usePortalContainer`).
 *
 * Each test proves a day is genuinely hit-testable (`elementFromPoint` at
 * its centre is the day itself), fully inside the viewport (not clipped),
 * and that a real touch tap lands — the trigger shows the picked date —
 * for the nightly "Dates" range picker and, on a room with hourly booking
 * enabled (Step L6.3B), the hourly "Date" picker. The flows then carry on
 * in the drawer (room Select, hourly Start/End Selects, rooms, guests and
 * the server quote), and Escape closes only the open popup — the calendar
 * or a Select — leaving the drawer open; a second Escape closes the drawer.
 *
 * Runs against a fresh, throwaway HOTEL listing created through the API
 * and published by an admin (never seed data), mirroring
 * `hotelStayAvailability.spec.js`, so it never depends on demo fixtures.
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const PHONE_VIEWPORT = { width: 390, height: 844 };
const PUBLICATION_PERIOD_DAYS = 90;
const BOOK_CTA = 'Request to book';
const NIGHT_ROOM = 'Night Room';
const HOURLY_ROOM = 'Hourly Room';
const CHECK_IN_DAYS_AHEAD = 10;
const CHECK_OUT_DAYS_AHEAD = 12;
const HOURLY_DAYS_AHEAD = 11;
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
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

function futureISO(daysFromNow) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** `DatePicker`'s own day `aria-label` / trigger format: "Oct 18, 2026". */
function displayDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

async function apiToken(credentials) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.post('auth/login', { data: credentials });
  const token = (await res.json()).data.access_token;
  await ctx.dispose();
  return token;
}

async function apiCall(method, path, token, body) {
  const ctx = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const res = await ctx[method](path, body ? { data: body } : undefined);
  const json = await res.json();
  await ctx.dispose();
  return { status: res.status(), json };
}

async function createThrowawayHotel(vendorToken, adminToken) {
  const created = await apiCall('post', 'listings', vendorToken, {
    partnerId: 1,
    listingType: 'HOTEL',
    translations: [
      { languageId: 1, title: `E2E Drawer DatePicker ${Date.now()}` },
    ],
  });
  const listingId = created.json.data.id;
  await apiCall('patch', `listings/${listingId}`, vendorToken, {
    location: { latitude: 40.1772, longitude: 44.5035 },
  });
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  await ctx.post(`listings/${listingId}/media`, {
    headers: {
      Authorization: `Bearer ${vendorToken}`,
      'Content-Type': 'image/png',
    },
    data: ONE_PX_PNG,
  });
  await ctx.dispose();

  const units = [
    { unitLabel: NIGHT_ROOM, capacity: 3, basePriceAmount: 30000 },
    {
      unitLabel: HOURLY_ROOM,
      capacity: 2,
      basePriceAmount: 40000,
      hourlyEnabled: true,
      hourlyPriceAmount: 8000,
      hourlyPriceCurrency: 'AMD',
      hourlyMinDurationHours: 2,
      hourlyMaxDurationHours: 6,
      hourlyAvailableFrom: '10:00',
      hourlyAvailableUntil: '20:00',
    },
  ];
  for (let i = 0; i < units.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential setup
    const unit = await apiCall('post', 'availability/units', vendorToken, {
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      maxGuests: 2,
      basePriceCurrency: 'AMD',
      ...units[i],
    });
    expect(unit.status).toBe(201);
  }

  const submitted = await apiCall(
    'post',
    `listings/${listingId}/submit-for-review`,
    vendorToken,
    { publicationPeriodDays: PUBLICATION_PERIOD_DAYS },
  );
  expect(submitted.status).toBe(200);
  const published = await apiCall(
    'post',
    `listings/${listingId}/publish`,
    adminToken,
    { publicationPeriodDays: PUBLICATION_PERIOD_DAYS },
  );
  expect(published.status).toBe(200);
  return listingId;
}

/** Opens the mobile booking bar's drawer and returns it. */
async function openBookingDrawer(page) {
  await page.getByRole('button', { name: BOOK_CTA }).click();
  const drawer = page.getByRole('dialog', { name: BOOK_CTA });
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Clicks "Next month" until the open calendar shows the target month. */
async function navigateToMonth(page, isoDate) {
  const [year, month] = isoDate.split('-').map(Number);
  const targetLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  // eslint-disable-next-line no-constant-condition -- ends on the target month
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

/**
 * The exact defect: asserts the topmost element at the day's centre IS the
 * day (not drawer content painted over it) and that the whole calendar is
 * inside the viewport (not clipped), then taps it with a real touch.
 */
async function tapDay(page, isoDate) {
  await navigateToMonth(page, isoDate);
  const day = page.getByRole('gridcell', {
    name: new RegExp(`^${displayDate(isoDate)}`),
  });
  const isTopmost = await day.evaluate((cell) => {
    const rect = cell.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return cell === hit || cell.contains(hit);
  });
  expect(isTopmost).toBe(true);
  const calendar = await page.getByRole('grid').boundingBox();
  expect(calendar.x).toBeGreaterThanOrEqual(0);
  expect(calendar.x + calendar.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
  expect(calendar.y + calendar.height).toBeLessThanOrEqual(
    PHONE_VIEWPORT.height,
  );
  await day.tap();
}

/** Opens a Select in the drawer by touch and taps the option. */
async function tapOption(page, drawer, label, option) {
  await drawer.getByRole('button', { name: label, exact: true }).tap();
  await page.getByRole('option', { name: option }).first().tap();
}

/** Opens a Select in the drawer; Escape must close its list, not the drawer. */
async function expectEscapeClosesOnlyList(page, drawer, label) {
  await drawer.getByRole('button', { name: label, exact: true }).tap();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(drawer).toBeVisible();
}

async function login(page) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(CUSTOMER.email);
  await page.getByLabel('Password').fill(CUSTOMER.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

/** Opens the hourly room's drawer in "Book by hour" mode. */
async function openHourlyDrawer(page, listingId) {
  await page.goto(`/en/listings/${listingId}`);
  await page
    .getByRole('button', { name: `Select ${HOURLY_ROOM}` })
    .tap({ timeout: 15_000 });
  const drawer = await openBookingDrawer(page);
  // The radio's styled circle overlays the input — tap the label text,
  // what a real user taps (same as hourlyHotelRooms.spec.js).
  await drawer.getByText('Book by hour', { exact: true }).tap();
  await expect(
    drawer.getByRole('radio', { name: 'Book by hour' }),
  ).toBeChecked();
  return drawer;
}

test.describe('Mobile booking drawer — date pickers are tappable', () => {
  test.use({ viewport: PHONE_VIEWPORT, hasTouch: true });
  // Listing setup + a cold dev-server compile of the listing route.
  test.describe.configure({ timeout: 90_000 });

  let listingId;
  let vendorToken;

  test.beforeAll(async () => {
    vendorToken = await apiToken(VENDOR);
    listingId = await createThrowawayHotel(vendorToken, await apiToken(ADMIN));
  });

  test.afterAll(async () => {
    if (!listingId) return;
    const ctx = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${vendorToken}` },
    });
    // Best-effort teardown only — mirrors hotelStayAvailability.spec.js.
    await ctx.delete(`listings/${listingId}`).catch(() => null);
    await ctx.dispose();
  });

  test('nightly: picks check-in and check-out from the drawer calendar', async ({
    page,
  }) => {
    const checkIn = futureISO(CHECK_IN_DAYS_AHEAD);
    const checkOut = futureISO(CHECK_OUT_DAYS_AHEAD);
    await page.goto(`/en/listings/${listingId}`);
    const drawer = await openBookingDrawer(page);

    const datesTrigger = drawer.getByLabel('Dates', { exact: true });
    await datesTrigger.tap();
    await tapDay(page, checkIn);
    await tapDay(page, checkOut);

    await expect(datesTrigger).toHaveText(
      `${displayDate(checkIn)} – ${displayDate(checkOut)}`,
    );
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(drawer).toBeVisible();

    // Room selection stays usable in the drawer, and booking can continue.
    await tapOption(page, drawer, 'Unit', new RegExp(`^${NIGHT_ROOM}`));
    await expect(drawer.getByRole('button', { name: 'Unit' })).toContainText(
      NIGHT_ROOM,
    );
    await expect(
      drawer.getByRole('button', { name: BOOK_CTA, exact: true }),
    ).toBeEnabled();
  });

  test('hourly: date, start, end, rooms and guests in the drawer reach the server quote', async ({
    page,
  }) => {
    const stayDate = futureISO(HOURLY_DAYS_AHEAD);
    await login(page);
    const drawer = await openHourlyDrawer(page, listingId);

    const dateTrigger = drawer.getByLabel('Date', { exact: true });
    await dateTrigger.tap();
    await tapDay(page, stayDate);

    await expect(dateTrigger).toHaveText(displayDate(stayDate));
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(drawer).toBeVisible();
    // The tap never fell through to "Stay overnight" underneath.
    await expect(
      drawer.getByRole('radio', { name: 'Book by hour' }),
    ).toBeChecked();

    await tapOption(page, drawer, 'Start time', '10:00');
    await tapOption(page, drawer, 'End time', '13:00');
    await expect(drawer.getByText('Duration: 3 hours')).toBeVisible();
    await drawer.getByLabel('Quantity').fill('2');
    await drawer.getByLabel('Guests').fill('3');
    const overflowX = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflowX).toBe(0);

    const holdResponse = page.waitForResponse(
      (res) =>
        res.url().endsWith('/booking-holds') &&
        res.request().method() === 'POST',
    );
    await drawer.getByRole('button', { name: BOOK_CTA, exact: true }).tap();
    const [item] = (await (await holdResponse).json()).data.items;
    // 8,000 per hour × 3 hours × 2 rooms — the 3 guests never multiply it.
    expect(item).toMatchObject({
      booking_mode: 'HOURLY',
      date_from: stayDate,
      start_time: '10:00',
      end_time: '13:00',
      quantity: 2,
    });
    expect(item.quote.total_amount).toBe('48000.00');
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
    // Give the held rooms back for the next test.
    await page
      .getByRole('button', { name: 'Cancel and release these dates' })
      .click();
  });

  test('nightly: Escape closes only the calendar, a second Escape closes the drawer', async ({
    page,
  }) => {
    await page.goto(`/en/listings/${listingId}`);
    const drawer = await openBookingDrawer(page);

    await drawer.getByLabel('Dates', { exact: true }).tap();
    await expect(page.getByRole('grid')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(drawer).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('hourly: Escape closes only the calendar or the Start/End list, a second Escape closes the drawer', async ({
    page,
  }) => {
    const stayDate = futureISO(HOURLY_DAYS_AHEAD + 1);
    const drawer = await openHourlyDrawer(page, listingId);

    const dateTrigger = drawer.getByLabel('Date', { exact: true });
    await dateTrigger.tap();
    await expect(page.getByRole('grid')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(drawer).toBeVisible();

    await dateTrigger.tap();
    await tapDay(page, stayDate);

    await expectEscapeClosesOnlyList(page, drawer, 'Start time');
    await tapOption(page, drawer, 'Start time', '10:00');
    await expectEscapeClosesOnlyList(page, drawer, 'End time');
    await expect(
      drawer.getByRole('radio', { name: 'Book by hour' }),
    ).toBeChecked();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });
});
