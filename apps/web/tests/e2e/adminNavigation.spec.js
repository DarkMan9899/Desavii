/**
 * Admin navigation and role-aware "My account", end to end (seeded
 * accounts; two disposable sign-ups promoted to MANAGER / MARKETING by the
 * admin API, removed by the next `db:seed:demo`):
 * - the owner-reported flow: an admin who steps out to the public Home via
 *   the logo and opens "My account" lands back on /admin — it used to
 *   open the customer /account. Same check for customer, partner,
 *   manager and marketing, each to their own workspace;
 * - every Admin sidebar entry opens the right page (URL and heading), is
 *   the one highlighted item, and keeps the locale;
 * - on a phone, every bottom-bar entry is tapped where it is drawn — the
 *   bar's sections used to overlap, so a tap opened the neighbouring page
 *   or nothing;
 * - back/forward and a reload on a nested page stay coherent;
 * - a non-admin typing an /admin URL gets the forbidden page.
 * The test database has one admin-area account (SUPER_ADMIN); the other
 * admin-area roles' destinations and visible sections are covered by
 * unit tests (`UserMenu`, `AdminLayout`, `authDestinations`).
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const PARTNER = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const DISPOSABLE_PASSWORD = 'Synthetic!Pass2026';
// Every Admin section a SUPER_ADMIN sees, with the heading of its page.
const ADMIN_SECTIONS = [
  ['Dashboard', '/en/admin', 'Marketplace overview'],
  [
    'Configuration',
    '/en/admin/marketplace-config',
    'Marketplace Configuration',
  ],
  ['Promotions', '/en/admin/promotions', 'Promotions'],
  ['Users', '/en/admin/users', 'Users'],
  ['Partners', '/en/admin/partners', 'Partners'],
  ['Managers', '/en/admin/managers', 'Managers'],
  ['Listings', '/en/admin/listings', 'Listing Moderation'],
  ['Bookings', '/en/admin/bookings', 'Bookings'],
  ['Payments', '/en/admin/payments', 'Payments'],
  ['Reviews', '/en/admin/reviews', 'Review Moderation'],
  ['Inventory', '/en/admin/inventory', 'Inventory Oversight'],
  ['Audit Logs', '/en/admin/audit-logs', 'Audit Logs'],
  ['System Health', '/en/admin/system-health', 'System Health'],
  ['Content', '/en/admin/cms', 'Content Pages'],
  ['Blog', '/en/admin/blog', 'Blog'],
  ['Contact Inquiries', '/en/admin/contact-inquiries', 'Contact Inquiries'],
  ['AI Moderation', '/en/admin/ai/moderation', 'AI Moderation'],
  ['AI Usage', '/en/admin/ai/usage', 'AI Usage'],
  ['Settings', '/en/admin/settings', 'Settings'],
  ['Messages', '/en/admin/messages', 'Messages'],
  ['Notifications', '/en/admin/notifications', 'Notifications'],
];

async function login(page, { email, password }) {
  await resetRateLimits();
  await page.context().clearCookies();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

async function apiToken(credentials) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.post('auth/login', { data: credentials });
  const token = (await res.json()).data.access_token;
  await ctx.dispose();
  return token;
}

/** A disposable account the admin promotes through the real admin API. */
async function createPromotedAccount(promotePath) {
  const credentials = {
    email: `e2e.nav.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.test`,
    password: DISPOSABLE_PASSWORD,
  };
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const registered = await ctx.post('auth/register', {
    data: { ...credentials, firstName: 'E2E', lastName: 'Workspace' },
  });
  expect(registered.status()).toBe(201);
  const me = await ctx.get('auth/me', {
    headers: {
      Authorization: `Bearer ${(await registered.json()).data.access_token}`,
    },
  });
  const userId = (await me.json()).data.user.id;
  const promoted = await ctx.post(promotePath, {
    headers: { Authorization: `Bearer ${await apiToken(ADMIN)}` },
    data: { userId },
  });
  expect(promoted.ok()).toBe(true);
  await ctx.dispose();
  return credentials;
}

/** Logo -> public Home -> account menu -> "My account". */
async function myAccountFromHome(page, { menuLabel, accountLabel, locale }) {
  await page
    .locator('header')
    .getByRole('link', { name: 'desavii' })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  // The URL changes at once; the lazily loaded Home replaces the
  // workspace a moment later. Every workspace has a sidebar <aside>, Home
  // has none — wait for it to go before using Home's header.
  await expect(page.locator('aside')).toHaveCount(0);
  await page.getByRole('button', { name: menuLabel }).click();
  await page.getByRole('menuitem', { name: accountLabel }).click();
}

