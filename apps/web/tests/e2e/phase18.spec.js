/**
 * Phase 18 (Premium Listing Detail Experience) — E2E coverage for the
 * features this phase actually shipped:
 *
 *   A. Category-specific Listing Detail rendering (Phase 18.7) — a hotel
 *      and a tour render genuinely different section content, not the
 *      same generic layout.
 *   B. Mobile sticky booking bar + drawer (Phase 18.11) — brand new this
 *      session, zero prior E2E coverage.
 *   C. Partner Content editor (Phase 18.10) — Highlights/Itinerary/
 *      Included/FAQ, against a listing with real seeded content.
 *   D. Listing Completeness widget (Phase 18.10) on the wizard Review step.
 *
 * Uses the same `resolveListingId(slug)` pattern
 * `inventoryAccessibility.spec.js` already established for this exact
 * problem: the 6 Phase 18 "flagship" listings
 * (`seeds/demo/seedDemoInventoryScenarios.js` +
 * `seeds/demo/seedDemoListingRichContent.js`) get a fresh auto-increment
 * id on every reseed, so hardcoding an id would break on the next
 * `db:seed:demo` run — resolving by the listing's own stable `slug`
 * through the real `GET /search` endpoint avoids that.
 */

import { test, expect, request as playwrightRequest } from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };

