/**
 * Sprint C-1 (Accommodation Room-Level Product Data) — dedicated
 * accessibility verification for the new HOTEL_ROOM authoring surface on
 * `/:locale/partner/listings/:id/rooms`. `inventoryAccessibility.spec.js`
 * (Phase 17) never touches this page or `BookableUnitForm`'s room-only
 * sections at all — its scans stop at Calendar/Connections/Admin
 * Inventory/customer availability — so this file exists to cover the
 * genuinely new controls Sprint C-1 added: room size/bathroom/view/
 * smoking selects, the room description locale tabs, the room amenity
 * checklist, bed configuration rows, and the room photo gallery.
 *
 * Mirrors `inventoryAccessibility.spec.js`'s exact
 * `@axe-core/playwright` "serious"/"critical" scoping convention and its
 * `reducedMotion: 'reduce'` rationale, and `partnerBookableUnits.spec.js`'s
 * exact throwaway-listing create/cleanup pattern (P2.2A) — extended here
 * to also request the "Hotels" category, since the room amenity picker
 * reuses the listing category's own amenity catalog
 * (`GET /listings/metadata?categoryId=`) and a categoryless listing would
 * scan an empty, less meaningful amenities section.
 */

import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  resetRateLimits,
  request as playwrightRequest,
} from './fixtures.js';

test.use({ reducedMotion: 'reduce' });

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };

async function seriousOrCriticalViolations(page) {
  await page.waitForTimeout(350);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
}

async function login(page, credentials, expectedUrlPattern) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel(/^Password/).fill(credentials.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

async function resolveHotelsCategoryId() {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.get('search/categories');
  const body = await res.json();
  const match = (body.data ?? []).find(
    (category) => category.slug === 'hotels',
  );
  await ctx.dispose();
  if (!match) {
    throw new Error(
      `"hotels" category not found via search/categories — seed 003_taxonomy_and_products.js may not have run. status=${res.status()} body=${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return match.id;
}

/** Creates a fresh, throwaway HOTEL listing (no units) in the Hotels category, owned by the seeded vendor's partner. */
async function createThrowawayHotelListing(categoryId) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await ctx.post('auth/login', { data: VENDOR });
  const { access_token: accessToken } = (await loginRes.json()).data;

  const createRes = await ctx.post('listings', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      partnerId: 1,
      listingType: 'HOTEL',
      categoryIds: [categoryId],
      translations: [
        { languageId: 1, title: `Sprint C-1 A11y Room Test ${Date.now()}` },
      ],
    },
  });
  const listing = (await createRes.json()).data;
  await ctx.dispose();
  return listing.id;
}

test.describe('Partner room authoring accessibility (Sprint C-1)', () => {
  let createdListingId;

  // Best-effort cleanup, mirrors `partnerBookableUnits.spec.js`'s own
  // established pattern — never masks the real test result.
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

  test('a populated HOTEL_ROOM authoring form has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const hotelsCategoryId = await resolveHotelsCategoryId();
    const listingId = await createThrowawayHotelListing(hotelsCategoryId);
    createdListingId = listingId;

    await login(page, VENDOR, /\/en\/partner$/);
    await page.goto(`/en/partner/listings/${listingId}/rooms`);

    // Register a HOTEL_ROOM unit (the default type) with room-specific
    // fields filled — a real Partner would leave the form in this state,
    // not the bare-default one, and axe should scan the actual shape of
    // the ROOM BASICS section, not just empty inputs.
    await page.getByRole('button', { name: 'Register unit' }).click();
    await page.getByLabel('Room/unit name').fill('Accessibility Suite');
    await page.getByLabel('Inventory quantity').fill('3');
    await page.getByLabel('Max guests per room').fill('2');
    await page.getByLabel('Room size (m²)').fill('22');
    await page.getByRole('button', { name: 'Register unit' }).last().click();
    await expect(page.getByText('Accessibility Suite')).toBeVisible({
      timeout: 10_000,
    });

    // Re-open the just-created unit for editing — RoomDescriptionEditor/
    // RoomAmenitiesEditor/RoomMediaGallery only render once `unitId`
    // exists, i.e. while editing, never while creating.
    await page
      .locator('div')
      .filter({ hasText: 'Accessibility Suite' })
      .last()
      .getByRole('button', { name: 'Edit' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Room description' }),
    ).toBeVisible();

    // Populate SLEEPING (bed configuration) and ROOM FEATURES so the
    // scan covers real, non-empty custom Select controls.
    await page.getByRole('button', { name: 'Add bed' }).click();
    await page.getByRole('combobox', { name: 'Bathroom' }).click();
    await page.getByRole('option', { name: 'Private bathroom' }).click();
    await page.getByRole('combobox', { name: 'View' }).click();
    await page.getByRole('option', { name: 'Garden view' }).click();
    await page.getByRole('combobox', { name: 'Smoking policy' }).click();
    await page.getByRole('option', { name: 'Non-smoking' }).click();

    // Room description — English tab, then save, exercising the
    // locale-tab/tabpanel semantics themselves.
    await page.getByRole('tab', { name: /^English/ }).click();
    await page
      .getByRole('tabpanel')
      .getByLabel('Description')
      .fill('A bright, quiet suite for the accessibility scan.');
    const saveDescriptionButton = page.getByRole('button', {
      name: /^Save English translation$/,
    });
    await saveDescriptionButton.click();
    // No success toast on this mutation (see RoomDescriptionEditor.jsx) —
    // wait for the button's own `loading` state to clear instead.
    await expect(saveDescriptionButton).toBeEnabled({ timeout: 10_000 });

    // Room amenities — check one, save. The checkbox's visual box is a
    // styled sibling `<span>` that intercepts pointer events on the input
    // itself, so click the label text (what a real user clicks) instead.
    await page.getByText('WiFi', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'WiFi' })).toBeChecked();
    await page.getByRole('button', { name: 'Save amenities' }).click();

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

    // Explicit keyboard/focus semantics check: the locale tablist must be
    // reachable and operable via keyboard alone (axe's own ruleset does
    // not execute real key presses), and the active tab must expose
    // `aria-selected` for assistive tech.
    const armenianTab = page.getByRole('tab', { name: /^Հայերեն/ });
    await armenianTab.focus();
    await expect(armenianTab).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(armenianTab).toHaveAttribute('aria-selected', 'true');
  });
});
