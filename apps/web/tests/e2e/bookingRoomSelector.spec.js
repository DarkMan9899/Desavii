/**
 * The reservation widget's room selector, end to end on a fresh, throwaway
 * HOTEL (created through the API, published by an admin — never seed data)
 * whose rooms have long Armenian and Russian names, one of them also
 * bookable by the hour.
 *
 * Proves the defects this selector had are gone:
 * - every option is reachable — the widget card clips its contents
 *   (`overflow: hidden`), and the list used to be cut off after the first
 *   room in the sidebar and the tablet drawer;
 * - an option is the room name plus separate facts (guests, the price in
 *   the money display on the basis being booked), never a run-on sentence
 *   with the raw amount or the room-type inventory shown as availability;
 * - the closed trigger names the room only;
 * - Escape closes the list first and the drawer second;
 * and that the nightly and hourly flows still reach a server quote, a hold
 * and checkout. The display currency is pinned to AMD.
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';
import {
  expectEveryOptionReachable,
  expectNoHorizontalOverflow,
} from './selectAssertions.js';
import { YEREVAN_CITY_ID } from './seededCities.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const CURRENCY_PREFERENCE_KEY = 'desavii:currency:v1';
const PUBLICATION_PERIOD_DAYS = 90;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const HY_ROOM =
  'Լյուքս համար Արարատի և Մասիսի համայնապատկերով, առանձին պատշգամբով';
const RU_ROOM = 'Семейный номер с видом на Арарат и отдельной гостиной зоной';
const GARDEN_ROOM = 'Garden Room';
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

function futureISO(daysFromNow) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

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

async function resolveHotelsCategoryId() {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const body = await (await ctx.get('search/categories')).json();
  await ctx.dispose();
  const hotels = (body.data ?? []).find(
    (category) => category.slug === 'hotels',
  );
  if (!hotels) throw new Error('The seeded "hotels" category is missing.');
  return hotels.id;
}

/**
 * A hotel as a partner would publish one: in the Hotels category, with its
 * required policies, priced per night — the basis each room's price is
 * shown on.
 */
async function createThrowawayHotel(vendorToken, adminToken) {
  const created = await apiCall('post', 'listings', vendorToken, {
    partnerId: 1,
    listingType: 'HOTEL',
    categoryIds: [await resolveHotelsCategoryId()],
    translations: [{ languageId: 1, title: `E2E Room Selector ${Date.now()}` }],
  });
  const listingId = created.json.data.id;
  const updated = await apiCall('patch', `listings/${listingId}`, vendorToken, {
    location: {
      cityId: YEREVAN_CITY_ID,
      latitude: 40.1772,
      longitude: 44.5035,
    },
    pricing: { modelCode: 'PER_NIGHT', amount: 25000, currencyCode: 'AMD' },
    policyValues: [
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'check_in_time', value: '14:00' },
      { code: 'check_out_time', value: '12:00' },
    ],
  });
  expect(updated.status).toBe(200);
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  await ctx.post(`listings/${listingId}/media`, {
    headers: {
      Authorization: `Bearer ${vendorToken}`,
      'Content-Type': 'image/png',
    },
    data: ONE_PX_PNG,
  });
  await ctx.dispose();

  const rooms = [
    { unitLabel: HY_ROOM, capacity: 3, maxGuests: 2, basePriceAmount: 30000 },
    {
      unitLabel: RU_ROOM,
      capacity: 2,
      maxGuests: 4,
      basePriceAmount: 42000,
      hourlyEnabled: true,
      hourlyPriceAmount: 8000,
      hourlyPriceCurrency: 'AMD',
      hourlyMinDurationHours: 2,
      hourlyMaxDurationHours: 6,
      hourlyAvailableFrom: '10:00',
      hourlyAvailableUntil: '20:00',
    },
    {
      unitLabel: GARDEN_ROOM,
      capacity: 4,
      maxGuests: 2,
      basePriceAmount: 25000,
    },
  ];
  for (let i = 0; i < rooms.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential setup
    const unit = await apiCall('post', 'availability/units', vendorToken, {
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      basePriceCurrency: 'AMD',
      ...rooms[i],
    });
    expect(unit.status).toBe(201);
  }
  const submitted = await apiCall(
    'post',
    `listings/${listingId}/submit-for-review`,
    vendorToken,
    { publicationPeriodDays: PUBLICATION_PERIOD_DAYS },
  );
  expect(submitted.status, JSON.stringify(submitted.json.error)).toBe(200);
  const published = await apiCall(
    'post',
    `listings/${listingId}/publish`,
    adminToken,
    { publicationPeriodDays: PUBLICATION_PERIOD_DAYS },
  );
  expect(published.status, JSON.stringify(published.json.error)).toBe(200);
  return listingId;
}

