/**
 * Step L6.2H4 — booking price integrity, end to end.
 *
 * The customer books through the real UI; only the Partner's price edit
 * (and a few read-backs) go through the API, standing in for the Partner
 * acting in another session at the same moment.
 *
 * - checkout shows the hold's SERVER quote;
 * - a Partner price change during checkout is never charged silently: the
 *   submit is refused with the previous and new totals, nothing is booked,
 *   and only an explicit "Accept new price" + a second submit books — at
 *   exactly the accepted amount;
 * - a two-room hotel hold is quoted (and booked) for both rooms;
 * - a USD-priced date is quoted and booked in USD, never relabelled AMD.
 *
 * The display currency is pinned to AMD (the stored customer preference)
 * so every asserted amount is the exact server quote, not an FX conversion.
 * Dates are far-future, salted per run, so reruns never collide.
 */

import { test, expect, request as playwrightRequest } from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const SLUGS = {
  hotel: 'demo-vendor-boutique-yerevan-hotel',
  guide: 'demo-vendor-certified-yerevan-city-guide',
};
const CURRENCY_PREFERENCE_KEY = 'desavii:currency:v1';
const BOOK_CTA_PATTERN =
  /Request to book|Check availability|Reserve your spot|Reserve this vehicle/;
const SUBMIT_LABEL = 'Confirm booking request';
const RUN_SALT_DAYS = Date.now() % 120;

function futureISO(daysFromNow) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow + RUN_SALT_DAYS);
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

function monthsFromToday(isoDate) {
  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  return (
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth())
  );
}

/** A whole-number amount as the page groups it ("24,690"), never "24690.00". */
function grouped(decimalAmount) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(decimalAmount));
}

async function api(token) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function apiToken(credentials) {
  const ctx = await api();
  const res = await ctx.post('auth/login', { data: credentials });
  const token = (await res.json()).data.access_token;
  await ctx.dispose();
  return token;
}

async function apiGet(path, token) {
  const ctx = await api(token);
  const res = await ctx.get(path);
  expect(res.ok()).toBe(true);
  const { data } = await res.json();
  await ctx.dispose();
  return data;
}

async function apiPost(path, body, token) {
  const ctx = await api(token);
  const res = await ctx.post(path, { data: body });
  const json = await res.json();
  await ctx.dispose();
  return { status: res.status(), json };
}

async function listingBySlug(slug) {
  return apiGet(`listings/${slug}`);
}

async function setDatePrice(unitId, iso, amount, currency, vendorToken) {
  const { status } = await apiPost(
    'availability',
    {
      unitId,
      dateFrom: iso,
      dateTo: iso,
      priceOverrideAmount: amount,
      priceOverrideCurrency: currency,
    },
    vendorToken,
  );
  expect(status).toBe(201);
}

