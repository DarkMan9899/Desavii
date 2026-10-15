/**
 * Phase 11 pre-flight verification: end-to-end auth flow against the real
 * backend (register -> login -> logout, plus refresh-token persistence
 * across a reload). Run with the backend pointed at the demo-seeded test
 * database (`npm run db:seed:demo`) so `login()` below can use the real
 * seeded dev customer account.
 *
 * No forgot-password test exists here: the flow itself doesn't exist yet
 * (no frontend route, no backend endpoint) — a known, documented gap, not
 * something to fake a test around.
 */

import { test, expect } from './fixtures.js';

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}@example.com`;
}

test.describe('Registration', () => {
  test('a new visitor can register and lands on the customer dashboard', async ({
    page,
  }) => {
    await page.goto('/en/auth/register');
    await page.getByLabel('First name').fill('Test');
    await page.getByLabel('Last name').fill('User');
    await page.getByLabel('Email').fill(uniqueEmail('e2e-register'));
    // Not `{ exact: true }`: the required-field asterisk (`Label.jsx`'s
    // `<span aria-hidden="true">*</span>`) is invisible to the browser's
    // computed accessible name (confirmed via ariaSnapshot: "Password"),
    // but Playwright's own exact-match compares against the <label>
    // element's raw textContent, which does include the hidden "*" —
    // an exact match against "Password" alone spuriously fails. A plain
    // substring match is unambiguous here (only one Password-labeled field).
    await page.getByLabel(/^Password/).fill('StrongPass!2024');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/en\/account$/);
  });
});

test.describe('Login / logout', () => {
  test('the seeded dev customer can log in and out', async ({ page }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/en$/);
  });

  test('wrong password shows an error and does not navigate away from the login page', async ({
    page,
  }) => {
    // Uses a throwaway registered user rather than the shared seeded dev
    // customer — 5 consecutive wrong-password attempts against one
    // account trigger a real lockout (see loginLockout.test.js on the
    // backend), and re-running this spec repeatedly against the shared
    // dev account would eventually start hitting that lockout instead of
    // the plain-invalid-credentials path this test means to check.
    const email = uniqueEmail('e2e-wrong-password');
    await page.goto('/en/auth/register');
    await page.getByLabel('First name').fill('Test');
    await page.getByLabel('Last name').fill('User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password/).fill('StrongPass!2024');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/en$/);

    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password/).fill('WrongPassword!1');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/en\/auth\/login$/);
    // The backend's raw error message is shown as-is (not the translated
    // `auth.login.genericError` string, which — confirmed while writing
    // this test — is defined in all 3 locale files but never actually
    // referenced by LoginForm.jsx; a real but low-priority i18n gap
    // logged in the final report rather than "fixed" here, since wiring
    // it in would also swallow the more useful specific message the
    // register flow shows for a duplicate email).
    await expect(page.getByText('Invalid email or password.')).toBeVisible();
  });

  test('a session survives a page reload (refresh-token flow)', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.reload();

    await expect(page).toHaveURL(/\/en\/account$/);
  });
});
