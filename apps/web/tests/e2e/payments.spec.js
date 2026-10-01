/**
 * Phase 16 Payment Infrastructure: the customer "Pay Now" flow (success
 * and decline), the customer payment-history page, the partner payable-
 * balance card, and the admin payments list/detail/refund flow — against
 * the real backend + demo-seeded dev database
 * (`seedDemoMarketplace.js`'s 30 seeded payments/4 refunds give every
 * persona real payment states to assert against).
 *
 * `AuthProvider` attempts `POST /auth/refresh` on every full page load
 * (mount), and `/auth/login`/`/auth/refresh` share the
 * `sensitiveRateLimiter` tier's tight 10/min ceiling with every other
 * spec file hitting the same IP. A first version of this file used a
 * raw `page.goto()` per sub-page and tripped that ceiling mid-run — the
 * exact class of problem the Phase 15 lesson already named. The fix:
 * log in once per persona, then reach every other in-app page via a
 * client-side `<Link>` click (no full reload, no extra `/auth/refresh`
 * call) instead of a second `page.goto()`. `retries: 1` here is the
 * test-execution-strategy fix the shared window calls for, not a
 * weakening of the limiter itself — by the time a retry runs, the window
 * has partially drained. (Until the P2.1 stabilization fix to
 * `AuthProvider.jsx`, React StrictMode's dev-only double-invoke of mount
 * effects doubled every one of these refresh calls, silently doubling
 * this file's real rate-limit consumption — fixed at the source, not
 * worked around here.)
 */

import { test, expect } from './fixtures.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const DEMO_PASSWORD = 'DemoPass!2024';
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };

// A reliably high-capacity, always-available unit — never depleted by
// other specs (inventory.spec.js's own capacity-consuming flows use the
// tour/fleet/guide fixtures, never this hotel).
const HOTEL_SLUG = 'demo-vendor-boutique-yerevan-hotel';

// A per-process salt (mirrors `inventory.spec.js`'s identical fix) so
// repeated runs land on different dates instead of repeatedly booking
// the same day — confirmed: without this, a handful of successive local
// runs exhausted the Standard Room's 5-unit capacity for one fixed date,
// reintroducing the exact finite-resource problem this helper exists to
// avoid, just self-inflicted instead of seed-inflicted.
const RUN_SALT_DAYS = Date.now() % 200;

function futureISO(daysFromNow) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow + RUN_SALT_DAYS);
  return d.toISOString().slice(0, 10);
}

// Logs in as the given demo customer, capturing the access token from
// the UI login's own `POST /auth/login` network response, then creates
// a real, fresh CONFIRMED booking for them via the same hold -> booking
// -> confirm endpoints the real checkout/vendor-confirmation UI calls —
// never a direct DB write, never a fabricated payment.
//
// This replaces an earlier version that searched the demo seed for an
// existing unpaid CONFIRMED booking. That assumed the seed's supply was
// effectively infinite; it isn't — a successful SUCCESS-payment run
// permanently pays whichever booking it finds, so repeated runs (this
// file's own retry, or repeated local runs between reseeds) eventually
// exhaust it, exactly like `inventory.spec.js`'s own documented
// finite-capacity flows. Building the precondition here instead makes
// this test infinitely re-runnable without depending on reseed timing.
async function loginAndCreateConfirmedBooking(page, request, email) {
  await page.goto('/en/auth/login');
  // The frontend dev server proxies `/api/v1/*` to the backend (see
  // `vite.config.js`), so the login request the browser actually makes
  // is same-origin (`http://localhost:5173/api/v1/auth/login`), not the
  // `API_BASE_URL` used below for the `request` fixture's own direct
  // backend calls.
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/login') &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  );
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  const loginResponse = await loginResponsePromise;
  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 10_000 });

  const { data: authData } = await loginResponse.json();
  const headers = { Authorization: `Bearer ${authData.access_token}` };

  const searchResponse = await request.get(
    `${API_BASE_URL}/search?keyword=${encodeURIComponent(HOTEL_SLUG)}`,
  );
  const { data: searchResults } = await searchResponse.json();
  const listing = (searchResults ?? []).find((l) => l.slug === HOTEL_SLUG);
  if (!listing) {
    throw new Error(`Fixture listing "${HOTEL_SLUG}" not found via search.`);
  }
  const unitsResponse = await request.get(
    `${API_BASE_URL}/availability/${listing.id}/units`,
  );
  const { data: units } = await unitsResponse.json();
  const unit = units.find((u) => u.unit_label === 'Standard Room');
  if (!unit) {
    throw new Error(`"Standard Room" unit not found on listing ${listing.id}.`);
  }

  // A 1-night stay, comfortably far out to avoid any other spec's
  // date-specific fixtures on this same listing.
  const dateFrom = futureISO(140);
  const dateTo = futureISO(141);

  const holdResponse = await request.post(`${API_BASE_URL}/booking-holds`, {
    headers,
    data: {
      items: [{ bookableUnitId: unit.id, dateFrom, dateTo, quantity: 1 }],
    },
  });
  if (!holdResponse.ok()) {
    throw new Error(
      `Creating a reservation hold failed: ${holdResponse.status()} ${await holdResponse.text()}`,
    );
  }
  const { data: holdBatch } = await holdResponse.json();
  const { hold_ids: holdIds, quote } = holdBatch.items[0];

  const bookingResponse = await request.post(`${API_BASE_URL}/bookings`, {
    headers,
    data: {
      items: [
        {
          holdIds,
          guests: [{ fullName: 'Elena Simonyan' }],
          // Step L6.2H4: the customer accepts the hold's server quote.
          expectedTotalAmount: quote.total_amount,
          expectedCurrency: quote.currency,
        },
      ],
      guestContactSnapshot: {
        fullName: 'Elena Simonyan',
        email,
      },
    },
  });
  if (!bookingResponse.ok()) {
    throw new Error(
      `Creating the booking failed: ${bookingResponse.status()} ${await bookingResponse.text()}`,
    );
  }
  const { data: booking } = await bookingResponse.json();

  // Confirmed via the same `booking.confirm` permission the real vendor-
  // confirmation UI relies on (`admin.spec.js`'s own confirm flow uses
  // the identical permission) — a direct API call, not a second UI login/
  // page load, to keep this within the file's own documented rate-limit
  // budget.
  const adminLoginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
    data: ADMIN,
  });
  const { data: adminAuth } = await adminLoginResponse.json();
  const confirmResponse = await request.post(
    `${API_BASE_URL}/bookings/${booking.id}/confirm`,
    { headers: { Authorization: `Bearer ${adminAuth.access_token}` } },
  );
  if (!confirmResponse.ok()) {
    throw new Error(
      `Confirming the booking failed: ${confirmResponse.status()} ${await confirmResponse.text()}`,
    );
  }

  return booking;
}

