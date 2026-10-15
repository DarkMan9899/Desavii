/**
 * P1.4 (Master Roadmap): end-to-end staff invite/accept flow against the
 * real backend + dev-seeded database. Builds on the P1.2 onboarding flow
 * (register -> apply -> submit -> admin approves) to reach a real
 * APPROVED partner, invites a second real user by email, and has that
 * user accept the invitation from a separate signed-in session —
 * verifying the whole multi-user RBAC path end to end, not just each
 * side in isolation (already covered by backend integration + frontend
 * unit tests).
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

test.describe('Partner staff invite/accept — happy path', () => {
  test('an owner invites a real user by email, and that user accepts and joins the roster', async ({
    page,
  }) => {
    const ownerEmail = await registerNewUser(page, 'e2e-staff-owner');
    const businessName = `E2E Staff Co ${Date.now()}`;

    await page.goto('/en/partner/apply');
    await page.getByLabel('Public business name').fill(businessName);
    await page.getByLabel('Legal business name').fill(`${businessName} LLC`);
    await page.getByLabel('Business email').fill('contact@e2e-staff.example');
    await page.getByLabel('Business phone').fill('+37400000077');
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
    // This test chains many sensitive-tier auth calls in sequence
    // (register, admin login, register again, owner re-login, invitee
    // login, owner re-login) against the real 10/min production
    // ceiling — flush at each major juncture, same pattern
    // `partnerProfile.spec.js` established.
    await resetRateLimits();

    // A second real user, invited by email below — registered here
    // (rather than left to register only after receiving the
    // invitation) to keep this one test focused on the invite/accept
    // RBAC path itself, not also proving self-registration-then-accept
    // (the accept endpoint's email-match check works identically either
    // way — see partnerStaffService.js#acceptInvitation).
    const inviteeEmail = await registerNewUser(page, 'e2e-staff-invitee');
    await logout(page);
    await resetRateLimits();

    await login(page, ownerEmail, 'StrongPass!2024');
    await expect(page).toHaveURL(/\/en\/partner$/);
    // `exact: true` — without it this also substring-matches any partner
    // org card whose name happens to contain "Staff" (e.g. a leftover
    // "E2E Staff Co ..." fixture from another test's own org name),
    // which is a real, reproducible strict-mode violation otherwise.
    await page.getByRole('link', { name: 'Staff', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/partner\/staff$/);

    await page.getByRole('button', { name: 'Invite staff member' }).click();
    await page.getByLabel(/Email address/).fill(inviteeEmail);

    const [inviteResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/staff/invitations') &&
          res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Send invitation' }).click(),
    ]);
    await expect(page.getByText('Invitation sent.')).toBeVisible();
    const { invite_url: inviteUrl } = (await inviteResponse.json()).data;
    expect(inviteUrl).toContain('/partner/invitations/');

    // The invitee is now visible as a pending invitation. Real dual
    // rendering by design (PartnerStaffPageContent.jsx's `.desktopOnly`
    // table + `.mobileOnly` StaffInvitationCard list both stay in the
    // DOM, CSS-hidden per breakpoint) — `.first()` just picks either,
    // the test only cares that the invitee genuinely appears.
    await expect(page.getByText(inviteeEmail).first()).toBeVisible();

    await logout(page);
    await resetRateLimits();
    await login(page, inviteeEmail, 'StrongPass!2024');
    await expect(page).toHaveURL(/\/en\/account$/);

    // Follow the actual invitation link, exactly as the invitee would
    // from their email.
    const invitePath = new URL(inviteUrl).pathname;
    await page.goto(invitePath);
    await expect(
      page.getByRole('heading', { name: `Join ${businessName}` }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByText('Welcome to the team.')).toBeVisible();

    // Accepting grants real partner access — RequirePartner now passes.
    await expect(page).toHaveURL(/\/en\/partner$/);

    // The owner sees the new staff member on the roster, and the
    // invitation is no longer pending.
    await logout(page);
    await resetRateLimits();
    await login(page, ownerEmail, 'StrongPass!2024');
    // Wait for the post-login client-side redirect to actually land
    // before the next `goto` (a full page reload) — otherwise the
    // reload can race ahead of the browser committing the refresh-token
    // cookie the reload's own silent-bootstrap depends on, landing back
    // on a fresh, unauthenticated /auth/login.
    await expect(page).toHaveURL(/\/en\/partner$/);
    await page.goto('/en/partner/staff');
    // Same real desktopOnly/mobileOnly dual rendering as above — the
    // now-accepted member shows in the "Team members" table and card
    // list simultaneously.
    await expect(page.getByText(inviteeEmail).first()).toBeVisible();
  });
});
