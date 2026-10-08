/**
 * Step L6.3B — optional hourly hotel room booking, end to end against the
 * real backend and a fresh, throwaway HOTEL listing (created by the Partner
 * through the API, submitted for review and published by an admin — never
 * seed data), so room capacities and hourly occupancy are deterministic.
 *
 * - the Partner turns hourly booking on for ONE room in the room form;
 * - A: a nightly-only room never offers hourly booking, and still books
 *   nightly (checkout and detail show nights);
 * - B: the hourly room books by the hour through the real widget (date,
 *   start/end, two rooms, three guests) → server quote (rate × hours ×
 *   rooms) → checkout (no nights) → customer and Partner detail;
 * - C: a Partner hourly-rate change during checkout is refused with
 *   409 PRICE_CHANGED, never resubmitted on its own, and booked only after
 *   explicit acceptance — at the new price; earlier bookings keep theirs;
 * - D: an overlapping interval is refused once capacity is used (and shown
 *   unavailable);
 * - E: back-to-back intervals ([start, end) never overlap) both book;
 * - F: switching hourly sales off refuses new hourly holds while the
 *   confirmed hourly booking stays readable and unchanged.
 *
 * The display currency is pinned to AMD so every asserted amount is the
 * exact server quote. The tests share one hotel and run in order.
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
const PUBLICATION_PERIOD_DAYS = 90;
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const CURRENCY_PREFERENCE_KEY = 'desavii:currency:v1';
const SUBMIT_LABEL = 'Confirm booking request';
const BOOK_CTA = 'Request to book';
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
const NIGHT_ROOM = 'Night Room';
const DAY_ROOM = 'Day Room';

function futureISO(daysFromNow) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function accessibleDayName(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${monthName} ${day}, ${year}`;
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

async function pickDay(page, isoDate) {
  await navigateToMonth(page, isoDate);
  await page
    .getByRole('gridcell', {
      name: new RegExp(`^${accessibleDayName(isoDate)}`),
    })
    .click();
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
    translations: [{ languageId: 1, title: `L6.3B Hourly ${Date.now()}` }],
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

  const unitIdByLabel = {};
  const units = [
    { unitLabel: NIGHT_ROOM, capacity: 3, basePriceAmount: 30000 },
    { unitLabel: DAY_ROOM, capacity: 2, basePriceAmount: 40000 },
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
    unitIdByLabel[units[i].unitLabel] = unit.json.data.id;
  }
  // The real lifecycle: the Partner submits for review, an admin (holder of
  // `listing.publish`) publishes.
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
  return { listingId, unitIdByLabel };
}

async function hourlyHold(token, unitId, date, startTime, endTime, quantity) {
  return apiCall('post', 'booking-holds', token, {
    items: [
      {
        bookableUnitId: unitId,
        dateFrom: date,
        dateTo: date,
        startTime,
        endTime,
        quantity,
        bookingMode: 'HOURLY',
      },
    ],
  });
}

async function bookHold(token, holdItem) {
  return apiCall('post', 'bookings', token, {
    items: [
      {
        holdIds: holdItem.hold_ids,
        expectedTotalAmount: holdItem.quote.total_amount,
        expectedCurrency: holdItem.quote.currency,
      },
    ],
    guestContactSnapshot: { fullName: 'Hourly Guest', email: CUSTOMER.email },
  });
}

async function login(page, credentials, expectedUrlPattern) {
  await resetRateLimits();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [CURRENCY_PREFERENCE_KEY, 'AMD'],
  );
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

async function chooseOption(scope, page, label, option) {
  await scope.getByRole('button', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Opens checkout for an API-created hold exactly as the widget hands it over. */
