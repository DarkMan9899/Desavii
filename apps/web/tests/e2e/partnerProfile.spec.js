/**
 * P1.3 (Master Roadmap): end-to-end company profile management against
 * the real backend + dev-seeded database. Builds on the P1.2 onboarding
 * flow (register -> apply -> submit -> admin approves) to reach a real
 * APPROVED partner, then edits the company profile and verifies the
 * public company page reflects the change immediately — no caching
 * layer, no separate "publish" step.
 *
 * Finding the public page without hardcoding a slug: `GET /partners`
 * (the Companies directory) is `ORDER BY p.id DESC` — a freshly created
 * partner always has the highest id, so it's always the FIRST card on
 * `/companies`'s first page.
 *
 * This spec creates real, permanent `users`/`partners` rows and never
 * deletes them (no delete API exists for either, by design) — see
 * `./README.md` for why that's fine as long as this suite runs against
 * the disposable `travelhub_test` database, and NOT the persistent
 * `travelhub_dev` one.
 */

import { test, expect, resetRateLimits } from './fixtures.js';

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

async function login(page, email, password) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test.describe('Partner company profile — happy path', () => {
  test('an approved partner can edit their public company profile, and the public page reflects it immediately', async ({
    page,
  }) => {
    const ownerEmail = await registerNewUser(page, 'e2e-profile');
    const businessName = `E2E Profile Co ${Date.now()}`;

    await page.goto('/en/partner/apply');
    await page.getByLabel('Public business name').fill(businessName);
    await page.getByLabel('Legal business name').fill(`${businessName} LLC`);
    await page.getByLabel('Business email').fill('contact@e2e-profile.example');
    await page.getByLabel('Business phone').fill('+37400000088');
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Under review', { exact: true })).toBeVisible();

    await logout(page);
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/partners');
    await page.getByLabel('Search partners').fill(businessName);
    await page.keyboard.press('Enter');
    await page.getByRole('link', { name: businessName }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Approve' }).last().click();
    await expect(
      page.getByText('Partner verification approved.'),
    ).toBeVisible();
    await logout(page);

    // This test chains three sensitive-tier auth calls (register, admin
    // login, owner re-login) against the real 10/min production ceiling;
    // flush again here so the owner re-login below never trips it.
    await resetRateLimits();

    // Back as the (now-approved) owner.
    await login(page, ownerEmail, 'StrongPass!2024');
    await expect(page).toHaveURL(/\/en\/partner$/);
    await page.getByRole('link', { name: 'Company profile' }).click();
    await expect(page).toHaveURL(/\/en\/partner\/profile$/);

    const description = `Guided experiences by ${businessName}, updated ${Date.now()}.`;
    await page.getByLabel('About your business').fill(description);
    await page
      .getByLabel('Facebook')
      .fill('https://facebook.com/e2e-profile-co');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Company profile updated.')).toBeVisible();

    // The public company page — freshly created, so it's the very
    // first (highest-id) card on the directory's first page.
    await page.goto('/en/companies');
    await page.getByRole('link', { name: businessName }).first().click();
    await expect(
      page.getByRole('heading', { name: businessName }),
    ).toBeVisible();
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByRole('link', { name: /Facebook/ })).toHaveAttribute(
      'href',
      'https://facebook.com/e2e-profile-co',
    );
  });
});

test.describe('Partner company profile — permission failures', () => {
  test('a non-partner CUSTOMER cannot reach the company profile page', async ({
    page,
  }) => {
    await registerNewUser(page, 'e2e-profile-noaccess');
    await page.goto('/en/partner/profile');
    // No partnership at all -> RequirePartner renders ForbiddenPage in
    // place (it doesn't navigate elsewhere — see guards/RequirePartner.jsx),
    // same as every other partner-only page.
    await expect(
      page.getByRole('heading', { name: 'Access restricted' }),
    ).toBeVisible();
  });
});
