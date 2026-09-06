/**
 * P2.2B (Customer Selection / Booking Completeness) — end to end against
 * the real backend + a fresh, throwaway HOTEL listing (registered
 * directly via the API, never seed data, so this spec never collides
 * with demo fixtures or other specs sharing them). Proves the customer-
 * facing gaps closed in this slice: real room-type labels/pricing in the
 * reservation widget, guest-count capacity enforcement (client clamp +
 * server rejection), checkout-exclusive night pricing, and booked
 * room/unit identity surfaced on checkout and the booking detail page —
 * plus a single-unit PROPERTY regression check.
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

function monthsFromToday(date) {
  const now = new Date();
  return (
    (date.getFullYear() - now.getFullYear()) * 12 +
    (date.getMonth() - now.getMonth())
  );
}

function accessibleDayName(isoDateStr) {
  const [year, month, day] = isoDateStr.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${monthName} ${day}, ${year}`;
}

/** Opens the customer DatePicker, navigates forward, and picks a check-in/check-out range. */
async function pickDateRange(page, checkIn, checkOut) {
  await page.getByLabel('Dates').click();
  const startMonths = monthsFromToday(checkIn);
  for (let i = 0; i < startMonths; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential UI navigation
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page
    .getByRole('gridcell', {
      name: new RegExp(`^${accessibleDayName(isoDate(checkIn))}`),
    })
    .click();

  const endMonths = monthsFromToday(checkOut) - startMonths;
  for (let i = 0; i < endMonths; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential UI navigation
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page
    .getByRole('gridcell', {
      name: new RegExp(`^${accessibleDayName(isoDate(checkOut))}`),
    })
    .click();
}

/**
 * Creates a fresh, published, throwaway listing owned by the seeded
 * vendor's partner, with the given units registered on it, and an
 * explicit calendar price override for each unit across `priceWindow` —
 * mirrors the backend integration suite's own `createListing`/
 * `registerUnit`/`setPrice` helpers (`bookingCreation.test.js`), just
 * over HTTP instead of an in-process Service call. A calendar override is
 * required (not just each unit's own `basePriceAmount`) because the
 * public `GET /calendar` endpoint this widget's estimate reads from only
 * ever returns explicit override rows — it does not itself walk the
 * unit-base/listing-fallback precedence chain the way booking creation
 * does; only `resolveItem` (at booking-creation time) does that.
 */
async function createThrowawayListing(listingType, units, priceWindow) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: VENDOR });
  const { access_token: accessToken } = (await loginRes.json()).data;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const createRes = await ctx.post('listings', {
    headers: authHeaders,
    data: {
      partnerId: 1,
      listingType,
      translations: [
        { languageId: 1, title: `P2.2B ${listingType} Test ${Date.now()}` },
      ],
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

  const unitIds = [];
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    // eslint-disable-next-line no-await-in-loop -- sequential setup
    const unitRes = await ctx.post('availability/units', {
      headers: authHeaders,
      data: { listingId: listing.id, bookableUnitType: 'HOTEL_ROOM', ...unit },
    });
    // eslint-disable-next-line no-await-in-loop -- sequential setup
    const unitId = (await unitRes.json()).data.id;
    unitIds.push(unitId);
    if (priceWindow && unit.basePriceAmount !== undefined) {
      // eslint-disable-next-line no-await-in-loop -- sequential setup
      await ctx.post('availability', {
        headers: authHeaders,
        data: {
          unitId,
          dateFrom: isoDate(priceWindow.from),
          dateTo: isoDate(priceWindow.to),
          status: 'AVAILABLE',
          priceOverrideAmount: unit.basePriceAmount,
          priceOverrideCurrency: unit.basePriceCurrency,
        },
      });
    }
  }

  await ctx.post(`listings/${listing.id}/publish`, { headers: authHeaders });
  await ctx.dispose();
  return { listingId: listing.id, unitIds, accessToken };
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

test.describe('P2.2B — HOTEL customer room selection, guest capacity, and checkout', () => {
  let listingId;

  test.afterEach(async ({ request }) => {
    if (!listingId) return;
    await deleteListing(request, listingId);
    listingId = undefined;
  });

  test('a customer picks a real-labeled room type, the headline price switches to it, guest count is clamped, and the booked room shows up on checkout and the booking detail page', async ({
    page,
  }) => {
    const checkIn = futureDate(120);
    const checkOut = futureDate(123);
    const created = await createThrowawayListing(
      'HOTEL',
      [
        {
          unitLabel: 'Standard Room',
          capacity: 2,
          maxGuests: 2,
          basePriceAmount: 30000,
          basePriceCurrency: 'AMD',
          bedConfiguration: [{ type: 'QUEEN', count: 1 }],
        },
        {
          unitLabel: 'Deluxe Suite',
          capacity: 1,
          maxGuests: 4,
          basePriceAmount: 55000,
          basePriceCurrency: 'AMD',
          bedConfiguration: [{ type: 'KING', count: 1 }],
        },
      ],
      { from: futureDate(115), to: futureDate(126) },
    );
    listingId = created.listingId;

    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${listingId}`);
    await expect(
      page.getByRole('button', { name: 'Check availability' }),
    ).toBeVisible({ timeout: 15_000 });

    // Sprint C-3 (Date-Range Room Availability): for a HOTEL_ROOM listing,
    // dates come FIRST — picking a room, then changing dates, deliberately
    // clears that room (its stay availability/price hasn't been checked
    // against the new range yet). Reflects the real, current, correct
    // contract this test previously predated — see
    // `hotelStayAvailability.spec.js` for the sprint's own dedicated
    // coverage of that invalidation rule.
    await pickDateRange(page, checkIn, checkOut);

    // Real labels + known max guests, never a generic "Type #N" ordinal.
    await page.getByLabel('Unit').click();
    await expect(
      page.getByRole('option', { name: 'Standard Room — Sleeps 2' }),
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: 'Deluxe Suite — Sleeps 4' }),
    ).toBeVisible();
    await page.getByRole('option', { name: 'Deluxe Suite — Sleeps 4' }).click();

    // The headline price switched to the SELECTED unit's own base price,
    // not a static listing-level number. Scoped to the reservation
    // widget (the sidebar's own "complementary" landmark) — Sprint C-2's
    // Rooms section, added after this assertion was written, now ALSO
    // shows this same unit's own price on its card, so a page-wide text
    // match is ambiguous (a real Playwright strict-mode violation, not a
    // product bug — see `getByRole('complementary')`'s established use
    // for this same scoping in `publicRoomsAccessibility.spec.js`).
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText(/55,000/)).toBeVisible();
    await expect(sidebar.getByText(/1 × King/)).toBeVisible();

    // Guest count is clamped to max_guests x quantity (Deluxe Suite:
    // capacity 1, so no quantity stepper — cap is 4 x 1 = 4).
    const guestsInput = page.getByLabel('Guests');
    await guestsInput.fill('99');
    await expect(guestsInput).toHaveValue('4');

    // 3 nights at 55,000/night = 165,000 — the server-computed stay total
    // (Sprint C-3), checkout-exclusive not 4 nights (220,000). Scoped to
    // the widget for the same reason as the headline price above — the
    // Rooms section's own Deluxe Suite card shows this identical figure.
    await expect(sidebar.getByText(/165,000/)).toBeVisible();

    await page.getByRole('button', { name: 'Check availability' }).click();
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);

    await expect(page.getByText('Room / unit type')).toBeVisible();
    await expect(page.getByText('Deluxe Suite')).toBeVisible();
    await expect(page.getByText('Nights')).toBeVisible();

    await page.getByRole('button', { name: 'Confirm booking request' }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/);
    await expect(page.getByText('Room / unit type')).toBeVisible();
    await expect(page.getByText('Deluxe Suite')).toBeVisible();
  });

  test('the backend independently rejects a guest count over max_guests × quantity, even bypassing the client-side clamp', async () => {
    const created = await createThrowawayListing('HOTEL', [
      {
        unitLabel: 'Capacity Test Room',
        capacity: 1,
        maxGuests: 2,
        basePriceAmount: 20000,
        basePriceCurrency: 'AMD',
      },
    ]);
    listingId = created.listingId;

    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
    const customerLogin = await ctx.post('auth/login', { data: CUSTOMER });
    const { access_token: customerToken } = (await customerLogin.json()).data;

    const dateFrom = isoDate(futureDate(160));
    const dateTo = isoDate(futureDate(161));
    const holdRes = await ctx.post('booking-holds', {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        items: [
          { bookableUnitId: created.unitIds[0], dateFrom, dateTo, quantity: 1 },
        ],
      },
    });
    const holdIds = (await holdRes.json()).data.items[0].hold_ids;

    const bookingRes = await ctx.post('bookings', {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        items: [{ holdIds, guests: [], guestCount: 3 }],
        guestContactSnapshot: {
          fullName: 'E2E Guest',
          email: 'e2e-guest@example.com',
        },
      },
    });
    expect(bookingRes.status()).toBe(422);
    const body = await bookingRes.json();
    expect(
      body.error.details.some((d) => d.issue === 'GUEST_CAPACITY_EXCEEDED'),
    ).toBe(true);
    await ctx.dispose();
  });
});

test.describe('P2.2B — single-unit PROPERTY regression', () => {
  let listingId;

  test.afterEach(async ({ request }) => {
    if (!listingId) return;
    await deleteListing(request, listingId);
    listingId = undefined;
  });

  test('a single-unit property keeps a simple booking flow — no unit selector, guest count still available and unclamped for a unit with no max_guests', async ({
    page,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
    const loginRes = await ctx.post('auth/login', { data: VENDOR });
    const { access_token: accessToken } = (await loginRes.json()).data;
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    const createRes = await ctx.post('listings', {
      headers: authHeaders,
      data: {
        partnerId: 1,
        listingType: 'PROPERTY',
        translations: [
          { languageId: 1, title: `P2.2B PROPERTY Test ${Date.now()}` },
        ],
      },
    });
    const listing = (await createRes.json()).data;
    listingId = listing.id;

    await ctx.patch(`listings/${listing.id}`, {
      headers: authHeaders,
      data: { location: { latitude: 40.1772, longitude: 44.5035 } },
    });
    await ctx.post(`listings/${listing.id}/media`, {
      headers: { ...authHeaders, 'Content-Type': 'image/png' },
      data: ONE_PX_PNG,
    });
    // A legacy-shaped unit — no maxGuests, no basePriceAmount, no
    // unitLabel — the exact shape a pre-P2.2A unit would have.
    await ctx.post('availability/units', {
      headers: authHeaders,
      data: {
        listingId: listing.id,
        bookableUnitType: 'PROPERTY_UNIT',
        capacity: 1,
      },
    });
    await ctx.post(`listings/${listing.id}/publish`, { headers: authHeaders });
    await ctx.dispose();

    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${listingId}`);
    await expect(
      page.getByRole('button', { name: 'Check availability' }),
    ).toBeVisible({ timeout: 15_000 });

    // Single unit auto-selected — no selector, no quantity stepper.
    await expect(page.getByLabel('Unit')).not.toBeVisible();
    await expect(page.getByLabel('Quantity')).not.toBeVisible();

    // Guest count is still offered, but with no max_guests to enforce, a
    // large value is accepted as-is — never an invented limit.
    const guestsInput = page.getByLabel('Guests');
    await expect(guestsInput).toBeVisible();
    await guestsInput.fill('12');
    await expect(guestsInput).toHaveValue('12');

    await pickDateRange(page, futureDate(140), futureDate(141));

    await expect(
      page.getByRole('button', { name: 'Check availability' }),
    ).toBeEnabled();
  });
});
