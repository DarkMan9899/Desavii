/**
 * Phase 11 pre-flight verification: automated accessibility scans
 * (`@axe-core/playwright`) on representative pages — home, search,
 * listing detail, and the partner dashboard — against the real backend +
 * demo-seeded test database. This is new *test tooling*, not a product
 * feature: no automated a11y scanning existed anywhere in this repo
 * before (only lint-time `eslint-plugin-jsx-a11y`), despite Phase 10.8
 * having done a manual responsive/a11y pass.
 *
 * Scoped to the "serious"/"critical" impact levels: axe's "minor"/
 * "moderate" findings include many subjective/heuristic checks not
 * worth failing a CI gate over; serious/critical are the ones that
 * actually block a screen-reader/keyboard user.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, request as playwrightRequest } from './fixtures.js';

// Every `packages/ui` overlay/transition (EmptyState, Drawer, Modal, ...)
// implements `reduced-motion-safe` (tokens/_motion.scss), which collapses
// its animation/transition durations to ~0 under `prefers-reduced-motion:
// reduce`. Without this, a scan that lands mid fade-in samples a
// transient, lighter-than-final foreground color — e.g. EmptyState's
// description text measured at a failing 4.38:1 mid-fade even though its
// settled color (`$color-gray-600` on white) is a real 5.78:1 — a false
// positive from test timing, not the product's actual rendered state.
test.use({ reducedMotion: 'reduce' });

// `reducedMotion: 'reduce'` (above) collapses every `reduced-motion-safe`
// animation/transition to ~0.01ms (tokens/_motion.scss) rather than
// literally 0 — real, if rare, event-loop timing can still land axe's
// synchronous style snapshot inside that ~10-microsecond window mid-fade
// (see this file's own header comment: EmptyState's description text has
// been caught this way before, at a failing ~3.7-4.4:1 contrast even
// though its settled color is a real ~5.8:1). Forcing every animation/
// transition to a literal, unconditional 0s here — for the scan only,
// never for the product's own CSS — closes that residual race instead of
// merely narrowing it, without touching what the assertion checks.
async function settleAnimations(page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }',
  });
}

async function seriousOrCriticalViolations(page, { include, exclude } = {}) {
  await settleAnimations(page);
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  if (exclude) builder = builder.exclude(exclude);
  const results = await builder.analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
}

// Phase 18 — resolves the two flagship listings' real (reseed-dependent)
// ids by their stable `slug`, via a direct `GET /search` call. Mirrors
// `inventoryAccessibility.spec.js`'s own `resolveListingId` helper, which
// solves this exact "the id changes on every `db:seed:demo` run" problem
// for the same `seeds/demo/seedDemoInventoryScenarios.js` fixtures.
const API_BASE = 'http://localhost:4000/api/v1/';
const PHASE_18_FLAGSHIP_SLUGS = {
  hotel: 'demo-vendor-boutique-yerevan-hotel',
  tour: 'demo-vendor-dilijan-trail-tour',
};

async function resolveListingId(slug) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.get(`search?keyword=${encodeURIComponent(slug)}`);
  const body = await res.json();
  const match = (body.data ?? []).find((listing) => listing.slug === slug);
  await ctx.dispose();
  if (!match) {
    throw new Error(
      `Fixture listing "${slug}" not found via search — did the Phase 18 demo seed run? status=${res.status()} body=${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return match.id;
}

test('Home page has no serious/critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/en');
  const violations = await seriousOrCriticalViolations(page);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('Search page has no serious/critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/en/search');
  const violations = await seriousOrCriticalViolations(page);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('Listing detail page has no serious/critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/en/search');
  await page.locator('a[href*="/en/listings/"]').first().click();
  // Listing links prefer the real slug over the numeric id (SearchResultCard.jsx,
  // ListingDetailPageContent.jsx: `slug ?? id`) — assert on the route shape, not a
  // numeric-only id that a slugged listing will never have.
  await expect(page).toHaveURL(/\/en\/listings\/[^/]+/);
  const violations = await seriousOrCriticalViolations(page);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('Partner dashboard has no serious/critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('partner.hotels@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
  const violations = await seriousOrCriticalViolations(page);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

// 2026 Admin Workspace redesign — first automated a11y coverage for any
// Admin page (previously zero, per the pre-redesign audit). Covers the
// grouped/compact `Sidebar` nav and the "Needs your attention" panel.
test('Admin dashboard has no serious/critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('admin@travelhub.dev');
  await page.getByLabel(/^Password/).fill('DevAdmin!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  const violations = await seriousOrCriticalViolations(page);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

// Admin Sprint 2 (Users + Partners + Partner Applications) — same
// concurrent-login race this file's own "Customer account pages" block
// documents (several admin logins racing on the same account's refresh-
// token rotation), so this stays `.serial` for the identical reason.
test.describe.serial('Admin Sprint 2 pages', () => {
  async function loginAsAdmin(page) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  }

  test('Admin Users list has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin User Detail has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // Keyword-filtered, not relying on list order — real E2E-fixture
    // rows from other spec files can otherwise bury this seeded dev
    // account off the first page.
    await page.goto('/en/admin/users?keyword=vendor%40travelhub.dev');
    await page.getByRole('link', { name: 'Dev Vendor' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/users\/\d+$/);
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Partners list has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/partners');
    await expect(page.getByRole('heading', { name: 'Partners' })).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Partner Application detail has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // Keyword-filtered, not relying on list order — real E2E-fixture
    // partners from other spec files (sorted newest-first) otherwise
    // bury the flagship demo partner off the first page entirely.
    await page.goto('/en/admin/partners?keyword=Yerevan+Boutique');
    await page
      .getByRole('link', { name: 'Yerevan Boutique Hospitality' })
      .click();
    await expect(page).toHaveURL(/\/en\/admin\/partners\/\d+$/);
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

test.describe.serial('Admin Sprint 3 pages', () => {
  async function loginAsAdmin(page) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  }

  test('Admin Listings moderation queue has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/listings?moderationStatus=');
    await expect(
      page.getByRole('heading', { name: 'Listing Moderation' }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Listing Detail has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // Keyword-filtered to a real, fully-translated (HY/RU/EN) seeded
    // demo listing — not relying on queue order, same reasoning as the
    // Sprint 2 keyword-filtered detail tests above.
    await page.goto(
      '/en/admin/listings?moderationStatus=&keyword=Ararat+Valley+Fleet',
    );
    await page.getByRole('link', { name: 'Ararat Valley Fleet' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/listings\/\d+$/);
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Listing Detail localized-content locale tabs have no serious/critical accessibility violations after switching locale', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(
      '/en/admin/listings?moderationStatus=&keyword=Ararat+Valley+Fleet',
    );
    await page.getByRole('link', { name: 'Ararat Valley Fleet' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/listings\/\d+$/);
    await page.getByRole('tab', { name: /Русский/ }).click();
    await expect(page.getByRole('tab', { name: /Русский/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

test.describe.serial('Admin Sprint 4 pages', () => {
  async function loginAsAdmin(page) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  }

  test('Admin Bookings list has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/bookings');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Booking Detail has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/bookings');
    await page.getByRole('link', { name: /^BK-/ }).first().click();
    await expect(page).toHaveURL(/\/en\/admin\/bookings\/\d+$/);
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Reviews moderation queue has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/reviews?hasReports=false');
    await expect(
      page.getByRole('heading', { name: 'Review Moderation' }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Review Detail has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/reviews?hasReports=false');
    await page.locator('a[href*="/admin/reviews/"]').first().click();
    await expect(page).toHaveURL(/\/en\/admin\/reviews\/\d+$/);
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// Admin Sprint 5 (Inventory + Sync Operations) — the new admin-wide
// Overview section (real cross-partner connections + conflicts tables,
// status badges) and the per-listing unit-context banner
// (`inventoryAccessibility.spec.js`'s existing "Admin Inventory
// Oversight" block already covers the bare empty state plus the
// Breakdown/Ledger tabs, unchanged by this sprint — this block is
// additive, targeting only the two genuinely new surfaces). Same
// concurrent-login race as the other `Admin Sprint N pages` blocks.
test.describe.serial('Admin Sprint 5 pages', () => {
  async function loginAsAdmin(page) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  }

  test('Admin Inventory overview (connections + conflicts tables, all partners) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/inventory');
    await expect(
      page.getByRole('heading', { name: 'Active connections' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Unresolved conflicts' }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Inventory per-listing lookup with a time-slot unit context banner has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const tourListingId = await resolveListingId(PHASE_18_FLAGSHIP_SLUGS.tour);
    await loginAsAdmin(page);
    await page.goto(`/en/admin/inventory?listingId=${tourListingId}`);
    await expect(page.getByText(/Time-slot unit — departs/)).toBeVisible({
      timeout: 10_000,
    });
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// 2026 SEO/performance audit: these six all need the same signed-in
// customer, and each performed its own fresh UI login — safe in
// isolation, but Playwright's default `fullyParallel` config runs them
// across several workers at once, and several concurrent logins for the
// SAME account raced each other's session/refresh-token state (real,
// reproduced evidence: a different subset failed each full-suite run,
// always "redirected to /auth/login", while a direct API login for the
// same credentials succeeded instantly every time).
//
// Two other fixes were tried and rejected before this one: a shared
// `storageState` file across workers just moves the race to the
// backend's refresh-token rotation (`authenticationService.js`'s "strict
// single-use rotation with reuse detection" — a second context
// refreshing an already-rotated token gets `AUTH_TOKEN_REUSE_DETECTED`
// and is forced back to login); a worker-scoped login fixture only
// reduces concurrent logins from "6 tests" to "N workers" — with more
// than one worker (the default), the race still exists, just less often.
// `.serial` is the fix the file's own pre-existing "Payments
// accessibility" block already uses for this identical problem: it
// forces every test here onto ONE worker, one at a time, so each fresh
// login genuinely never overlaps with another. Nothing about session
// rotation, refresh-token security, or rate limits is touched.
test.describe.serial('Customer account pages (same shared account)', () => {
  test('Notifications page has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/account/notifications');
    await expect(
      page.getByRole('heading', { name: 'Notifications' }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Notification bell dropdown has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByText('View all notifications')).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Messaging page (chat window) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    // The Customer Account dashboard genuinely has two real links named
    // "Messages" — the sidebar nav item and a "quick links" card — both
    // going to the same route; `.first()` picks one deterministically
    // rather than leaving an ambiguous multi-match locator (a Playwright
    // strict-mode violation, not a real accessibility issue).
    await page.getByRole('link', { name: 'Messages' }).first().click();
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    await page
      .getByRole('listitem')
      .filter({ has: page.locator('button') })
      .first()
      .click();
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({
      timeout: 10_000,
    });

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Messaging bell dropdown has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('button', { name: /Messages/ }).click();
    await expect(page.getByText('View all messages')).toBeVisible();
    // Scoped to `header` (trigger + popover) — the dropdown opens over the
    // Account Overview page's unrelated content; this test only cares
    // about the bell trigger and its popover panel.
    const violations = await seriousOrCriticalViolations(page, {
      include: 'header',
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('AI Trip Planner page has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/account/trip-planner');
    await expect(
      page.getByRole('heading', { name: 'AI Trip Planner' }),
    ).toBeVisible();

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('AI Assistant drawer has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('button', { name: 'Ask AI assistant' }).click();
    await expect(
      page.getByRole('heading', { name: 'AI Assistant' }),
    ).toBeVisible();

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// Serial + one retry: each test here logs in (sharing the tight
// `sensitiveRateLimiter` tier — `POST /auth/login` and the
// `/auth/refresh` call `AuthProvider` fires on every full page load —
// with every other spec file hitting the same IP), and reaches every
// sub-page via a client-side `<Link>` click rather than a second
// `page.goto()` wherever possible, to stay well under that ceiling.
// Mirrors `payments.spec.js`'s own header comment on the same fix.
test.describe.serial('Payments accessibility', () => {
  test.describe.configure({ retries: 1 });

  test('My payments page has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'My payments' }),
    ).toBeVisible();

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('A booking detail page with an active payment has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.getByRole('link', { name: 'Bookings', exact: true }).click();
    const firstBookingLink = page
      .locator('a[href*="/account/bookings/"]')
      .first();
    await expect(firstBookingLink).toBeVisible();
    await firstBookingLink.click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Booking BK-/ }),
    ).toBeVisible({ timeout: 10_000 });

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin payments list and payment detail page have no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);

    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
    const listViolations = await seriousOrCriticalViolations(page);
    expect(listViolations, JSON.stringify(listViolations, null, 2)).toEqual([]);

    const firstReferenceLink = page
      .locator('a[href*="/admin/payments/"]')
      .first();
    await expect(firstReferenceLink).toBeVisible({ timeout: 10_000 });
    await firstReferenceLink.click();
    await expect(
      page.getByRole('heading', { name: /^Payment PAY-/ }),
    ).toBeVisible({ timeout: 10_000 });

    const detailViolations = await seriousOrCriticalViolations(page);
    expect(detailViolations, JSON.stringify(detailViolations, null, 2)).toEqual(
      [],
    );
  });
});

// Admin Sprint 6 (Payments disabled-state + Marketplace Config/Settings +
// CMS) — the payments-paused Alert banners are already exercised by the
// "Admin payments list and payment detail page" scan above (this repo
// runs with `PAYMENTS_ENABLED=false`, so that scan's detail page always
// renders the refund-paused notice too). This block covers the two
// surfaces with no prior accessibility coverage at all: Settings (both
// tabs, including the new "not yet wired" disclosure banners) and CMS
// (list, and the per-locale editor with its locale-status badges).
test.describe.serial('Admin Sprint 6 pages', () => {
  async function loginAsAdmin(page) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  }

  test('Admin Settings (System Settings and Feature Flags tabs) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/settings');
    await expect(
      page.getByRole('heading', { name: 'Settings', exact: true }),
    ).toBeVisible();
    const systemViolations = await seriousOrCriticalViolations(page);
    expect(systemViolations, JSON.stringify(systemViolations, null, 2)).toEqual(
      [],
    );

    await page.getByRole('tab', { name: 'Feature Flags' }).click();
    await expect(page.getByText('maintenance_mode')).toBeVisible();
    const flagsViolations = await seriousOrCriticalViolations(page);
    expect(flagsViolations, JSON.stringify(flagsViolations, null, 2)).toEqual(
      [],
    );
  });

  test('Admin CMS list and the per-locale page editor have no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/cms');
    await expect(
      page.getByRole('heading', { name: 'Content Pages' }),
    ).toBeVisible();
    const listViolations = await seriousOrCriticalViolations(page);
    expect(listViolations, JSON.stringify(listViolations, null, 2)).toEqual([]);

    await page.getByRole('link', { name: 'about', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Page: about' }),
    ).toBeVisible();
    const detailViolations = await seriousOrCriticalViolations(page);
    expect(detailViolations, JSON.stringify(detailViolations, null, 2)).toEqual(
      [],
    );
  });
});

// Phase 18 (Premium Listing Detail Experience) — three genuinely new
// surfaces this phase shipped that no scan above ever touches: the
// mobile booking drawer (Phase 18.11, brand new this session), the
// Partner Content editor's add/remove-row + Select + Switch UI (Phase
// 18.10), and the tour category's Itinerary timeline (Phase 18.7),
// which the generic "Listing detail page" scan above never reliably
// exercises since it just clicks whichever listing search ranks first.
test.describe('Phase 18 accessibility', () => {
  // 2026 SEO/performance audit: "Partner Content step" logs in as its own
  // dedicated account (`vendor@travelhub.dev`, used nowhere else in this
  // suite — no per-account race is possible), but was observed to fail
  // once with the same "stuck on /auth/login" symptom while several
  // OTHER tests in OTHER describe blocks were logging in as different
  // accounts at the same wall-clock moment across parallel workers —
  // `RATE_LIMIT_SENSITIVE_PER_MINUTE=10` is shared by IP, not by
  // account, so enough concurrent logins from unrelated tests can still
  // transiently exhaust it between `fixtures.js`'s per-test flushes. One
  // retry absorbs that, same mitigation the file's own pre-existing
  // "Payments accessibility" block already uses for this identical class
  // of flakiness — real rate limiter, unweakened.
  test.describe.configure({ retries: 1 });

  test('Mobile listing detail page with the booking drawer open has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const hotelId = await resolveListingId(PHASE_18_FLAGSHIP_SLUGS.hotel);
    await page.goto(`/en/listings/${hotelId}`);

    // Two elements share the "Check availability" accessible name at this
    // viewport (the sidebar's hidden copy of the reservation widget and
    // the fixed mobile bar's own CTA) — `:visible` narrows to the real,
    // interactive one.
    const mobileCta = page
      .getByRole('button', { name: 'Check availability' })
      .and(page.locator(':visible'));
    await expect(mobileCta).toBeVisible({ timeout: 10_000 });
    await mobileCta.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Unit' })).toBeVisible();
    // The drawer's shared Overlay backdrop fades in over
    // `$motion-transition` (300ms, Overlay.module.scss's own
    // `overlay-backdrop-in` keyframe) — scanning mid-fade briefly drops
    // every descendant's effective contrast (opacity blends text color
    // toward the backdrop), which axe legitimately flags even though it's
    // not a real static-state defect. Waiting past the transition avoids
    // that timing false positive.
    await page.waitForTimeout(350);

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Partner Content step (seeded rows, an open icon Select, and Switch toggles) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const tourId = await resolveListingId(PHASE_18_FLAGSHIP_SLUGS.tour);
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('vendor@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevVendor!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/partner$/);

    await page.goto(
      `/en/partner/listings/new?listingId=${tourId}&step=content`,
    );
    await expect(
      page.getByRole('heading', { name: 'Frequently asked questions' }),
    ).toBeVisible({ timeout: 10_000 });

    // Opens one row's icon Select (listbox + options) so the scan covers
    // its real open state, not just the closed trigger.
    await page.getByRole('combobox', { name: 'Icon' }).first().click();
    await expect(page.getByRole('listbox')).toBeVisible();

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Tour listing detail page (desktop, Itinerary timeline) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const tourId = await resolveListingId(PHASE_18_FLAGSHIP_SLUGS.tour);
    await page.goto(`/en/listings/${tourId}`);
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible({
      timeout: 10_000,
    });
    // This flagship tour listing has no seeded reviews, so
    // ListingReviewsSection renders a real EmptyState ("No reviews
    // yet") — EmptyState.module.scss fades its whole container in via
    // `animation: empty-state-in` (opacity 0 -> 1). Waiting for the
    // Itinerary heading says nothing about whether THIS LATER section
    // has mounted yet, let alone finished fading in: a scan that lands
    // mid-fade blends the title's real, settled `$color-gray-900`
    // toward the white background, reading as a real (not spurious)
    // sub-4.5:1 ratio at that instant — same root cause the Mobile
    // booking-drawer test above already documents for the Overlay
    // backdrop's fade, and empirically confirmed here too (reproduced
    // in ~3/8 repeated runs before this fix, 0/8 after). Waiting past
    // the transition — not excluding the element or weakening the
    // assertion below — avoids the timing false positive.
    await page.waitForTimeout(350);

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  // Marketplace Product Completeness Sprint A (Time-Aware Booking
  // Foundation) — the new date-then-time flow's own real states: the
  // single-date picker, and the real `ChipGroup` time options it reveals
  // once a date with genuine availability is chosen (this flagship tour
  // has two seeded departures — see `seedDemoInventoryScenarios.js`).
  test('Tour reservation widget with the time-slot chip group open has no serious/critical accessibility violations', async ({
    page,
  }) => {
    // The always-enabled "open the booking drawer" trigger lives on
    // `MobileBookingBar`, which is CSS-hidden at `laptop` and up
    // (MobileBookingBar.jsx's own header comment) — at a real viewport
    // width, the desktop sidebar's own inline copy of the SAME CTA label
    // is the only visible match instead, and it's disabled until a date
    // AND time are chosen, which is exactly the state this test needs to
    // get past. Explicit narrow viewport, same as this file's existing
    // "Mobile listing detail page with the booking drawer open" test.
    await page.setViewportSize({ width: 390, height: 844 });
    const tourId = await resolveListingId(PHASE_18_FLAGSHIP_SLUGS.tour);
    await page.goto(`/en/listings/${tourId}`);

    const reserveCta = page
      .getByRole('button', { name: 'Reserve your spot' })
      .and(page.locator(':visible'));
    await expect(reserveCta).toBeVisible({ timeout: 10_000 });
    await reserveCta.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Single-date picker, not the generic Unit selector or a date-range
    // field — the core UX change this sprint makes.
    await expect(page.getByRole('button', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Unit' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Date' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    // Day cells' accessible names are full dates ("Sep 10, 2026" —
    // DatePicker.test.jsx's own convention), not bare numbers. The last
    // enabled one in the visible month avoids both the disabled past-day
    // cells (minDate=today) and any ambiguity around "today" itself.
    await page
      .getByRole('gridcell', { name: /^[A-Z][a-z]+ \d{1,2}, \d{4}$/ })
      .and(page.locator(':not([disabled])'))
      .last()
      .click();

    // A real time chip, sourced from the per-date query — not a fixed
    // placeholder list.
    await expect(
      page.getByRole('button', { name: /^\d{2}:\d{2}–\d{2}:\d{2}$/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /^\d{2}:\d{2}–\d{2}:\d{2}$/ })
      .first()
      .click();

    await page.waitForTimeout(350);

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// Admin Sprint 7 (Audit Logs + AI Moderation/Usage + Messages/
// Notifications) — the first accessibility coverage for any of these
// five surfaces. Same concurrent-login race every other `Admin Sprint N
// pages` block in this file documents, so this stays `.serial` too.
test.describe.serial('Admin Sprint 7 pages', () => {
  async function loginAsAdmin(page) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('admin@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevAdmin!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  }

  test('Admin Audit Logs (list, filters, and an open Details dialog with a real snapshot) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/audit-logs');
    await expect(
      page.getByRole('heading', { name: 'Audit Logs' }),
    ).toBeVisible();
    const listViolations = await seriousOrCriticalViolations(page);
    expect(listViolations, JSON.stringify(listViolations, null, 2)).toEqual([]);

    await page.getByRole('button', { name: 'Details' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const detailViolations = await seriousOrCriticalViolations(page);
    expect(detailViolations, JSON.stringify(detailViolations, null, 2)).toEqual(
      [],
    );
  });

  test('Admin AI Moderation (queue and a real scored result) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/ai/moderation');
    await expect(
      page.getByRole('heading', { name: 'AI Moderation' }),
    ).toBeVisible();
    const listViolations = await seriousOrCriticalViolations(page);
    expect(listViolations, JSON.stringify(listViolations, null, 2)).toEqual([]);

    const scoreButtons = page.getByRole('button', { name: 'Score' });
    if ((await scoreButtons.count()) > 0) {
      await scoreButtons.first().click();
      await expect(
        page.getByRole('heading', { name: 'Listing score' }),
      ).toBeVisible({ timeout: 10_000 });
      const resultViolations = await seriousOrCriticalViolations(page);
      expect(
        resultViolations,
        JSON.stringify(resultViolations, null, 2),
      ).toEqual([]);
    }
  });

  test('Admin AI Usage dashboard has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/ai/usage');
    await expect(page.getByRole('heading', { name: 'AI Usage' })).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('Admin Messages (conversation list and an open thread) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/messages');
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    const listViolations = await seriousOrCriticalViolations(page);
    expect(listViolations, JSON.stringify(listViolations, null, 2)).toEqual([]);

    // Scoped to the conversation `<ul>` specifically — an unscoped `li
    // button`/`li a` locator also matches the Admin sidebar nav's own
    // `<li><a>` items (real bug caught here: it silently clicked
    // "Dashboard" instead, surfacing that page's real recharts SVG
    // a11y violation as a false positive against this test).
    const firstConversation = page
      .getByRole('list')
      .getByRole('button')
      .first();
    if (await firstConversation.isVisible().catch(() => false)) {
      await firstConversation.click();
      await page.waitForTimeout(350);
      const threadViolations = await seriousOrCriticalViolations(page);
      expect(
        threadViolations,
        JSON.stringify(threadViolations, null, 2),
      ).toEqual([]);
    }
  });

  test('Admin Notifications (announcement composer and list) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/notifications');
    await expect(
      page.getByRole('heading', { name: 'Notifications', exact: true }),
    ).toBeVisible();
    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
