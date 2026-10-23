/**
 * Listing Detail rebuild (docs/LISTING_DETAIL_FIELD_GAP.md) — end to end
 * against the real API and the demo-seeded test database.
 *
 * Each test builds its own throwaway listings through the public API (the
 * same calls the Wizard makes), so nothing here depends on, or disturbs,
 * the shared demo fixtures:
 *   - a published tour with guest notes: key facts, "Good to know" and a
 *     section nav made only from sections with content;
 *   - a published villa: the private-stay location is the Search map's
 *     approximate area, never a pin, and the long amenity list opens in a
 *     keyboard-operable dialog;
 *   - an admin edits a draft tour through the shared Wizard and the
 *     public page shows the change once published.
 */

import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const YEREVAN_CITY_ID = 1;
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Every listing a test creates, soft-deleted again after the file's tests,
// so other specs that page through the seeded partner's listings (e.g. the
// Calendar's listing picker) still find the demo listings on page one.
const createdListingIds = [];

async function apiContext() {
  return playwrightRequest.newContext({ baseURL: API_BASE });
}

async function token(ctx, account) {
  const res = await ctx.post('auth/login', { data: account });
  return (await res.json()).data.access_token;
}

async function send(ctx, method, url, bearer, data, contentType) {
  const res = await ctx[method](url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    data,
  });
  expect(res.status(), `${method.toUpperCase()} ${url}`).toBeLessThan(300);
  // A delete answers 204 with no body.
  const body = await res.text();
  return body ? JSON.parse(body).data : null;
}

async function categoryIdBySlug(ctx, slug) {
  const res = await ctx.get('search/categories?locale=en');
  return (await res.json()).data.find((category) => category.slug === slug).id;
}

/**
 * Creates a listing the way the Wizard does, ready to publish; `publish`
 * also publishes it as admin. Returns `{ id, slug }`.
 */
async function createListing({
  categorySlug,
  title,
  unit,
  attributeValues = [],
  policyValues = [],
  amenityIds,
  guestNotes,
  pricing,
  location = { latitude: 40.1772, longitude: 44.5035 },
  publish = true,
}) {
  await resetRateLimits();
  const ctx = await apiContext();
  const vendor = await token(ctx, VENDOR);
  const categoryId = await categoryIdBySlug(ctx, categorySlug);
  const metadata = (
    await (
      await ctx.get(`listings/metadata?categoryId=${categoryId}&locale=en`)
    ).json()
  ).data;

  const { id } = await send(ctx, 'post', 'listings', vendor, {
    partnerId: 1,
    categoryIds: [categoryId],
    translations: [{ languageId: 1, title: `${title} ${Date.now()}` }],
  });
  createdListingIds.push(id);
  await send(ctx, 'patch', `listings/${id}`, vendor, {
    location: { cityId: YEREVAN_CITY_ID, ...location },
    attributeValues,
    policyValues,
    amenityIds:
      amenityIds ??
      metadata.amenity_groups.flatMap((group) =>
        group.amenities.map((amenity) => amenity.value),
      ),
    pricing,
  });
  await send(
    ctx,
    'post',
    `listings/${id}/media`,
    vendor,
    ONE_PX_PNG,
    'image/png',
  );
  if (guestNotes) {
    await send(ctx, 'patch', `listings/${id}/guest-notes`, vendor, {
      languageCode: 'en',
      notes: guestNotes,
    });
  }
  await send(ctx, 'post', 'availability/units', vendor, {
    listingId: id,
    ...unit,
  });

  let { slug } = await send(ctx, 'get', `listings/${id}`, vendor);
  if (publish) {
    const admin = await token(ctx, ADMIN);
    ({ slug } = await send(ctx, 'post', `listings/${id}/publish`, admin, {
      publicationPeriodDays: 30,
    }));
  }
  await ctx.dispose();
  return { id, slug };
}

const TOUR = {
  categorySlug: 'tours',
  title: 'E2E Detail Tour',
  unit: {
    bookableUnitType: 'TOUR_DEPARTURE',
    capacity: 10,
    timeSlotStart: '09:00',
    timeSlotEnd: '17:00',
  },
  attributeValues: [
    { code: 'duration_minutes', value: 480 },
    { code: 'min_group_size', value: 2 },
    { code: 'max_group_size', value: 10 },
    { code: 'difficulty', optionCodes: ['MODERATE'] },
  ],
  policyValues: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
  pricing: { modelCode: 'PER_PERSON', amount: 20000, currencyCode: 'AMD' },
};

async function revealAllSections(page) {
  // Sections fade in on scroll; walk the page so every one is rendered.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      // eslint-disable-next-line no-await-in-loop -- sequential scroll
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
    }
    window.scrollTo(0, 0);
  });
}

async function seriousOrCriticalViolations(page) {
  // Same settling the accessibility suite uses: no section is measured
  // half-way through its reveal transition.
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }',
  });
  await revealAllSections(page);
  const results = await new AxeBuilder({ page })
    .include('main')
    // Third-party map tiles are not this page's markup.
    .exclude('.leaflet-container')
    .analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
}