async function loginAsCustomer(page) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [CURRENCY_PREFERENCE_KEY, 'AMD'],
  );
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(CUSTOMER.email);
  await page.getByLabel('Password').fill(CUSTOMER.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

/** Opens checkout for an API-created hold exactly as the widget hands it over. */
async function openCheckout(page, state) {
  await page.goto('/en');
  await page.evaluate((usr) => {
    window.history.pushState(
      { usr, key: 'h4', idx: 1 },
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

function summaryTotal(page) {
  return page
    .locator('aside')
    .getByText('Total', { exact: true })
    .locator('..');
}

test.describe('Step L6.2H4 — booking price integrity', () => {
  test('a Partner price change during checkout is re-quoted and booked only after explicit acceptance', async ({
    page,
  }) => {
    const iso = futureISO(170);
    const vendorToken = await apiToken(VENDOR);
    const guide = await listingBySlug(SLUGS.guide);
    const [unit] = await apiGet(`availability/${guide.id}/units`);

    await loginAsCustomer(page);
    await page.goto(`/en/listings/${SLUGS.guide}?guests=2`);
    const widget = page.getByRole('complementary');
    await expect(
      widget.getByRole('button', { name: BOOK_CTA_PATTERN }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await widget.getByLabel('Dates').click();
    for (let i = 0; i < monthsFromToday(iso); i += 1) {
      // eslint-disable-next-line no-await-in-loop -- one month per click.
      await page.getByRole('button', { name: 'Next month' }).click();
    }
    const dayCell = page.getByRole('gridcell', {
      name: accessibleDayName(iso),
      exact: true,
    });
    await dayCell.click();
    await dayCell.click();
    const holdResponse = page.waitForResponse(
      (res) =>
        res.url().endsWith('/booking-holds') &&
        res.request().method() === 'POST',
    );
    await widget.getByRole('button', { name: BOOK_CTA_PATTERN }).click();
    const hold = (await (await holdResponse).json()).data.items[0];
    expect(hold.quantity).toBe(2);

    // Checkout shows the hold's server quote.
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/, {
      timeout: 15_000,
    });
    await expect(summaryTotal(page)).toContainText(
      grouped(hold.quote.total_amount),
    );

    // The Partner raises this date's price while the customer is checking out.
    await setDatePrice(unit.id, iso, '12345.00', 'AMD', vendorToken);
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    const warning = page.getByRole('status').filter({
      hasText: 'The price changed while you were booking.',
    });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Previous total');
    await expect(warning).toContainText(grouped(hold.quote.total_amount));
    await expect(warning).toContainText('New total');
    await expect(warning).toContainText('24,690');
    await expect(
      page.getByRole('button', { name: SUBMIT_LABEL }),
    ).toBeDisabled();
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);

    await warning.getByRole('button', { name: 'Accept new price' }).click();
    await expect(warning).toHaveCount(0);
    await expect(summaryTotal(page)).toContainText('24,690');
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);

    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    const bookingId = page.url().split('/').pop();
    const customerToken = await apiToken(CUSTOMER);
    const booking = await apiGet(`bookings/${bookingId}`, customerToken);
    expect(booking.total_amount).toBe('24690.00');
    expect(booking.currency).toBe('AMD');
    await expect(page.getByText(/24,690/).first()).toBeVisible();
  });

  test('a two-room hotel hold is quoted and booked for both rooms', async ({
    page,
  }) => {
    const checkIn = futureISO(180);
    const checkOut = futureISO(182);
    const customerToken = await apiToken(CUSTOMER);
    const hotel = await listingBySlug(SLUGS.hotel);
    const units = await apiGet(`availability/${hotel.id}/units`);
    const room = units.find((unit) => unit.capacity >= 2);
    const { status, json } = await apiPost(
      'booking-holds',
      {
        items: [
          {
            bookableUnitId: room.id,
            dateFrom: checkIn,
            dateTo: checkOut,
            quantity: 2,
          },
        ],
      },
      customerToken,
    );
    expect(status).toBe(201);
    const [item] = json.data.items;
    expect(Number(item.quote.total_amount)).toBe(
      Number(item.quote.unit_price_amount) * 2,
    );

    await loginAsCustomer(page);
    await openCheckout(page, {
      listingId: hotel.id,
      holdBatch: json.data,
      unitLabel: room.unit_label,
      bookableUnitType: 'HOTEL_ROOM',
      guestCount: 2,
    });

    await expect(summaryTotal(page)).toContainText(
      grouped(item.quote.total_amount),
    );
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    const booking = await apiGet(
      `bookings/${page.url().split('/').pop()}`,
      customerToken,
    );
    expect(booking.total_amount).toBe(item.quote.total_amount);
  });

  test('a USD-priced date is quoted and booked in USD, never relabelled as AMD', async ({
    page,
  }) => {
    const iso = futureISO(175);
    const vendorToken = await apiToken(VENDOR);
    const customerToken = await apiToken(CUSTOMER);
    const guide = await listingBySlug(SLUGS.guide);
    const [unit] = await apiGet(`availability/${guide.id}/units`);
    await setDatePrice(unit.id, iso, '45.50', 'USD', vendorToken);
    const { status, json } = await apiPost(
      'booking-holds',
      {
        items: [
          { bookableUnitId: unit.id, dateFrom: iso, dateTo: iso, quantity: 2 },
        ],
      },
      customerToken,
    );
    expect(status).toBe(201);
    expect(json.data.items[0].quote).toEqual({
      unit_price_amount: '45.50',
      total_amount: '91.00',
      currency: 'USD',
    });

    await loginAsCustomer(page);
    await openCheckout(page, {
      listingId: guide.id,
      holdBatch: json.data,
      bookableUnitType: 'TOUR_DEPARTURE',
      guestCount: null,
      departurePeopleKey: 'visitors',
    });

    await expect(summaryTotal(page)).toContainText('$91.00');
    await expect(summaryTotal(page)).not.toContainText('֏');
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    const booking = await apiGet(
      `bookings/${page.url().split('/').pop()}`,
      customerToken,
    );
    expect(booking.total_amount).toBe('91.00');
    expect(booking.currency).toBe('USD');
    expect(booking.display_currency).toBeNull();
  });
});
