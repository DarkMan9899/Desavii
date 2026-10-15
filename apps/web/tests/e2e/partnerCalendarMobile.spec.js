/**
 * Partner Workspace Sprint 5 (Calendar + Availability + Inventory)
 * closeout — real-browser verification of two things the interactive
 * browser-automation tool could not reliably exercise this session:
 *
 * 1. The real write path for `bookable_units.time_slot_start/end` —
 *    `BookableUnitForm`'s new Start/End time fields — persists across a
 *    full reload, against the real API (`registerUnitSchema` already
 *    accepted these fields; only the frontend form was missing them).
 * 2. The mobile (390px) Partner Calendar: Month -> Week -> Day
 *    navigation, a genuine hour-axis timeline for a time-sliced unit,
 *    a plain date-only strip/summary for a date-only unit (never a fake
 *    hour grid), and zero page-level horizontal overflow — mirrors
 *    `partnerWizardMobile.spec.js`'s own real-layout verification
 *    pattern (bounding boxes / `scrollWidth` vs `clientWidth`), not just
 *    "the page loads."
 *
 * The throwaway TOUR listing this file creates is deleted in
 * `afterEach` via the real `DELETE /listings/:id` endpoint — the same
 * proven-safe cleanup `partnerBookableUnits.spec.js` already uses. No
 * bookable_unit-level delete exists (by design — see
 * `BookableUnitForm.jsx`'s own header comment), so a throwaway LISTING
 * is the only way to register-then-fully-remove a real time-sliced unit
 * without leaving permanent QA residue.
 */

import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
// Phase 18's real, seeded, date-only flagship fixture — read-only here
// (never mutated), so no cleanup is needed for it.
const HOTEL_SLUG = 'demo-vendor-boutique-yerevan-hotel';

async function login(page) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(VENDOR.email);
  await page.getByLabel('Password').fill(VENDOR.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

/** Creates a fresh, throwaway TOUR listing (no units) via the real API. */
async function createThrowawayTourListing() {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: VENDOR });
  const { access_token: accessToken } = (await loginRes.json()).data;
  const createRes = await ctx.post('listings', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      partnerId: 1,
      listingType: 'TOUR',
      translations: [
        { languageId: 1, title: `Sprint 5 Calendar E2E ${Date.now()}` },
      ],
    },
  });
  const listing = (await createRes.json()).data;
  await ctx.dispose();
  return { id: listing.id, title: listing.translations[0].title };
}

async function resolveListing(slug) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.get(`search?keyword=${encodeURIComponent(slug)}`);
  const body = await res.json();
  const match = (body.data ?? []).find((listing) => listing.slug === slug);
  await ctx.dispose();
  if (!match) {
    throw new Error(`Fixture listing "${slug}" not found via search.`);
  }
  return { id: match.id, title: match.title };
}

/** The Partner Calendar's listing picker is a custom `role="button"` + `role="option"` combobox, not a native `<select>`. */
async function selectListing(page, title) {
  await page.getByRole('combobox', { name: 'Listing' }).click();
  await page.getByRole('option', { name: title }).click();
}

