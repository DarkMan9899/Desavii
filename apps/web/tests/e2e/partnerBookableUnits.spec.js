/**
 * P2.2A (Accommodation Unit / Room-Type Correctness) — end to end against
 * the real backend + demo-seeded database. Before this slice, the Partner
 * Listing Wizard's `AvailabilityStep` permanently hid its "register a
 * unit" form once one unit existed — a real hotel with multiple room
 * types had no UI path to exist at all. These specs prove the fix: a
 * partner can register a first room type, then a second, see both
 * listed with their own capacity/max-guests, and edit an existing one —
 * all through the real UI against the real API, no direct DB writes.
 *
 * Exercises the new standalone `/:locale/partner/listings/:id/rooms`
 * page (reached directly, the same component `AvailabilityStep` embeds)
 * rather than walking the full multi-step wizard — this is deliberately
 * the "post-publish room management" path the P2.2 audit found missing,
 * and it is the fastest reliable way to reach `BookableUnitsManager` in
 * a real browser without scripting ten unrelated wizard steps.
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };

async function login(page, credentials, expectedUrlPattern) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel(/^Password/).fill(credentials.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

/** Creates a fresh, throwaway HOTEL listing (no units) via the real API, owned by the seeded vendor's partner. */
async function createThrowawayListing() {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: VENDOR });
  const { access_token: accessToken } = (await loginRes.json()).data;

  const createRes = await ctx.post('listings', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      partnerId: 1,
      listingType: 'HOTEL',
      translations: [
        { languageId: 1, title: `P2.2A Bookable Units Test ${Date.now()}` },
      ],
    },
  });
  const listing = (await createRes.json()).data;
  await ctx.dispose();
  return listing.id;
}

test.describe('Partner room/unit management — multi-room hotel (P2.2A)', () => {
  let createdListingId;

  // Best-effort, mirrors this suite's own established pattern
  // (`adminListingDetail.spec.js`) — a cleanup failure must never mask
  // the real test result, and leaving throwaway listings behind pollutes
  // other specs sharing the same vendor partner.
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

  test('a partner can register two independent room types, then edit one — the audited blocker, fixed', async ({
    page,
  }) => {
    const listingId = await createThrowawayListing();
    createdListingId = listingId;

    await login(page, VENDOR, /\/en\/partner$/);
    await page.goto(`/en/partner/listings/${listingId}/rooms`);

    // No units yet — one click opens the (always-explicit) register form.
    await page.getByRole('button', { name: 'Register unit' }).click();
    await page.getByLabel('Room/unit name').fill('Standard Room');
    await page.getByLabel('Inventory quantity').fill('5');
    await page.getByLabel('Max guests per room').fill('2');
    await page.getByRole('button', { name: 'Register unit' }).last().click();

    await expect(page.getByText('Standard Room')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('5 available')).toBeVisible();
    await expect(page.getByText('Sleeps 2')).toBeVisible();

    // The exact behavior the audit found broken: this button used to
    // never appear once a unit existed.
    const addAnother = page.getByRole('button', {
      name: 'Add another room type',
    });
    await expect(addAnother).toBeVisible();
    await addAnother.click();

    await page.getByLabel('Room/unit name').fill('Deluxe Suite');
    await page.getByLabel('Inventory quantity').fill('2');
    await page.getByLabel('Max guests per room').fill('4');
    await page.getByRole('button', { name: 'Register unit' }).click();

    // Both room types now coexist, independently.
    await expect(page.getByText('Standard Room')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Deluxe Suite')).toBeVisible();
    await expect(page.getByText('5 available')).toBeVisible();
    await expect(page.getByText('2 available')).toBeVisible();
    await expect(page.getByText('Sleeps 2')).toBeVisible();
    await expect(page.getByText('Sleeps 4')).toBeVisible();

    // Editing one room type never touches the other. `.last()` on a
    // `hasText` filter resolves to the innermost (smallest) matching
    // container — this spec's own card, not the shared list wrapper both
    // room types also render inside (established pattern, see
    // reviewReply.spec.js).
    await page
      .locator('div')
      .filter({ hasText: 'Standard Room' })
      .last()
      .getByRole('button', { name: 'Edit' })
      .click();
    const maxGuestsInput = page.getByLabel('Max guests per room');
    await maxGuestsInput.fill('3');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Sleeps 3')).toBeVisible({ timeout: 10_000 });
    // Deluxe Suite's own occupancy is unaffected by editing Standard Room.
    await expect(page.getByText('Sleeps 4')).toBeVisible();
  });

  test('a single-unit property keeps a simple, one-row experience', async ({
    page,
  }) => {
    const listingId = await createThrowawayListing();
    createdListingId = listingId;

    await login(page, VENDOR, /\/en\/partner$/);
    await page.goto(`/en/partner/listings/${listingId}/rooms`);

    await page.getByRole('button', { name: 'Register unit' }).click();
    await page.getByLabel('Room/unit name').fill('Entire apartment');
    await page.getByLabel('Inventory quantity').fill('1');
    await page.getByLabel('Max guests per room').fill('4');
    await page.getByRole('button', { name: 'Register unit' }).last().click();

    await expect(page.getByText('Entire apartment')).toBeVisible({
      timeout: 10_000,
    });
    // No forced multi-unit complexity — the same "add another" action is
    // offered, never a mandatory second row.
    await expect(
      page.getByRole('button', { name: 'Add another room type' }),
    ).toBeVisible();
  });
});