test.afterAll(async () => {
  await resetRateLimits();
  const ctx = await apiContext();
  const vendor = await token(ctx, VENDOR);
  await Promise.all(
    createdListingIds.map((id) =>
      send(ctx, 'delete', `listings/${id}`, vendor),
    ),
  );
  await ctx.dispose();
});

test.describe('Listing Detail — category experiences', () => {
  test('a tour leads with its key facts, shows "Good to know", and its nav lists only real sections', async ({
    page,
  }) => {
    const { slug } = await createListing({
      ...TOUR,
      guestNotes: [
        { kind: 'BRING', text: 'Comfortable walking shoes' },
        { kind: 'NOT_ALLOWED', text: 'Drones' },
      ],
    });
    await page.goto(`/en/listings/${slug}`);
    await revealAllSections(page);

    const keyFacts = page.getByRole('region', { name: 'Key facts' });
    await expect(keyFacts.getByRole('definition').first()).toHaveText('8h');
    await expect(keyFacts).toContainText('2–10 people');

    const goodToKnow = page.getByRole('heading', {
      level: 2,
      name: 'Good to know',
    });
    await expect(goodToKnow).toBeVisible();
    await expect(page.getByText('Comfortable walking shoes')).toBeVisible();
    await expect(page.getByText('Drones')).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Jump to section' });
    await expect(nav.getByRole('link', { name: 'Good to know' })).toBeVisible();
    // No itinerary and no FAQ were written: no links to empty sections.
    await expect(nav.getByRole('link', { name: 'Itinerary' })).toHaveCount(0);
    await expect(
      nav.getByRole('link', { name: 'Frequently asked questions' }),
    ).toHaveCount(0);

    expect(await seriousOrCriticalViolations(page)).toEqual([]);
  });

  test('a private stay shows the approximate area of the Search map, and the full amenity list in a keyboard dialog', async ({
    page,
  }) => {
    const { id, slug } = await createListing({
      categorySlug: 'villas',
      title: 'E2E Detail Villa',
      unit: { bookableUnitType: 'PROPERTY_UNIT', capacity: 1, maxGuests: 6 },
      attributeValues: [
        { code: 'bedrooms', value: 3 },
        { code: 'max_guests', value: 6 },
      ],
      policyValues: [
        { code: 'cancellation_policy', value: 'MODERATE' },
        { code: 'check_in_time', value: '15:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
      pricing: { modelCode: 'PER_NIGHT', amount: 90000, currencyCode: 'AMD' },
      location: { latitude: 40.1792, longitude: 44.5133 },
    });

    // The public point is the Search map's point, not the stored one.
    const ctx = await apiContext();
    const detail = (await (await ctx.get(`listings/${id}`)).json()).data;
    const villasId = await categoryIdBySlug(ctx, 'villas');
    const markers = (
      await (await ctx.get(`search/map?categoryId=${villasId}`)).json()
    ).data;
    await ctx.dispose();
    const marker = markers.find((candidate) => candidate.id === id);
    expect(detail.location).toMatchObject({
      latitude: marker.latitude,
      longitude: marker.longitude,
      location_precision: 'approximate',
      address_line: null,
    });
    expect(detail.location.latitude).not.toBe(40.1792);

    await page.goto(`/en/listings/${slug}`);
    await revealAllSections(page);
    await expect(page.getByText(/^Approximate location\./)).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);

    const showAll = page.getByRole('button', {
      name: /^Show all \d+ amenities$/,
    });
    await showAll.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Amenities' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { level: 3 }).first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(showAll).toBeFocused();

    expect(await seriousOrCriticalViolations(page)).toEqual([]);
  });
});

test.describe('Listing Detail — admin edit', () => {
  test('an admin corrects a draft in the shared Wizard and the public page shows it once published', async ({
    page,
  }) => {
    const { id } = await createListing({ ...TOUR, publish: false });

    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel(/^Password/).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);

    await page.goto(`/en/admin/listings/${id}`);
    await page.getByRole('link', { name: 'Edit listing' }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/en/admin/listings/${id}/edit\\?listingId=${id}&step=basicInfo`,
      ),
    );

    await page.goto(
      `/en/admin/listings/${id}/edit?listingId=${id}&step=content`,
    );
    await page.getByRole('button', { name: 'Add to “What to bring”' }).click();
    await page
      .getByRole('textbox', { name: 'What to bring' })
      .fill('A refillable water bottle');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/step=review/);

    await resetRateLimits();
    const ctx = await apiContext();
    const admin = await token(ctx, ADMIN);
    const { slug } = await send(ctx, 'post', `listings/${id}/publish`, admin, {
      publicationPeriodDays: 30,
    });
    await ctx.dispose();

    await page.goto(`/en/listings/${slug}`);
    await revealAllSections(page);
    await expect(page.getByText('A refillable water bottle')).toBeVisible();
  });

  test('a published listing offers no edit, and explains why', async ({
    page,
  }) => {
    const { id } = await createListing({ ...TOUR });

    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel(/^Password/).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);

    await page.goto(`/en/admin/listings/${id}`);
    await expect(
      page.getByText(/^Published listings can’t be edited/),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit listing' })).toHaveCount(
      0,
    );

    // A direct visit to the editor is sent back to the detail page.
    await page.goto(`/en/admin/listings/${id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/en/admin/listings/${id}$`));
  });
});