test.describe('Admin navigation and role-aware "My account"', () => {
  test.describe('desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('an admin who steps out to Home via the logo returns to /admin from "My account"', async ({
      page,
    }) => {
      await login(page, ADMIN);
      await expect(page).toHaveURL(/\/en\/admin$/);
      await page.goto('/en/admin/users');

      await myAccountFromHome(page, {
        menuLabel: 'Account menu',
        accountLabel: 'My Account',
        locale: 'en',
      });

      await expect(page).toHaveURL(/\/en\/admin$/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Marketplace overview' }),
      ).toBeVisible();
    });

    [
      ['a customer', CUSTOMER, /\/en\/account$/],
      ['a partner owner', PARTNER, /\/en\/partner$/],
    ].forEach(([who, account, workspace]) => {
      test(`"My account" from Home returns ${who} to their own workspace`, async ({
        page,
      }) => {
        await login(page, account);
        await expect(page).toHaveURL(workspace);
        await myAccountFromHome(page, {
          menuLabel: 'Account menu',
          accountLabel: 'My Account',
          locale: 'en',
        });
        await expect(page).toHaveURL(workspace);
      });
    });

    [
      ['manager', 'managers/admin/promote', /\/en\/manager$/],
      ['marketing', 'blog/admin/marketing-role/promote', /\/en\/marketing$/],
    ].forEach(([role, promotePath, workspace]) => {
      test(`a ${role} user logs in to, and returns from Home to, the ${role} workspace`, async ({
        page,
      }) => {
        const account = await createPromotedAccount(promotePath);
        await login(page, account);
        await expect(page).toHaveURL(workspace);
        await myAccountFromHome(page, {
          menuLabel: 'Account menu',
          accountLabel: 'My Account',
          locale: 'en',
        });
        await expect(page).toHaveURL(workspace);
      });
    });

    test('every Admin sidebar entry opens its own page and is the one highlighted item', async ({
      page,
    }) => {
      await login(page, ADMIN);
      const sidebar = page.getByRole('navigation', { name: 'Admin' });
      await expect(sidebar.getByRole('link')).toHaveCount(
        ADMIN_SECTIONS.length,
      );

      // One section after another, in sidebar order.
      await ADMIN_SECTIONS.reduce(
        (previous, [label, href, heading]) =>
          previous.then(async () => {
            await sidebar
              .getByRole('link', { name: label, exact: true })
              .click();
            await expect(page).toHaveURL(new RegExp(`${href}$`));
            await expect(
              page.getByRole('heading', { level: 1, name: heading }),
            ).toBeVisible();
            await expect(
              sidebar.locator('a[aria-current="page"]'),
            ).toHaveAccessibleName(label);
          }),
        Promise.resolve(),
      );
    });

    test('back, forward and a reload on a nested page keep the URL, page and highlighted section together; the locale is kept', async ({
      page,
    }) => {
      await login(page, ADMIN);
      await page.goto('/ru/admin/users');
      const sidebar = page.getByRole('navigation', { name: 'Администратор' });
      const current = sidebar.locator('a[aria-current="page"]');
      await sidebar.getByRole('link', { name: 'Бронирования' }).click();
      await expect(page).toHaveURL(/\/ru\/admin\/bookings$/);

      await page.goBack();
      await expect(page).toHaveURL(/\/ru\/admin\/users$/);
      await expect(current).toHaveAccessibleName('Пользователи');
      await page.goForward();
      await expect(page).toHaveURL(/\/ru\/admin\/bookings$/);
      await expect(current).toHaveAccessibleName('Бронирования');

      await page
        .getByRole('main')
        .locator('a[href^="/ru/admin/bookings/"]')
        .first()
        .click();
      await expect(page).toHaveURL(/\/ru\/admin\/bookings\/\d+$/);
      await page.reload();
      await expect(page).toHaveURL(/\/ru\/admin\/bookings\/\d+$/);
      await expect(current).toHaveAccessibleName('Бронирования');
    });

    test('a customer typing an /admin URL gets the forbidden page, not admin content', async ({
      page,
    }) => {
      await login(page, CUSTOMER);
      await page.goto('/en/admin/users');

      await expect(page.getByText('Access restricted')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(
        0,
      );
    });
  });

  test.describe('phone (390px, touch)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('HY: every bottom-bar entry opens its own page when tapped where it is drawn', async ({
      page,
    }) => {
      await login(page, ADMIN);
      await page.goto('/hy/admin');
      const bar = page.getByRole('navigation', { name: 'Ադմինիստրատոր' });
      await expect(bar.getByRole('link')).toHaveCount(ADMIN_SECTIONS.length);
      const hrefs = await bar
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
      expect(hrefs).toHaveLength(ADMIN_SECTIONS.length);

      // One entry after another: bring it into the bar's view, prove the
      // spot a finger would press is the entry itself, then tap it.
      await hrefs.reduce(
        (previous, href) =>
          previous.then(async () => {
            const link = bar.locator(`a[href="${href}"]`);
            await link.evaluate((element) =>
              element.scrollIntoView({ inline: 'center', block: 'nearest' }),
            );
            const hitsItself = await link.evaluate((element) => {
              const r = element.getBoundingClientRect();
              const hit = document.elementFromPoint(
                r.left + r.width / 2,
                r.top + r.height / 2,
              );
              return element === hit || element.contains(hit);
            });
            expect(hitsItself, href).toBe(true);
            await link.tap();
            await expect(page).toHaveURL(new RegExp(`${href}$`));
          }),
        Promise.resolve(),
      );
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });

    test('HY: from Home, "My account" in the phone menu returns the admin to /hy/admin', async ({
      page,
    }) => {
      await login(page, ADMIN);
      await page.goto('/hy/admin/settings');
      await page
        .locator('header')
        .getByRole('link', { name: 'desavii' })
        .first()
        .tap();
      await expect(page).toHaveURL(/\/hy$/);
      await expect(page.locator('aside')).toHaveCount(0);

      await page.getByRole('button', { name: 'Բացել ընտրացանկը' }).tap();
      // Home's header drawer holds the account menu on a phone.
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Հաշվի ընտրացանկ' }).tap();
      await page.getByRole('menuitem', { name: 'Իմ հաշիվը' }).tap();

      await expect(page).toHaveURL(/\/hy\/admin$/);
    });
  });
});