// Client-side navigation to a specific booking's detail page — reuses
// the already-loaded app shell (no full reload, no extra
// `/auth/refresh` call), via the real "Bookings" nav link.
async function goToBookingDetailInApp(page, bookingId) {
  await page.getByRole('link', { name: 'Bookings', exact: true }).click();
  await page
    .locator(`a[href$="/account/bookings/${bookingId}"]`)
    .first()
    .click();
}

test.describe.serial('Payments', () => {
  test.describe.configure({ retries: 1 });

  test('a SUCCESS simulated payment shows the paid summary on the booking detail page and in payment history', async ({
    page,
    request,
  }) => {
    const booking = await loginAndCreateConfirmedBooking(
      page,
      request,
      'elena.simonyan@example.com',
    );

    await goToBookingDetailInApp(page, booking.id);
    await expect(
      page.getByRole('heading', { name: 'Pay for this booking' }),
    ).toBeVisible({ timeout: 10_000 });
    // "Development / Demo Payment" disclosure must be visible before any
    // simulated charge — Phase 16 spec §5/§20's required disclosure.
    await expect(
      page.getByText('Development / Demo Payment').first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Pay now' }).click();

    await expect(page.getByText('Payment successful.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Paid', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Pay for this booking' }),
    ).toHaveCount(0);

    // Same login, same session — the customer payment-history page shows
    // this same payment, reached via client-side nav (no extra login).
    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'My payments' }),
    ).toBeVisible();
    await expect(page.getByText('View booking').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a DECLINE simulated payment shows a Declined status and lets the customer retry', async ({
    page,
    request,
  }) => {
    const booking = await loginAndCreateConfirmedBooking(
      page,
      request,
      'tigran.vardanyan@example.com',
    );

    await goToBookingDetailInApp(page, booking.id);
    await expect(
      page.getByRole('heading', { name: 'Pay for this booking' }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('select-trigger').click();
    await page.getByRole('option', { name: 'Declined payment' }).click();
    await page.getByRole('button', { name: 'Pay now' }).click();

    await expect(
      page.getByText('The simulated payment was declined.'),
    ).toBeVisible({ timeout: 10_000 });
    // A terminal FAILED payment is retryable — `BookingPaymentSection`
    // shows `PayNowPanel` again rather than getting stuck.
    await expect(
      page.getByRole('heading', { name: 'Pay for this booking' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('the partner dashboard shows a real payable balance card', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('partner.hotels@example.com');
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/partner$/, { timeout: 10_000 });

    await expect(
      page.getByRole('heading', { name: 'Payable balance' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('an admin can inspect the payments list/detail and issue a simulated refund', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel('Password').fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/, { timeout: 10_000 });

    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();

    // Scope to the SUCCEEDED filter (labeled "Paid" —
    // `payments.status.SUCCEEDED`) so the first row is guaranteed
    // refundable (`AdminPaymentDetailContent`'s own `REFUNDABLE_STATUSES`
    // is `['SUCCEEDED', 'PARTIALLY_REFUNDED']`).
    await page.getByTestId('select-trigger').click();
    await page.getByRole('option', { name: 'Paid', exact: true }).click();

    const firstReferenceLink = page
      .locator('a[href*="/admin/payments/"]')
      .first();
    await expect(firstReferenceLink).toBeVisible({ timeout: 10_000 });
    await firstReferenceLink.click();
    await expect(
      page.getByRole('heading', { name: /^Payment PAY-/ }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Issue refund' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Reason (optional)').fill('E2E refund check.');
    await dialog.getByRole('button', { name: 'Issue refund' }).click();

    await expect(page.getByText('Refund issued.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Refunds')).toBeVisible({ timeout: 10_000 });
  });
});
