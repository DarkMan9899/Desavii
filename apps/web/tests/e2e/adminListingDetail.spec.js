/**
 * P2.1 (Admin Listing Detail) — end to end against the real backend +
 * demo-seeded database. `useAdminListingDetailQuery` existed with no
 * page consuming it before this slice; these specs prove the new
 * `/:locale/admin/listings/:id` page actually works: reachable from the
 * moderation list, shows real vertical-specific data (not a generic
 * placeholder), enforces RBAC, and the approve/reject moderation
 * workflow still functions from the detail page.
 *
 * Uses the same shared seeded fixture `reviewModeration.spec.js`/
 * `reviewReply.spec.js` reuse (listing 37, "Modern Sevan Tour", a real
 * TOUR with real seeded amenities) for the read-only view/RBAC checks —
 * never mutated here, so it's safe to share. The moderation-action test
 * creates and mutates its own throwaway listing instead, to avoid
 * disturbing that shared fixture's moderation state for other specs.
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const TOUR_LISTING_ID = 37;

async function login(page, { email, password }, expectedUrlPattern) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

/** Creates a fresh, throwaway HOTEL listing via the real API, owned by the seeded vendor's partner. */
async function createThrowawayListing() {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: VENDOR });
  const { access_token: accessToken } = (await loginRes.json()).data;

  // partnerId 1 is the seeded dev vendor's own partner
  // (yerevan-boutique-hospitality) — same fixture every other spec in
  // this suite that logs in as VENDOR relies on.
  const createRes = await ctx.post('listings', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      partnerId: 1,
      listingType: 'HOTEL',
      translations: [
        {
          languageId: 1,
          title: `P2.1 Admin Detail Test Listing ${Date.now()}`,
        },
      ],
    },
  });
  const listing = (await createRes.json()).data;
  await ctx.dispose();
  return listing.id;
}

test.describe('Admin Listing Detail — read-only view', () => {
  test('reachable from the moderation list, shows real company and vertical-specific data', async ({
    page,
  }) => {
    await login(page, ADMIN, /\/en\/admin$/);
    await page.goto('/en/admin/listings');
    // Default filter is "Pending" moderation only — listing 37 is
    // already approved (it has a real published review on it, used
    // elsewhere in this suite), so it's excluded until this is widened.
    // Selecting "Approved" directly, not "All moderation statuses" —
    // `useAdminListFilters` treats an empty-string filter value as
    // "unset" and collapses it straight back to this page's own
    // default ('PENDING'), so "All" can never actually be selected via
    // this control as currently built. That's a pre-existing quirk in
    // the shared filter hook, out of P2.1's scope to change here.
    await page.getByRole('combobox', { name: 'Moderation' }).click();
    await page.getByRole('option', { name: 'Approved' }).click();
    // Wait for this filter change to actually land in the URL/re-render
    // before typing a search term — `useAdminListFilters#updateFilters`
    // recomputes its next URL from the current `filters` object via a
    // closure that's still stale until React re-renders after the first
    // change; firing the second filter update immediately overwrites the
    // first with its now-outdated snapshot (reproduced: the moderation
    // filter silently reverted to "Pending" every time these two actions
    // ran back to back without this wait).
    await expect(
      page.getByRole('combobox', { name: 'Moderation' }),
    ).toContainText('Approved');
    await page.getByLabel('Search listings').fill('Modern Sevan Tour');
    await page.keyboard.press('Enter');

    await page.getByRole('link', { name: 'Modern Sevan Tour' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/en/admin/listings/${TOUR_LISTING_ID}$`),
    );

    // Company/partner identity — resolved via a real second query
    // (`GET /partners/admin/:id`), not fabricated from the listing alone.
    await expect(
      page.getByRole('link', { name: 'Caucasus Trail Tours' }),
    ).toBeVisible();

    // Vertical-specific data: the listing type itself (real backend
    // enum value, resolved to a translated label), distinguishing this
    // Tour from a Hotel/Car Rental/etc. — not a generic placeholder.
    await expect(page.getByText('Type: Tour')).toBeVisible({
      timeout: 10_000,
    });

    // Real media/gallery from the listing's own attached photos.
    await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible();
  });

  test('a CUSTOMER visiting the admin listing detail URL directly sees the 403 page', async ({
    page,
  }) => {
    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/admin/listings/${TOUR_LISTING_ID}`);
    await expect(page.getByText('Access restricted')).toBeVisible();
  });
});

test.describe('Admin Listing Detail — moderation workflow', () => {
  let createdListingId;

  // Unconditional cleanup — this test creates a real listing owned by
  // the shared seeded vendor's partner. Left uncleaned, repeated runs
  // (e.g. while iterating on this file, or in CI reruns) accumulate
  // real listings under that one partner and flood every OTHER spec's
  // "Listing" picker on the Partner Calendar page with them — confirmed:
  // this exact thing broke inventory.spec.js's Flow A/B/C/E/F (the
  // seeded "Ararat Valley Fleet" option became unreachable once enough
  // throwaway listings from earlier iterations of this test piled up
  // ahead of it in the picker). Best-effort, matching this suite's own
  // `reviewReply.spec.js` teardown pattern — a cleanup failure must
  // never mask the real test result.
  test.afterEach(async ({ request }) => {
    if (!createdListingId) return;
    try {
      const loginRes = await request.post(`${API_BASE}auth/login`, {
        data: VENDOR,
      });
      if (!loginRes.ok()) return;
      const { data } = await loginRes.json();
      await request.delete(`${API_BASE}listings/${createdListingId}`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
    } catch {
      // Best-effort teardown only — never fail the run over this.
    } finally {
      createdListingId = undefined;
    }
  });

  test('approve and reject-with-notes both work from the detail page', async ({
    page,
  }) => {
    const listingId = await createThrowawayListing();
    createdListingId = listingId;

    await login(page, ADMIN, /\/en\/admin$/);
    await page.goto(`/en/admin/listings/${listingId}`);
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByLabel('Notes (optional)').fill('Missing required photos.');
    await page
      .getByRole('button', { name: 'Reject', exact: true })
      .last()
      .click();
    await expect(page.getByText('Listing rejected.')).toBeVisible();
    await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
    await expect(page.getByText('Missing required photos.')).toBeVisible();

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page
      .getByRole('button', { name: 'Approve', exact: true })
      .last()
      .click();
    await expect(page.getByText('Listing approved.')).toBeVisible();
    await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  });
});