const FLAGSHIP_SLUGS = {
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
      `Fixture listing "${slug}" not found via search — did the Phase 18 demo seed (seedDemoListingRichContent.js) run? status=${res.status()} body=${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return match.id;
}

async function loginAsVendor(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(VENDOR.email);
  await page.getByLabel('Password').fill(VENDOR.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

test.describe('Phase 18 — category-specific Listing Detail rendering', () => {
  test('a hotel listing leads with Amenities/Policies and has no Itinerary section', async ({
    page,
  }) => {
    const hotelId = await resolveListingId(FLAGSHIP_SLUGS.hotel);
    await page.goto(`/en/listings/${hotelId}`);

    await expect(page.locator('h1')).toHaveText('Boutique Yerevan Hotel');
    await expect(page.getByRole('heading', { name: 'Amenities' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { name: 'Policies' })).toBeVisible();
    // A real partner-authored highlight from seedDemoListingRichContent.js
    // renders in the hero — proves this is real backend content, not a
    // placeholder shell.
    await expect(
      page.getByText('Free high-speed WiFi throughout'),
    ).toBeVisible();
    // The itinerary section is category-gated — a hotel has no
    // `itinerary_steps`, so the section (and its own "Itinerary" heading)
    // must not render at all.
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toHaveCount(
      0,
    );
  });

  test('a tour listing renders a real Itinerary section with real step content', async ({
    page,
  }) => {
    const tourId = await resolveListingId(FLAGSHIP_SLUGS.tour);
    await page.goto(`/en/listings/${tourId}`);

    await expect(page.locator('h1')).toHaveText('Dilijan Trail Tour');
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible({
      timeout: 10_000,
    });
    // Real seeded itinerary step titles from
    // seedDemoListingRichContent.js's tour FLAGSHIPS entry — queried as
    // headings since the Timeline primitive also repeats a step's title
    // as a longer highlight/description sentence elsewhere on the page.
    await expect(page.getByText('Meet at the trailhead')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ridge viewpoint' }),
    ).toBeVisible();
    await expect(
      page.getByText("Guided hike through Dilijan's forest trails"),
    ).toBeVisible();
  });
});

test.describe('Phase 18.11 — mobile sticky booking bar and drawer', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('shows a fixed price + CTA bar that opens the full reservation widget in a drawer', async ({
    page,
  }) => {
    const hotelId = await resolveListingId(FLAGSHIP_SLUGS.hotel);
    await page.goto(`/en/listings/${hotelId}`);

    // The sidebar's own copy of the same reservation widget also exists
    // in the DOM (hidden below the `laptop` breakpoint via CSS), so two
    // elements share the "Check availability" accessible name here —
    // `:visible` narrows to the one real entry point at this viewport,
    // the fixed mobile bar's own CTA.
    const mobileCta = page
      .getByRole('button', { name: 'Check availability' })
      .and(page.locator(':visible'));
    await expect(mobileCta).toBeVisible({ timeout: 10_000 });
    // The bar also shows the listing's real price alongside the CTA.
    await expect(page.getByText(/֏|AMD/).first()).toBeVisible();

    await mobileCta.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Check availability' }),
    ).toBeVisible();
    // The full `ListingReservationWidget` renders inside the drawer: unit
    // selector (this hotel has 2 real bookable units — Standard Room and
    // Deluxe Suite), date picker, and its own submit button.
    await expect(dialog.getByRole('combobox', { name: 'Unit' })).toBeVisible();
    await expect(dialog.getByLabel('Dates')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Check availability' }),
    ).toBeVisible();
  });
});

test.describe('Phase 18.11 — desktop sidebar reservation widget', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('at desktop width, the sticky sidebar is the booking entry point, not the mobile bar', async ({
    page,
  }) => {
    const hotelId = await resolveListingId(FLAGSHIP_SLUGS.hotel);
    await page.goto(`/en/listings/${hotelId}`);

    const sidebar = page.getByRole('complementary');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByRole('combobox', { name: 'Unit' })).toBeVisible();
    await expect(
      sidebar.getByRole('button', { name: 'Check availability' }),
    ).toBeVisible();

    // Exactly one "Check availability" control is visible at this
    // viewport — the sidebar's — proving the fixed mobile bar's own copy
    // (present in the DOM, hidden via CSS at this width) is not a second
    // active entry point.
    const visibleCtas = page
      .getByRole('button', { name: 'Check availability' })
      .and(page.locator(':visible'));
    await expect(visibleCtas).toHaveCount(1);
  });
});

test.describe('Phase 18.10 — Partner Content editor', () => {
  test("shows the tour's real seeded highlights/FAQs, accepts a new highlight and FAQ, and advances on Continue", async ({
    page,
  }) => {
    const tourId = await resolveListingId(FLAGSHIP_SLUGS.tour);
    await loginAsVendor(page);
    await page.goto(
      `/en/partner/listings/new?listingId=${tourId}&step=content`,
    );

    await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible({
      timeout: 10_000,
    });

    // Real seeded content from seedDemoListingRichContent.js's tour entry,
    // rendered as live field values in insertion order (the first
    // highlight/FAQ row is this listing's first seeded one).
    await expect(page.getByLabel('Highlight text').first()).toHaveValue(
      "Guided hike through Dilijan's forest trails",
    );
    await expect(page.getByLabel('Question').first()).toHaveValue(
      'How difficult is the hike?',
    );

    const uniqueSuffix = Date.now();
    const newHighlightText = `E2E highlight ${uniqueSuffix}`;
    const newQuestion = `E2E question ${uniqueSuffix}`;
    const newAnswer = `E2E answer ${uniqueSuffix}`;

    await page.getByRole('button', { name: 'Add highlight' }).click();
    const newIconTrigger = page.getByRole('combobox', { name: 'Icon' }).last();
    await newIconTrigger.click();
    await page.getByRole('option', { name: 'Top rated' }).click();
    await page.getByLabel('Highlight text').last().fill(newHighlightText);

    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByLabel('Question').last().fill(newQuestion);
    await page.getByLabel('Answer').last().fill(newAnswer);

    await page.getByRole('button', { name: 'Continue' }).click();

    // No inline validation/mutation error, and the wizard genuinely moves
    // on to the next step — the real proof `handleContinue`'s 4 parallel
    // PATCH mutations all resolved successfully.
    await expect(page).toHaveURL(/step=review/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: 'Review & Publish' }),
    ).toBeVisible();

    // Persistence check: reloading straight into the Content step again
    // shows the new highlight/FAQ came back from the server (appended
    // last, since `addRow` always pushes to the end), not just local
    // component state.
    await page.goto(
      `/en/partner/listings/new?listingId=${tourId}&step=content`,
    );
    await expect(page.getByLabel('Highlight text').last()).toHaveValue(
      newHighlightText,
      { timeout: 10_000 },
    );
    await expect(page.getByLabel('Question').last()).toHaveValue(newQuestion);
    await expect(page.getByLabel('Answer').last()).toHaveValue(newAnswer);
  });
});

test.describe('Phase 18.10 — Listing Completeness widget', () => {
  test('renders a real percent-complete progressbar on the Review step', async ({
    page,
  }) => {
    const hotelId = await resolveListingId(FLAGSHIP_SLUGS.hotel);
    await loginAsVendor(page);
    await page.goto(
      `/en/partner/listings/new?listingId=${hotelId}&step=review`,
    );

    const progressBar = page.getByRole('progressbar', {
      name: 'Listing completeness',
    });
    await expect(progressBar).toBeVisible({ timeout: 10_000 });

    const valueNow = Number(await progressBar.getAttribute('aria-valuenow'));
    expect(Number.isNaN(valueNow)).toBe(false);
    expect(valueNow).toBeGreaterThanOrEqual(0);
    expect(valueNow).toBeLessThanOrEqual(100);
    await expect(page.getByText(`${valueNow}%`)).toBeVisible();
  });
});