function hasPageOverflow(page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test.describe('Partner Calendar — Sprint 5 closeout (time-slot persistence + mobile)', () => {
  let createdListingId;

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

  test('registering a time-sliced departure through the real form persists start/end time across a full reload', async ({
    page,
  }) => {
    const listing = await createThrowawayTourListing();
    createdListingId = listing.id;

    await login(page);
    await page.goto(`/en/partner/listings/${listing.id}/rooms`);

    await page.getByRole('button', { name: 'Register unit' }).click();
    await page.getByLabel('Unit type').click();
    await page.getByRole('option', { name: 'Tour departure' }).click();
    await page.getByLabel('Room/unit name').fill('Morning Departure');
    await page.getByLabel('Departure start time').fill('09:00');
    await page.getByLabel('Departure end time').fill('13:00');
    await page.getByLabel('Inventory quantity').fill('12');
    await page.getByRole('button', { name: 'Register unit' }).last().click();

    await expect(page.getByText('Morning Departure')).toBeVisible({
      timeout: 10_000,
    });

    // Full reload — prove this isn't just optimistic client state.
    await page.reload();
    await expect(page.getByText('Morning Departure')).toBeVisible({
      timeout: 10_000,
    });

    // The real proof of persistence: the Calendar's Day view (which reads
    // `time_slot_start`/`time_slot_end` straight from `GET
    // /availability/units`) renders a real hour-axis block at exactly
    // 09:00-13:00 for this unit after a fresh navigation.
    await page.goto('/en/partner/calendar');
    await selectListing(page, listing.title);
    await page.getByRole('tab', { name: 'Day' }).click();
    await expect(page.getByText('06:00')).toBeVisible();
    await expect(page.getByText('Morning Departure')).toBeVisible();
    await expect(page.getByText('09:00–13:00')).toBeVisible();
  });

  test('mobile (390px): a time-sliced unit gets a real hour-axis Week/Day timeline, never squeezed, with zero page overflow', async ({
    page,
  }) => {
    const listing = await createThrowawayTourListing();
    createdListingId = listing.id;

    // Register the departure via the API directly — this test verifies
    // Calendar rendering, not the authoring form (covered above).
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
    const loginRes = await ctx.post('auth/login', { data: VENDOR });
    const { access_token: accessToken } = (await loginRes.json()).data;
    await ctx.post('availability/units', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        listingId: listing.id,
        bookableUnitType: 'TOUR_DEPARTURE',
        unitLabel: 'Morning Departure',
        timeSlotStart: '09:00',
        timeSlotEnd: '13:00',
        capacity: 12,
      },
    });
    await ctx.dispose();

    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/partner/calendar');
    await selectListing(page, listing.title);

    // Month (default) never overflows.
    await expect(page.getByRole('tab', { name: 'Month' })).toBeVisible();
    expect(await hasPageOverflow(page)).toBe(false);

    // Week: real hour axis, the departure block, its own date navigation.
    await page.getByRole('tab', { name: 'Week' }).click();
    await expect(page.getByText('06:00')).toBeVisible();
    await expect(page.getByText('23:00')).toBeVisible();
    expect(await hasPageOverflow(page)).toBe(false);

    // Day: same real timeline, single-column — the brief's own
    // "agenda/day timeline as the primary mobile operational view".
    await page.getByRole('tab', { name: 'Day' }).click();
    await expect(page.getByText('Morning Departure')).toBeVisible();
    await expect(page.getByText('09:00–13:00')).toBeVisible();
    await expect(page.getByText('12 available')).toBeVisible();
    expect(await hasPageOverflow(page)).toBe(false);

    // Date navigation (prev/next day) stays on Day view, no overflow.
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByText('06:00')).toBeVisible();
    expect(await hasPageOverflow(page)).toBe(false);

    // Opening a time slot surfaces the real (pre-existing, unmodified)
    // action panel scoped to this unit/date — never a dead tap target.
    await page.getByText('Morning Departure').click();
    await expect(
      page.getByRole('combobox', {
        name: 'Set status for the selected dates',
      }),
    ).toBeVisible();
  });

  test('mobile (390px): a real date-only unit (Hotel) gets a plain date strip/summary — never a fake hour grid', async ({
    page,
  }) => {
    const hotel = await resolveListing(HOTEL_SLUG);

    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/partner/calendar');
    await selectListing(page, hotel.title);

    await page.getByRole('tab', { name: 'Week' }).click();
    await expect(page.getByText('06:00')).not.toBeVisible();
    expect(await hasPageOverflow(page)).toBe(false);

    await page.getByRole('tab', { name: 'Day' }).click();
    await expect(page.getByText('06:00')).not.toBeVisible();
    expect(await hasPageOverflow(page)).toBe(false);

    // Sanity: this really is the hotel context (rooms, not departures).
    await expect(page.locator('body')).not.toContainText('Departure');
  });
});
