/**
 * P1.2 (Master Roadmap): end-to-end partner onboarding flow against the
 * real backend + dev-seeded database — a brand-new user registers,
 * applies to become a partner, submits for review, and an admin
 * approves the application, mirroring `admin.spec.js`'s and
 * `auth.spec.js`'s conventions (`uniqueEmail`, `loginAsDevAdmin`,
 * `.last()` to target a confirm dialog's own action button over the
 * page's trigger button of the same accessible name).
 *
 * This spec creates real, permanent `users`/`partners` rows and never
 * deletes them (no delete API exists for either, by design) — see
 * `./README.md` for why that's fine as long as this suite runs against
 * the disposable `travelhub_test` database, and NOT the persistent
 * `travelhub_dev` one.
 */

import { test, expect } from './fixtures.js';

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}@example.com`;
}

async function registerNewUser(page, prefix) {
  const email = uniqueEmail(prefix);
  await page.goto('/en/auth/register');
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill('StrongPass!2024');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  return email;
}

async function logout(page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/en$/);
}

async function loginAsDevAdmin(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('admin@travelhub.dev');
  await page.getByLabel(/^Password/).fill('DevAdmin!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

test.describe('Partner onboarding — happy path', () => {
  test('a new user can apply, submit for review, and get approved by an admin', async ({
    page,
  }) => {
    await registerNewUser(page, 'e2e-onboarding');

    const businessName = `E2E Onboarding Co ${Date.now()}`;

    await page.goto('/en/partner/apply');
    await page.getByLabel('Public business name').fill(businessName);
    await page.getByLabel('Legal business name').fill(`${businessName} LLC`);
    await page
      .getByLabel('Business email')
      .fill('contact@e2e-onboarding.example');
    await page.getByLabel('Business phone').fill('+37400000099');
    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page.getByText('Under review', { exact: true })).toBeVisible();

    await logout(page);
    await loginAsDevAdmin(page);

    await page.goto('/en/admin/partners');
    await page.getByLabel('Search partners').fill(businessName);
    await page.keyboard.press('Enter');
    await page.getByRole('link', { name: businessName }).click();
    await expect(page).toHaveURL(/\/en\/admin\/partners\/\d+$/);
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Approve' }).last().click();
    await expect(
      page.getByText('Partner verification approved.'),
    ).toBeVisible();
    await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  });
});

test.describe('Partner onboarding — permission failures', () => {
  test('a CUSTOMER account cannot reach the admin partner review UI', async ({
    page,
  }) => {
    await registerNewUser(page, 'e2e-onboarding-noaccess');
    await page.goto('/en/admin/partners');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });

  test("one applicant's in-progress application never leaks into another user's apply page", async ({
    page,
  }) => {
    await registerNewUser(page, 'e2e-onboarding-a');
    const businessNameA = `E2E Isolation Co A ${Date.now()}`;
    await page.goto('/en/partner/apply');
    await page.getByLabel('Public business name').fill(businessNameA);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    await logout(page);
    await registerNewUser(page, 'e2e-onboarding-b');

    // A completely different account visiting the same route must see
    // their own (empty) create form, never User A's in-progress draft.
    await page.goto('/en/partner/apply');
    await expect(page.getByLabel('Public business name')).toHaveValue('');
    await expect(page.getByText(businessNameA)).not.toBeVisible();
  });
});