async function openCheckout(page, state) {
  await page.goto('/en');
  await page.evaluate((usr) => {
    window.history.pushState(
      { usr, key: 'l63b', idx: 1 },
      '',
      '/en/booking/checkout',
    );
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: window.history.state }),
    );
  }, state);
  await expect(page.getByRole('button', { name: SUBMIT_LABEL })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Picks "Book by hour". The radio's visual circle is a styled sibling that
 * intercepts pointer events on the input, so click the label text — what a
 * real user clicks — and assert the control's state.
 */
async function chooseBookByHour(widget) {
  await widget.getByText('Book by hour', { exact: true }).click();
  await expect(
    widget.getByRole('radio', { name: 'Book by hour' }),
  ).toBeChecked();
}

function summaryRow(page, label) {
  return page.locator('aside').getByText(label, { exact: true }).locator('..');
}

async function openRoom(page, listingId, roomLabel) {
  await page.goto(`/en/listings/${listingId}`);
  await page
    .getByRole('button', { name: `Select ${roomLabel}` })
    .click({ timeout: 15_000 });
  return page.getByRole('complementary');
}

test.describe('Step L6.3B — optional hourly hotel room booking', () => {
  // Whole journeys (login, Partner form or widget, checkout, booking detail)
  // run longer than the default 30s per test on a cold dev server.
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let hotel;
  let vendorToken;
  let customerToken;
  let hourlyBookingId;

  test.beforeAll(async () => {
    vendorToken = await apiToken(VENDOR);
    customerToken = await apiToken(CUSTOMER);
    hotel = await createThrowawayHotel(vendorToken, await apiToken(ADMIN));
  });

  test.afterAll(async () => {
    if (!hotel) return;
    const ctx = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${vendorToken}` },
    });
    // Best-effort teardown only — mirrors hotelStayAvailability.spec.js.
    await ctx.delete(`listings/${hotel.listingId}`).catch(() => null);
    await ctx.dispose();
  });

  test('the Partner turns hourly booking on for one room only', async ({
    page,
  }) => {
    await login(page, VENDOR, /\/en\/partner$/);
    await page.goto(`/en/partner/listings/${hotel.listingId}/rooms`);
    await page
      .locator('div')
      .filter({ hasText: DAY_ROOM })
      .last()
      .getByRole('button', { name: 'Edit' })
      .click({ timeout: 15_000 });

    const section = page.getByRole('group', { name: 'Hourly booking' });
    // The checkbox's visual box is a styled sibling that intercepts pointer
    // events on the input, so click the label text — what a real user
    // clicks (the partnerRoomAuthoringAccessibility.spec.js pattern).
    await section
      .getByText('Hourly booking available', { exact: true })
      .click();
    await expect(
      section.getByRole('checkbox', { name: 'Hourly booking available' }),
    ).toBeChecked();
    await section.getByLabel('Hourly rate').fill('8000');
    await chooseOption(section, page, 'Currency', 'AMD');
    await chooseOption(section, page, 'Minimum duration', '2 hours');
    await chooseOption(section, page, 'Maximum duration', '6 hours');
    await chooseOption(section, page, 'Available from', '10:00');
    await chooseOption(section, page, 'Available until', '20:00');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText(/per hour · 10:00–20:00/)).toBeVisible({
      timeout: 10_000,
    });
    const { json } = await apiCall(
      'get',
      `availability/${hotel.listingId}/units`,
      vendorToken,
    );
    const byLabel = Object.fromEntries(
      json.data.map((unit) => [unit.unit_label, unit]),
    );
    expect(byLabel[DAY_ROOM]).toMatchObject({
      hourly_enabled: true,
      hourly_price_amount: '8000.00',
      hourly_price_currency: 'AMD',
      hourly_min_duration_hours: 2,
      hourly_max_duration_hours: 6,
      hourly_available_from: '10:00',
      hourly_available_until: '20:00',
    });
    expect(byLabel[NIGHT_ROOM].hourly_enabled).toBe(false);
  });

  test('A: a nightly-only room offers no hourly booking and still books by the night', async ({
    page,
  }) => {
    const checkIn = futureISO(40);
    const checkOut = futureISO(42);
    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${hotel.listingId}`);
    const widget = page.getByRole('complementary');

    // Dates first: changing the stay dates clears an earlier room choice
    // (Sprint C-3), so a guest picks the room for the chosen stay.
    await widget
      .getByLabel('Dates', { exact: true })
      .click({ timeout: 15_000 });
    await pickDay(page, checkIn);
    await pickDay(page, checkOut);
    await page.getByRole('button', { name: `Select ${NIGHT_ROOM}` }).click();
    await expect(widget.getByLabel('Unit')).toContainText(NIGHT_ROOM);
    await expect(
      widget.getByRole('radio', { name: 'Book by hour' }),
    ).toHaveCount(0);

    await widget.getByRole('button', { name: BOOK_CTA }).click();
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/, {
      timeout: 15_000,
    });
    await expect(summaryRow(page, 'Nights')).toContainText('2');
    await expect(page.getByText('Hourly stay')).toHaveCount(0);
    await expect(summaryRow(page, 'Total')).toContainText('60,000');
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    await expect(page.getByText('Nights: 2')).toBeVisible();
    await expect(page.getByText(/Booking type:/)).toHaveCount(0);

    const booking = (
      await apiCall(
        'get',
        `bookings/${page.url().split('/').pop()}`,
        customerToken,
      )
    ).json.data;
    expect(booking.total_amount).toBe('60000.00');
    expect(booking.items[0].booking_mode).toBe('NIGHTLY');
  });

  test('B: the hourly room books by the hour — widget, checkout, customer and Partner detail', async ({
    page,
  }) => {
    const date = futureISO(43);
    await login(page, CUSTOMER, /\/en\/account$/);
    const widget = await openRoom(page, hotel.listingId, DAY_ROOM);
    await expect(
      widget.getByRole('radio', { name: 'Stay overnight' }),
    ).toBeChecked();
    await chooseBookByHour(widget);
    await expect(widget.getByLabel('Dates', { exact: true })).toHaveCount(0);

    await widget.getByLabel('Date', { exact: true }).click();
    await pickDay(page, date);
    await chooseOption(widget, page, 'Start time', '14:00');
    await chooseOption(widget, page, 'End time', '17:00');
    await expect(widget.getByText('Duration: 3 hours')).toBeVisible();
    // Two rooms for three guests (Day Room sleeps 2 per room).
    await widget.getByLabel('Quantity').fill('2');
    await widget.getByLabel('Guests').fill('3');

    const holdResponse = page.waitForResponse(
      (res) =>
        res.url().endsWith('/booking-holds') &&
        res.request().method() === 'POST',
    );
    await widget.getByRole('button', { name: BOOK_CTA }).click();
    const [heldItem] = (await (await holdResponse).json()).data.items;
    expect(heldItem).toMatchObject({
      booking_mode: 'HOURLY',
      date_from: date,
      date_to: date,
      start_time: '14:00',
      end_time: '17:00',
      quantity: 2,
    });
    // 8,000 per hour × 3 hours × 2 rooms — the 3 guests never multiply it.
    expect(heldItem.quote).toEqual({
      unit_price_amount: '24000.00',
      total_amount: '48000.00',
      currency: 'AMD',
    });

    await expect(page).toHaveURL(/\/en\/booking\/checkout$/, {
      timeout: 15_000,
    });
    await expect(summaryRow(page, 'Booking type')).toContainText('Hourly stay');
    await expect(summaryRow(page, 'Start')).toContainText('14:00');
    await expect(summaryRow(page, 'End')).toContainText('17:00');
    await expect(summaryRow(page, 'Duration')).toContainText('3 hours');
    await expect(summaryRow(page, 'Quantity')).toContainText('2');
    await expect(summaryRow(page, 'Guests')).toContainText('3');
    await expect(page.getByText('Nights', { exact: true })).toHaveCount(0);
    await expect(summaryRow(page, 'Total')).toContainText('48,000');

    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    hourlyBookingId = page.url().split('/').pop();
    await expect(page.getByText('Booking type: Hourly stay')).toBeVisible();
    await expect(page.getByText('Start: 14:00')).toBeVisible();
    await expect(page.getByText('End: 17:00')).toBeVisible();
    await expect(page.getByText('Duration: 3 hours')).toBeVisible();
    await expect(page.getByText('Rooms: 2')).toBeVisible();
    await expect(page.getByText('Guests: 3')).toBeVisible();
    await expect(page.getByText(/Nights:/)).toHaveCount(0);

    const booking = (
      await apiCall('get', `bookings/${hourlyBookingId}`, customerToken)
    ).json.data;
    expect(booking.total_amount).toBe('48000.00');
    expect(booking.items[0]).toMatchObject({
      booking_mode: 'HOURLY',
      start_time: '14:00',
      end_time: '17:00',
      quantity: 2,
      guest_count: 3,
    });

    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await login(page, VENDOR, /\/en\/partner$/);
    await page.goto(`/en/partner/bookings/${hourlyBookingId}`);
    await expect(page.getByText('Booking type: Hourly stay')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Start: 14:00')).toBeVisible();
    await expect(page.getByText('End: 17:00')).toBeVisible();
    await expect(page.getByText('Rooms: 2')).toBeVisible();
    await expect(page.getByText('Guests: 3')).toBeVisible();
  });

  test('C: an hourly-rate change during checkout is re-quoted and booked only after acceptance', async ({
    page,
  }) => {
    const date = futureISO(44);
    const dayRoomId = hotel.unitIdByLabel[DAY_ROOM];
    const { status, json } = await hourlyHold(
      customerToken,
      dayRoomId,
      date,
      '10:00',
      '12:00',
      1,
    );
    expect(status).toBe(201);
    expect(json.data.items[0].quote.total_amount).toBe('16000.00');

    await login(page, CUSTOMER, /\/en\/account$/);
    await openCheckout(page, {
      listingId: hotel.listingId,
      holdBatch: json.data,
      unitLabel: DAY_ROOM,
      bookableUnitType: 'HOTEL_ROOM',
      bookingMode: 'HOURLY',
    });
    await expect(summaryRow(page, 'Total')).toContainText('16,000');

    const repriced = await apiCall(
      'patch',
      `availability/units/${dayRoomId}`,
      vendorToken,
      { hourlyPriceAmount: 9000, hourlyPriceCurrency: 'AMD' },
    );
    expect(repriced.status).toBe(200);

    const bookingRequests = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/bookings') && req.method() === 'POST') {
        bookingRequests.push(req.postDataJSON());
      }
    });
    const refused = page.waitForResponse(
      (res) =>
        res.url().endsWith('/bookings') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    const refusedResponse = await refused;
    expect(refusedResponse.status()).toBe(409);
    const refusal = (await refusedResponse.json()).error;
    expect(refusal.code).toBe('PRICE_CHANGED');
    expect(refusal.details[0]).toMatchObject({
      issue: 'PRICE_CHANGED',
      total_amount: '18000.00',
      currency: 'AMD',
    });

    const warning = page.getByRole('status').filter({
      hasText: 'The price changed while you were booking.',
    });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('16,000');
    await expect(warning).toContainText('18,000');
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
    await expect(
      page.getByRole('button', { name: SUBMIT_LABEL }),
    ).toBeDisabled();

    await warning.getByRole('button', { name: 'Accept new price' }).click();
    await expect(summaryRow(page, 'Total')).toContainText('18,000');
    // Accepting never books on its own — only the explicit second submit.
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
    expect(bookingRequests).toHaveLength(1);

    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    expect(bookingRequests).toHaveLength(2);
    expect(bookingRequests[1].items[0]).toMatchObject({
      expectedTotalAmount: '18000.00',
      expectedCurrency: 'AMD',
    });
    const booking = (
      await apiCall(
        'get',
        `bookings/${page.url().split('/').pop()}`,
        customerToken,
      )
    ).json.data;
    expect(booking.total_amount).toBe('18000.00');

    // The earlier hourly booking keeps the amount it was booked at.
    const earlier = (
      await apiCall('get', `bookings/${hourlyBookingId}`, customerToken)
    ).json.data;
    expect(earlier.total_amount).toBe('48000.00');
  });

  test('D + E: an overlapping interval is refused; adjacent intervals both book', async ({
    page,
  }) => {
    const date = futureISO(45);
    const dayRoomId = hotel.unitIdByLabel[DAY_ROOM];

    // Both rooms taken 14:00–16:00.
    const first = await hourlyHold(
      customerToken,
      dayRoomId,
      date,
      '14:00',
      '16:00',
      2,
    );
    expect(first.status).toBe(201);

    // D: 15:00–17:00 overlaps it — refused, nothing held.
    const overlapping = await hourlyHold(
      customerToken,
      dayRoomId,
      date,
      '15:00',
      '17:00',
      1,
    );
    expect(overlapping.status).toBe(409);
    expect(overlapping.json.error.code).toBe('AVAILABILITY_CONFLICT');

    // E: 16:00–18:00 only touches it — both rooms are free again.
    const adjacent = await hourlyHold(
      customerToken,
      dayRoomId,
      date,
      '16:00',
      '18:00',
      2,
    );
    expect(adjacent.status).toBe(201);

    const firstBooking = await bookHold(
      customerToken,
      first.json.data.items[0],
    );
    const adjacentBooking = await bookHold(
      customerToken,
      adjacent.json.data.items[0],
    );
    expect(firstBooking.status).toBe(201);
    expect(adjacentBooking.status).toBe(201);

    // The widget shows the booked hours as unavailable for that date.
    await login(page, CUSTOMER, /\/en\/account$/);
    const widget = await openRoom(page, hotel.listingId, DAY_ROOM);
    await chooseBookByHour(widget);
    await widget.getByLabel('Date', { exact: true }).click();
    await pickDay(page, date);
    await widget.getByRole('button', { name: 'Start time' }).click();
    await Promise.all(
      ['14:00', '15:00', '16:00', '17:00'].map((hour) =>
        expect(
          page.getByRole('option', { name: hour, exact: true }),
        ).toHaveAttribute('aria-disabled', 'true'),
      ),
    );
    await expect(
      page.getByRole('option', { name: '10:00', exact: true }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('F: switching hourly sales off refuses new hourly stays and keeps confirmed ones', async ({
    page,
  }) => {
    const dayRoomId = hotel.unitIdByLabel[DAY_ROOM];
    const disabled = await apiCall(
      'patch',
      `availability/units/${dayRoomId}`,
      vendorToken,
      { hourlyEnabled: false },
    );
    expect(disabled.status).toBe(200);
    // The stored settings stay, ready for re-enabling.
    expect(disabled.json.data).toMatchObject({
      hourly_enabled: false,
      hourly_price_amount: '9000.00',
      hourly_available_from: '10:00',
    });

    const refused = await hourlyHold(
      customerToken,
      dayRoomId,
      futureISO(46),
      '10:00',
      '12:00',
      1,
    );
    expect(refused.status).toBe(422);
    expect(refused.json.error.details[0].issue).toBe(
      'HOURLY_BOOKING_NOT_SUPPORTED',
    );

    const confirmed = (
      await apiCall('get', `bookings/${hourlyBookingId}`, customerToken)
    ).json.data;
    expect(confirmed.total_amount).toBe('48000.00');
    expect(confirmed.items[0]).toMatchObject({
      booking_mode: 'HOURLY',
      start_time: '14:00',
      end_time: '17:00',
    });

    await login(page, CUSTOMER, /\/en\/account$/);
    const widget = await openRoom(page, hotel.listingId, DAY_ROOM);
    await expect(widget.getByLabel('Unit')).toContainText(DAY_ROOM);
    await expect(
      widget.getByRole('radio', { name: 'Book by hour' }),
    ).toHaveCount(0);
    await expect(page.getByText('Hourly booking available')).toHaveCount(0);

    await page.goto(`/en/account/bookings/${hourlyBookingId}`);
    await expect(page.getByText('Booking type: Hourly stay')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Start: 14:00')).toBeVisible();
  });
});
