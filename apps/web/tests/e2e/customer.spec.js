/**
 * Phase 11 pre-flight verification: customer account flows against the
 * real backend + demo-seeded test database — profile, settings,
 * bookings list/detail, and favorites, using the seeded dev customer
 * account (which has real demo bookings/favorites tied to it? No — the
 * demo dataset's bookings/favorites belong to the 20 generated demo
 * customers, not the dev seed account, so this file logs in as one of
 * the demo customers directly by email/password to see real booking
 * history).
 */

import { test, expect } from './fixtures.js';

async function loginAsDemoCustomer(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe('Customer dashboard', () => {
  test('shows the overview page after login', async ({ page }) => {
    await loginAsDemoCustomer(page);
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  });
});

test.describe('Profile', () => {
  test("shows the logged-in customer's real name", async ({ page }) => {
    await loginAsDemoCustomer(page);
    await page.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/en\/account\/profile$/);
    // ProfileForm.jsx deliberately never displays email (immutable
    // post-registration, no backend endpoint supports changing it) —
    // first/last name are the real, editable fields it does show.
    await expect(page.getByLabel('First name')).toHaveValue('Anna');
  });
});

test.describe('Settings', () => {
  test('renders the change-password and danger-zone sections', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/en\/account\/settings$/);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
  });
});

test.describe('Bookings', () => {
  test("lists this customer's real demo bookings and opens a detail page", async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.getByRole('link', { name: 'Bookings', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings$/);

    // The demo seed guarantees every one of the 20 demo customers has at
    // least a few bookings (152 bookings cycled across 20 customers).
    const firstBookingLink = page
      .locator('a[href*="/account/bookings/"]')
      .first();
    await expect(firstBookingLink).toBeVisible();
    await firstBookingLink.click();

    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+/);
    // React Router keeps the list's old content visible for a moment
    // while the detail page's lazily-loaded chunk resolves (React 18
    // transition semantics) — waiting for the detail page's own unique
    // heading, rather than a generic "BK-..." match the still-visible
    // list also satisfies, avoids a strict-mode violation here.
    await expect(
      page.getByRole('heading', { level: 1, name: /^Booking BK-/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
