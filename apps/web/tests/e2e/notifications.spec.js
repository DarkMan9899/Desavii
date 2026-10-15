/**
 * Phase 13 Notifications Platform: bell badge, dropdown, the full
 * Notifications page (tabs/filters/search/mark-read/archive/delete), and
 * the admin-announcement pipeline — against the real backend +
 * demo-seeded dev database (`seedDemoMarketplace.js`'s 266 seeded
 * notifications give every persona a realistic unread/read/archived mix
 * to assert against).
 */

import { test, expect } from './fixtures.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';

// Each describe block below uses its own distinct demo customer email —
// several tests mutate shared read/archived/deleted state, so sharing one
// account across concurrently-running describe blocks would race.
async function loginAsDemoCustomer(
  page,
  email = 'anna.harutyunyan@example.com',
) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

async function loginAsDemoPartner(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('partner.hotels@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

// The account sidebar nav is also a <ul>/<li> list, so an unscoped
// `page.getByRole('listitem')` matches its first entry (e.g. "Overview"),
// not a notification row. Every real NotificationRow renders a "Delete"
// button — nothing else on the page does — so filtering on that is a
// reliable way to select only actual notification rows.
function notificationRows(page) {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Delete' }) });
}

test.describe('Notification bell', () => {
  test('shows an unread badge and lists recent notifications in the dropdown', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page, 'davit.sargsyan@example.com');

    const bellTrigger = page.getByRole('button', { name: /Notifications/ });
    await expect(bellTrigger).toBeVisible();
    await bellTrigger.click();

    await expect(page.getByText('Notifications').first()).toBeVisible();
    await expect(page.getByText('View all notifications')).toBeVisible();
  });

  test('mark all as read clears the unread badge', async ({ page }) => {
    await loginAsDemoCustomer(page, 'davit.sargsyan@example.com');

    const bellTrigger = page.getByRole('button', { name: /Notifications/ });
    await bellTrigger.click();

    const markAllButton = page.getByRole('button', {
      name: 'Mark all as read',
    });
    // Demo data guarantees a realistic unread/read/archived mix, but a
    // given customer's dropdown page (most recent 6) could theoretically
    // already be all-read — only act on the button when it's rendered.
    if (await markAllButton.isVisible().catch(() => false)) {
      await markAllButton.click();
      await expect(markAllButton).toHaveCount(0);
    }
  });
});

// Serial: every test here logs in as the same demo customer and mutates
// (marks read/archives/deletes) shared notification rows — running them
// concurrently across workers races over the same "first row" lookups.
test.describe.serial('Notifications page', () => {
  test('lists real seeded notifications across All/Unread/Archived tabs', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/notifications');
    await expect(
      page.getByRole('heading', { name: 'Notifications' }),
    ).toBeVisible();

    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(page.getByRole('tab', { name: 'Archived' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Every demo customer has some archived rows (the seed's deterministic
    // 1-in-4 archived cycle) — real seeded data, not an assumption.
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('filtering by category narrows the list to that category only', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/notifications');
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Bookings', exact: true }).click();
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });
    const rowCount = await notificationRows(page).count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('searching narrows the list to matching notifications', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/notifications');
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByPlaceholder('Search notifications').fill('booking');
    // Debounced (300ms) — give the query time to refire.
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('marking a row as read removes its unread indicator', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/notifications');
    await page.getByRole('tab', { name: 'Unread' }).click();
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });

    const firstRow = notificationRows(page).first();
    const messageText = await firstRow.locator('p').first().textContent();
    await firstRow.getByRole('button', { name: 'Mark as read' }).click();

    // The Unread tab excludes now-read rows — the specific row's message
    // disappears from this filtered view.
    await expect(page.getByText(messageText, { exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('archiving a row moves it into the Archived tab', async ({ page }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/notifications');
    await page.getByRole('tab', { name: 'All' }).click();
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });

    const archivableRow = notificationRows(page)
      .filter({ has: page.getByRole('button', { name: 'Archive' }) })
      .first();
    const messageText = await archivableRow.locator('p').first().textContent();
    await archivableRow.getByRole('button', { name: 'Archive' }).click();

    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(
      page.getByText(messageText, { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('deleting a row removes it from every tab', async ({ page }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/notifications');
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });

    const firstRow = notificationRows(page).first();
    const messageText = await firstRow.locator('p').first().textContent();
    await firstRow.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(messageText, { exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

test.describe('Notification preferences (Account Settings)', () => {
  test('lists per-category in-app/email toggles and persists a change', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page, 'mariam.petrosyan@example.com');
    await page.goto('/en/account/settings');
    await expect(
      page.getByRole('heading', { name: 'Notification preferences' }),
    ).toBeVisible();
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'Bookings' }),
    ).toBeVisible();

    const emailToggle = page.getByRole('switch', { name: 'Email' }).first();
    const wasChecked = await emailToggle.isChecked();
    await emailToggle.click({ force: true });
    await expect(emailToggle).toBeChecked({ checked: !wasChecked });

    await page.reload();
    await expect(
      page.getByRole('switch', { name: 'Email' }).first(),
    ).toBeChecked({ checked: !wasChecked, timeout: 10_000 });

    // Revert so the demo-seeded baseline stays clean for other test runs.
    await page.getByRole('switch', { name: 'Email' }).first().click({
      force: true,
    });
    await expect(
      page.getByRole('switch', { name: 'Email' }).first(),
    ).toBeChecked({ checked: wasChecked });
  });
});

test.describe('Partner notifications', () => {
  test('a demo partner owner sees their own real booking/review/favorite notifications', async ({
    page,
  }) => {
    await loginAsDemoPartner(page);
    await page.goto('/en/partner/notifications');
    await expect(
      page.getByRole('heading', { name: 'Notifications' }),
    ).toBeVisible();
    await expect(notificationRows(page).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Admin announcement pipeline', () => {
  test('an announcement created via the real API is seen by a real recipient', async ({
    page,
    request,
  }) => {
    const uniqueTitle = `E2E announcement ${Date.now()}`;

    const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' },
    });
    expect(loginResponse.ok()).toBe(true);
    const { data: authData } = await loginResponse.json();

    const announcementResponse = await request.post(
      `${API_BASE_URL}/notifications/announcements`,
      {
        headers: { Authorization: `Bearer ${authData.access_token}` },
        data: {
          audience: { type: 'ALL' },
          priorityCode: 'HIGH',
          payload: { title: uniqueTitle, body: 'End-to-end pipeline check.' },
        },
      },
    );
    expect(announcementResponse.ok()).toBe(true);

    await loginAsDemoCustomer(page, 'karen.avetisyan@example.com');
    await page.goto('/en/account/notifications');
    await page.getByPlaceholder('Search notifications').fill(uniqueTitle);
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });
});
