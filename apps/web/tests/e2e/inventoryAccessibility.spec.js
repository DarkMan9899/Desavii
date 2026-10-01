/**
 * Phase 17 (Inventory, Availability & Connectivity) — dedicated
 * accessibility verification, additive to `accessibility.spec.js`'s
 * existing page-level scans (which never touched any Phase 17 surface).
 * Reuses that file's exact `@axe-core/playwright` "serious"/"critical"
 * scoping convention, but composes each scan against the real Phase 17
 * *interaction states* this repo actually ships — an open Quick Block
 * form, an open External Reservation form, an open CSV Import Wizard
 * dialog, a looked-up Admin Inventory breakdown/ledger, a real
 * sold-out/low-availability badge, and a real availability-conflict
 * toast — never just the bare page shell those primitives were already
 * audited in isolation from.
 *
 * Runs against the real backend + demo-seeded database, using the same
 * documented dev accounts and Phase 17 demo listings `inventory.spec.js`
 * uses (`vendor@travelhub.dev` owns `yerevan-boutique-hospitality`'s 6
 * Phase 17 demo listings — see `seeds/demo/seedDemoInventoryScenarios.js`).
 */

import AxeBuilder from '@axe-core/playwright';
import Redis from 'ioredis';
import { test, expect, request as playwrightRequest } from './fixtures.js';

// See accessibility.spec.js's identical `test.use()` for why: every
// packages/ui overlay/transition implements `reduced-motion-safe`, and
// without it a scan mid fade-in can sample a transient, false-positive
// contrast/opacity state instead of the settled, real rendering.
test.use({ reducedMotion: 'reduce' });

// ListingReservationWidget's CTA is category-specific (see
// inventory.spec.js's identical BOOK_CTA_PATTERN) — match any real label,
// not just the GENERIC "Request to book" one.
const BOOK_CTA_PATTERN =
  /Request to book|Check availability|Reserve your spot|Reserve this vehicle/;

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };

const SLUGS = {
  hotel: 'demo-vendor-boutique-yerevan-hotel',
  fleet: 'demo-vendor-ararat-valley-fleet',
  guide: 'demo-vendor-certified-yerevan-city-guide',
};

// Step L6.2H3B: the guide walk's visitor places (`GUIDE_WALK_PLACES` in
// seedDemoInventoryScenarios.js). Selling a date out takes every place.
const GUIDE_WALK_PLACES = 6;

/**
 * Mirrors `accessibility.spec.js`'s established helper, plus one addition:
 * a fixed wait for `EmptyState`'s own 300ms fade-in
 * (`motion.$motion-transition`, `@keyframes empty-state-in`) to finish.
 * Several scans in this file interact with the page (submit a lookup,
 * trigger a toast) immediately before scanning, unlike
 * `accessibility.spec.js`'s page-load-then-scan pattern which gives that
 * animation plenty of incidental time to settle — without this wait, axe
 * can sample mid-fade and report a real-looking but false color-contrast
 * violation (verified: the reported foreground color is exactly
 * `$color-gray-600` blended toward white at the animation's own
 * intermediate opacity, not a genuine steady-state contrast failure).
 */
async function seriousOrCriticalViolations(page, { include, exclude } = {}) {
  await page.waitForTimeout(350);
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  if (exclude) builder = builder.exclude(exclude);
  const results = await builder.analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
}

/**
 * This file logs in repeatedly across many scans (vendor/customer/admin) —
 * same real-rate-limit hazard `inventory.spec.js`'s own header comment
 * documents (the platform-wide `publicRateLimiter`/`sensitiveRateLimiter`
 * tiers), and the same fix: mirrors
 * `apps/api/tests/integration/helpers/resetRateLimits.js`'s Redis-backed
 * counter reset, applied here too since this file's login volume is,
 * again, higher than `globalSetup.js`'s one-time flush can absorb alone.
 */
async function flushRateLimits() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const tiers = ['public', 'authenticated', 'sensitive', 'ai'];
    const keys = (
      await Promise.all([
        ...tiers.map((tier) => redis.keys(`ratelimit:${tier}:*`)),
        redis.keys('session:login_attempts:*'),
      ])
    ).flat();
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Fail-open — see globalSetup.js's identical rationale.
  } finally {
    redis.disconnect();
  }
}

test.beforeEach(async () => {
  await flushRateLimits();
});