async function login(page) {
  await resetRateLimits();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [CURRENCY_PREFERENCE_KEY, 'AMD'],
  );
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(CUSTOMER.email);
  await page.getByLabel(/^Password/).fill(CUSTOMER.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

/** Below desktop the widget lives in a drawer opened from the sticky bar. */
async function openDrawer(page, cta = BOOK_CTA) {
  await page.locator('button:visible', { hasText: cta }).last().tap();
  const drawer = page.getByRole('dialog', { name: cta });
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Taps "Next month" until the open calendar shows the target month. */
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
    await page.getByRole('button', { name: 'Next month' }).tap();
  }
}

async function tapDay(page, isoDate) {
  await navigateToMonth(page, isoDate);
  await page
    .getByRole('gridcell', { name: new RegExp(`^${displayDate(isoDate)}`) })
    .tap();
}

/** Picks a stay with touch taps in the drawer's calendar. */
async function pickStay(page, drawer, checkIn, checkOut) {
  await drawer.getByLabel('Dates', { exact: true }).tap();
  await tapDay(page, checkIn);
  await tapDay(page, checkOut);
}

test.describe('Reservation widget — room selector', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

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

  test.describe('on a phone (390px, touch)', () => {
    test.use({ viewport: PHONE, hasTouch: true });

    test('nightly: every room is readable and reachable, the trigger names the choice, and the stay reaches a quote, a hold and checkout', async ({
      page,
    }) => {
      const checkIn = futureISO(12);
      const checkOut = futureISO(14);
      await login(page);
      await page.goto(`/en/listings/${listingId}`);
      const drawer = await openDrawer(page);
      await pickStay(page, drawer, checkIn, checkOut);

      await drawer.getByRole('combobox', { name: 'Unit', exact: true }).tap();
      await expectEveryOptionReachable(page);
      const room = page.getByRole('option', {
        name: new RegExp(`^${HY_ROOM}`),
      });
      await expect(room).toContainText('Sleeps 2');
      await expect(room).toContainText(/30,000/);
      await expect(room).toContainText('Per night');
      await expect(room).not.toContainText('30000.00');
      await expect(page.getByRole('listbox')).not.toContainText(/available/);
      await expectNoHorizontalOverflow(page);

      await room.tap();
      await expect(
        drawer.getByRole('combobox', { name: 'Unit', exact: true }),
      ).toHaveText(HY_ROOM);

      const holdResponse = page.waitForResponse(
        (res) =>
          res.url().endsWith('/booking-holds') &&
          res.request().method() === 'POST',
      );
      await drawer.getByRole('button', { name: BOOK_CTA, exact: true }).tap();
      const [item] = (await (await holdResponse).json()).data.items;
      expect(item.quote.total_amount).toBe('60000.00');
      await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
      await page
        .getByRole('button', { name: 'Cancel and release these dates' })
        .click();
    });

    test('hourly: the hourly room is priced per hour in the list, and the stay reaches a quote, a hold and checkout', async ({
      page,
    }) => {
      const stayDate = futureISO(13);
      await login(page);
      await page.goto(`/en/listings/${listingId}`);
      await page
        .getByRole('button', { name: `Select ${RU_ROOM}` })
        .tap({ timeout: 15_000 });
      const drawer = await openDrawer(page);
      await drawer.getByText('Book by hour', { exact: true }).tap();

      await drawer.getByRole('combobox', { name: 'Unit', exact: true }).tap();
      await expectEveryOptionReachable(page);
      const hourlyRoom = page.getByRole('option', {
        name: new RegExp(`^${RU_ROOM}`),
      });
      await expect(hourlyRoom).toContainText(/8,000/);
      await expect(hourlyRoom).toContainText('Per hour');
      await expect(
        page.getByRole('option', { name: new RegExp(`^${GARDEN_ROOM}`) }),
      ).toContainText('Per night');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);

      await drawer.getByLabel('Date', { exact: true }).tap();
      await tapDay(page, stayDate);
      await expect(
        drawer.getByRole('radio', { name: 'Book by hour' }),
      ).toBeChecked();
      await drawer
        .getByRole('combobox', { name: 'Start time', exact: true })
        .tap();
      await page.getByRole('option', { name: '10:00', exact: true }).tap();
      await drawer
        .getByRole('combobox', { name: 'End time', exact: true })
        .tap();
      await page.getByRole('option', { name: '13:00', exact: true }).tap();
      await expect(drawer.getByText('Duration: 3 hours')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const holdResponse = page.waitForResponse(
        (res) =>
          res.url().endsWith('/booking-holds') &&
          res.request().method() === 'POST',
      );
      await drawer.getByRole('button', { name: BOOK_CTA, exact: true }).tap();
      const [item] = (await (await holdResponse).json()).data.items;
      expect(item).toMatchObject({ booking_mode: 'HOURLY', quantity: 1 });
      expect(item.quote.total_amount).toBe('24000.00');
      await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
      await page
        .getByRole('button', { name: 'Cancel and release these dates' })
        .click();
    });

    test('Escape closes the room list first — focus back on it — and the drawer second', async ({
      page,
    }) => {
      await page.goto(`/en/listings/${listingId}`);
      const drawer = await openDrawer(page);
      const trigger = drawer.getByRole('combobox', {
        name: 'Unit',
        exact: true,
      });
      await trigger.tap();
      await expect(page.getByRole('listbox')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(drawer).toBeVisible();
      await expect(trigger).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    });

    [
      {
        locale: 'hy',
        cta: 'Ուղարկել ամրագրման հայտ',
        unitLabel: 'Միավոր',
        roomName: HY_ROOM,
        guests: 'Ընդունում է 2 հյուր',
      },
      {
        locale: 'ru',
        cta: 'Отправить запрос на бронирование',
        unitLabel: 'Единица',
        roomName: RU_ROOM,
        guests: 'Вмещает 4',
      },
    ].forEach(({ locale, cta, unitLabel, roomName, guests }) => {
      test(`${locale.toUpperCase()}: a long room name wraps inside its option and the trigger, nothing is cut off`, async ({
        page,
      }) => {
        await page.goto(`/${locale}/listings/${listingId}`);
        const drawer = await openDrawer(page, cta);
        const trigger = drawer.getByRole('combobox', {
          name: unitLabel,
          exact: true,
        });
        await trigger.tap();
        await expectEveryOptionReachable(page);
        const room = page.getByRole('option', {
          name: new RegExp(`^${roomName}`),
        });
        await expect(room).toContainText(guests);
        await room.tap();
        await expect(trigger).toHaveText(roomName);
        const triggerClipped = await trigger.evaluate(
          (el) => el.scrollWidth > el.clientWidth + 1,
        );
        expect(triggerClipped).toBe(false);
        await expectNoHorizontalOverflow(page);
      });
    });
  });

  test.describe('on a desktop (1440px)', () => {
    test.use({ viewport: DESKTOP });

    test('every room in the sidebar list is reachable — the widget card no longer clips it', async ({
      page,
    }) => {
      await page.goto(`/en/listings/${listingId}`);
      const sidebar = page.getByRole('complementary');
      await expect(sidebar).toBeVisible();
      const trigger = sidebar.getByRole('combobox', {
        name: 'Unit',
        exact: true,
      });
      await trigger.click();
      await expectEveryOptionReachable(page);

      await page
        .getByRole('option', { name: new RegExp(`^${GARDEN_ROOM}`) })
        .click();
      await expect(trigger).toHaveText(GARDEN_ROOM);
      await expectNoHorizontalOverflow(page);
    });
  });
});
