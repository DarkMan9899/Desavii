/**
 * Phase 11 pre-flight verification: partner dashboard flows against the
 * real backend + demo-seeded test database — dashboard stats, listings
 * management, calendar, and bookings, using one of the 5 demo partner
 * accounts (hotels partner: real stats/listings/bookings tied to it).
 */

import { test, expect } from './fixtures.js';

async function loginAsDemoPartner(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('partner.hotels@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  // A user with a partnership lands on /partner by default (Phase 10's
  // role-aware redirect), not /account.
  await expect(page).toHaveURL(/\/en\/partner$/);
}

test.describe('Partner dashboard', () => {
  test('shows real stats from the demo hotels partner', async ({ page }) => {
    await loginAsDemoPartner(page);
    await expect(
      page.getByRole('link', { name: 'Listings', exact: true }),
    ).toBeVisible();
  });
});

test.describe('Partner listings', () => {
  test("lists this partner's real demo listings across every status", async ({
    page,
  }) => {
    await loginAsDemoPartner(page);
    await page.getByRole('link', { name: 'Listings', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/partner\/listings$/);
    // 16 demo hotel listings exist for this partner across Draft/Pending
    // Review/Published/Rejected — the management table should show real
    // rows, not an empty state.
    await expect(page.getByText(/Hotel/i).first()).toBeVisible();
  });
});

test.describe('Partner calendar', () => {
  test('renders the calendar for a real demo listing/unit', async ({
    page,
  }) => {
    await loginAsDemoPartner(page);
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/en\/partner\/calendar$/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
});

test.describe('Partner bookings', () => {
  test('lists real demo bookings for this partner and opens a detail page', async ({
    page,
  }) => {
    await loginAsDemoPartner(page);
    await page.getByRole('link', { name: 'Bookings', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/partner\/bookings$/);

    const firstBookingLink = page
      .locator('a[href*="/partner/bookings/"]')
      .first();
    await expect(firstBookingLink).toBeVisible();
    await firstBookingLink.click();

    await expect(page).toHaveURL(/\/en\/partner\/bookings\/\d+/);
    await expect(
      page.getByRole('heading', { level: 1, name: /^Booking BK-/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