async function login(page, { email, password }, expectedUrlPattern) {
  await flushRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

async function resolveListingId(slug) {
  await flushRateLimits();
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.get(`search?keyword=${encodeURIComponent(slug)}`);
  const body = await res.json();
  const match = (body.data ?? []).find((listing) => listing.slug === slug);
  await ctx.dispose();
  if (!match) {
    throw new Error(
      `Fixture listing "${slug}" not found via search — did the Phase 17 demo seed run? status=${res.status()} body=${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return match.id;
}

/** Opens the Partner Calendar, selects a listing/resource, and selects the first clickable day in the currently-shown month. */
async function openPartnerCalendarSelection(page, { listingLabel, unitLabel }) {
  await page.goto('/en/partner/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Listing', exact: true }).click();
  await page.getByRole('option', { name: listingLabel, exact: true }).click();
  if (unitLabel) {
    await page.getByRole('button', { name: unitLabel, exact: true }).click();
  }
  await page.locator('[role="gridcell"]:not([disabled])').first().click();
}

test.describe
  .serial('Phase 17 accessibility — Partner Availability & Calendar', () => {
  test.describe.configure({ retries: 1 });

  test('Partner Calendar page has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await login(page, VENDOR, /\/en\/partner$/);
    // A multi-room-type hotel, so the scan also covers the resource picker
    // (a single-unit listing like the Car Rental fleet has none).
    await openPartnerCalendarSelection(page, {
      listingLabel: 'Boutique Yerevan Hotel',
      unitLabel: 'Standard Room',
    });
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Quick Block workflow (form open, day selected) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await login(page, VENDOR, /\/en\/partner$/);
    // Step L6.2C: the fleet is its listing's only unit — no resource picker.
    await openPartnerCalendarSelection(page, {
      listingLabel: 'Ararat Valley Fleet',
    });
    await page.getByRole('tab', { name: 'Block dates', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Block', exact: true }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('External Reservation workflow (form open, day selected) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await login(page, VENDOR, /\/en\/partner$/);
    await openPartnerCalendarSelection(page, {
      listingLabel: 'Ararat Valley Fleet',
    });
    await page
      .getByRole('tab', { name: 'External reservation', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Record reservation', exact: true }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Connections / Sync Center has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await login(page, VENDOR, /\/en\/partner$/);
    await page.goto('/en/partner/connections');
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

    // Also scan the connection-details panel — a distinct dialog/tab
    // state (Sync history), not just the list view.
    const errorRow = page
      .getByRole('row')
      .filter({ hasText: 'Airbnb iCal Sync' });
    await errorRow
      .getByRole('button', { name: 'Details', exact: true })
      .click();
    await expect(
      page.getByRole('tab', { name: 'Sync history', exact: true }),
    ).toBeVisible();
    const detailViolations = await seriousOrCriticalViolations(page);
    expect(detailViolations, JSON.stringify(detailViolations, null, 2)).toEqual(
      [],
    );
  });

  test('CSV Import Wizard has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await login(page, VENDOR, /\/en\/partner$/);
    await openPartnerCalendarSelection(page, {
      listingLabel: 'Ararat Valley Fleet',
    });
    await page
      .getByRole('button', { name: 'Import from CSV', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Import reservations from CSV' }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

test.describe
  .serial('Phase 17 accessibility — Admin Inventory Oversight', () => {
  test.describe.configure({ retries: 1 });

  test('Admin Inventory Oversight (lookup form, breakdown, ledger) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const hotelListingId = await resolveListingId(SLUGS.hotel);

    await login(page, ADMIN, /\/en\/admin$/);
    await page.goto('/en/admin/inventory');
    await expect(
      page.getByRole('heading', { name: 'Inventory Oversight' }),
    ).toBeVisible();
    const emptyStateViolations = await seriousOrCriticalViolations(page);
    expect(
      emptyStateViolations,
      JSON.stringify(emptyStateViolations, null, 2),
    ).toEqual([]);

    await page.getByLabel('Listing ID').fill(String(hotelListingId));
    await page.getByRole('button', { name: 'Look up' }).click();
    await expect(
      page.getByRole('tab', { name: 'Breakdown', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    const breakdownViolations = await seriousOrCriticalViolations(page);
    expect(
      breakdownViolations,
      JSON.stringify(breakdownViolations, null, 2),
    ).toEqual([]);

    await page.getByRole('tab', { name: 'Ledger', exact: true }).click();
    await expect(
      page
        .getByRole('cell', {
          name: /Manual block|Booking|External reservation|Connector sync/,
        })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    const ledgerViolations = await seriousOrCriticalViolations(page);
    expect(ledgerViolations, JSON.stringify(ledgerViolations, null, 2)).toEqual(
      [],
    );
  });
});

test.describe('Phase 17 accessibility — Customer-facing availability UI', () => {
  test('Listing Detail availability section has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const hotelListingId = await resolveListingId(SLUGS.hotel);
    await page.goto(`/en/listings/${hotelListingId}`);
    await expect(
      page.getByRole('heading', { name: 'Availability' }),
    ).toBeVisible({ timeout: 10_000 });
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Sold-out/low-availability badge states have no serious/critical accessibility violations', async ({
    page,
  }) => {
    // Step L6.2H3B: the guide walk now has 6 places, so it is no longer a
    // capacity-1 resource that is always LOW/SOLD_OUT. This scan makes its
    // own LOW state instead: an outside booking for all but one place on a
    // day inside the customer summary's rolling 30-day window (clear of the
    // seeded days off) leaves "1 seat available" — the summary reports the
    // worst open day. A re-run on the same day simply finds it LOW already
    // (the extra booking is refused for lack of places, which is fine).
    const guideListingId = await resolveListingId(SLUGS.guide);
    const lowDay = (() => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + 15 + (Date.now() % 10));
      return d.toISOString().slice(0, 10);
    })();
    const vendorCtx = await playwrightRequest.newContext({
      baseURL: API_BASE,
    });
    const vendorLogin = await vendorCtx.post('auth/login', { data: VENDOR });
    const vendorToken = (await vendorLogin.json()).data.access_token;
    const guideUnits = await vendorCtx.get(
      `availability/${guideListingId}/units`,
    );
    await vendorCtx.post('availability/external-reservations', {
      headers: { Authorization: `Bearer ${vendorToken}` },
      data: {
        unitId: (await guideUnits.json()).data[0].id,
        dateFrom: lowDay,
        dateTo: lowDay,
        quantity: GUIDE_WALK_PLACES - 1,
        sourceCode: 'WALK_IN',
        guestName: 'Accessibility-scan low-availability trigger',
      },
    });
    await vendorCtx.dispose();

    await page.goto(`/en/listings/${guideListingId}`);
    await expect(
      page.getByRole('heading', { name: 'Availability' }),
    ).toBeVisible({ timeout: 10_000 });
    // The guide's unit type is TOUR_DEPARTURE (a "Small-Group City Walk"
    // bookable unit — see seedDemoInventoryScenarios.js), whose
    // lowByType phrasing is "{{count}} seat(s) available", not the "Only
    // {{count}} X left" wording other unit types (rooms/vehicles/tables)
    // use — a bare /left/ never matches this listing's real LOW-state text.
    await expect(page.getByText(/seats? available|Sold out/i)).toBeVisible({
      timeout: 10_000,
    });
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Availability-conflict toast has no serious/critical accessibility violations', async ({
    page,
  }) => {
    // Reuses flow D's exact mechanism (`inventory.spec.js`): consume the
    // guide's only unit for a specific future date via a real API call
    // while the customer's page is already loaded, then submit anyway to
    // trigger the real conflict toast this scan targets.
    const iso = (() => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + 175 + (Date.now() % 20));
      return d.toISOString().slice(0, 10);
    })();
    const guideListingId = await resolveListingId(SLUGS.guide);

    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${guideListingId}`);
    await expect(
      page.getByRole('button', { name: BOOK_CTA_PATTERN }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Dates').click();

    const target = new Date(`${iso}T00:00:00`);
    const now = new Date();
    const monthsAhead =
      (target.getFullYear() - now.getFullYear()) * 12 +
      (target.getMonth() - now.getMonth());
    for (let i = 0; i < monthsAhead; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential UI navigation
      await page.getByRole('button', { name: 'Next month' }).click();
    }
    const [year, month, day] = iso.split('-').map(Number);
    // Matches DatePicker.jsx/PartnerCalendarEditor.jsx's own dayFormatter
    // (month: 'short', e.g. "Nov 22, 2026"), not 'long'.
    const monthName = new Intl.DateTimeFormat('en', {
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
    const dayCell = page.getByRole('gridcell', {
      name: `${monthName} ${day}, ${year}`,
      exact: true,
    });
    await dayCell.click();
    await dayCell.click(); // same-day range: start === end

    const loginCtx = await playwrightRequest.newContext({ baseURL: API_BASE });
    const loginRes = await loginCtx.post('auth/login', { data: VENDOR });
    const { data } = await loginRes.json();
    const vendorToken = data.access_token;
    const unitsRes = await loginCtx.get(`availability/${guideListingId}/units`);
    const unitsBody = await unitsRes.json();
    const guideUnitId = unitsBody.data[0].id;
    await loginCtx.post('availability/external-reservations', {
      headers: { Authorization: `Bearer ${vendorToken}` },
      data: {
        unitId: guideUnitId,
        dateFrom: iso,
        dateTo: iso,
        quantity: GUIDE_WALK_PLACES,
        sourceCode: 'WALK_IN',
        guestName: 'Accessibility-scan conflict trigger',
      },
    });
    await loginCtx.dispose();

    await page.getByRole('button', { name: BOOK_CTA_PATTERN }).click();
    await expect(
      page.getByText(
        'These dates are no longer available. Please choose different dates.',
      ),
    ).toBeVisible({ timeout: 10_000 });

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
