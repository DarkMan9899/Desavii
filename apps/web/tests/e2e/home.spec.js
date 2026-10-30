/**
 * Home — the rebuilt discovery page (docs/HOME_REBUILD.md) against the
 * real backend + demo seed:
 *
 * - Search entry: Home builds exactly the `/search` URL the Search page
 *   would — `cityId` (not a free-text city), `categoryId`, the keyword —
 *   inline from tablet up, in a sheet on phones;
 * - category tiles open their category page;
 * - card rows scroll with their arrows and the arrow keys, show which page
 *   is in view, and never loop;
 * - Ask Desavii (Home AI discovery) is honest: with no real model behind
 *   it (this environment) it says so and hands over to Search; with one,
 *   an interpretation is checked before real `/search` results open. The
 *   model step is the only stub — results come from the real Search API;
 * - no horizontal scroll and no broken photo at any width, in every
 *   locale (the 1440 edge clipping of HOME-006 must not return).
 */

import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';
import { YEREVAN_CITY_ID } from './seededCities.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const WIDTHS = [390, 768, 1024, 1440, 1920];
const LOCALES = ['hy', 'en', 'ru'];

async function categoryBySlug(request, slug) {
  const res = await request.get(`${API_BASE_URL}/search/categories?locale=en`);
  const { data } = await res.json();
  return data.find((category) => category.slug === slug);
}

// Every image on the page has been scrolled into view, so the lazy ones
// load; any that finished without pixels is broken.
async function brokenImages(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      // eslint-disable-next-line no-await-in-loop -- each step must paint before the next
      await new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 50));
      });
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  return page.evaluate(() =>
    [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src),
  );
}

test.describe('Home search entry', () => {
  test('from tablet up, Destination + Category open the canonical Search URL', async ({
    page,
    request,
  }) => {
    const hotels = await categoryBySlug(request, 'hotels');
    await page.setViewportSize(DESKTOP);
    await page.goto('/en');

    // Options carry their live listing count, e.g. "Yerevan (21)".
    const form = page.getByRole('search', { name: 'Search Armenia' });
    await form.getByRole('combobox', { name: 'Destination' }).click();
    await page.getByRole('option', { name: /^Yerevan\b/ }).click();
    await form.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: /^Hotels\b/ }).click();
    await form.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(
      `/en/search?categoryId=${hotels.id}&cityId=${YEREVAN_CITY_ID}`,
    );
    await expect(
      page.locator('main a[href*="/en/listings/"]').first(),
    ).toBeVisible();
  });

  test('on a phone, one button opens the same fields in a sheet', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/en');

    await expect(page.getByRole('search')).toHaveCount(0);
    await page.getByRole('button', { name: /Where to in Armenia/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Search Armenia' });
    await sheet.getByLabel('Keyword').fill('Hotel');
    await sheet.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL('/en/search?destination=Hotel');
    await expectNoHorizontalOverflow(page);
  });
});

// Featured listings show every active Home placement. The demo seed has
// exactly one, so two more real promotions are created through the real
// Admin API for this test — and cancelled after it, whatever happens.
test.describe('Home featured placements', () => {
  test('several active placements render as several cards, and the row plays on its own', async ({
    page,
    request,
  }) => {
    test.slow();
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' },
    });
    const headers = {
      Authorization: `Bearer ${(await login.json()).data.access_token}`,
    };
    const catalog = (
      await (
        await request.get(`${API_BASE_URL}/advertising/admin/catalog`, {
          headers,
        })
      ).json()
    ).data;
    const product = catalog
      .find((placement) => placement.code === 'HOMEPAGE_SECTION')
      .products.find((item) => item.duration_days === 7);
    const featured = (
      await (
        await request.get(
          `${API_BASE_URL}/advertising/public/home-featured?locale=en`,
        )
      ).json()
    ).data;
    const listings = (
      await (await request.get(`${API_BASE_URL}/search?locale=en`)).json()
    ).data
      .filter((listing) => !featured.some((item) => item.id === listing.id))
      .slice(0, 2);
    // The server's own calendar day (the placement is live from today).
    const today = new Date().toLocaleDateString('en-CA');

    const created = [];
    try {
      const responses = await Promise.all(
        listings.map((listing) =>
          request.post(`${API_BASE_URL}/advertising/admin`, {
            headers,
            data: {
              listingId: listing.id,
              placementCode: 'HOMEPAGE_SECTION',
              productId: product.id,
              startDate: today,
              markPaidNow: true,
            },
          }),
        ),
      );
      const bodies = await Promise.all(responses.map((res) => res.json()));
      bodies.forEach((body) => {
        if (body.data?.id) created.push(body.data.id);
      });
      expect(created, JSON.stringify(bodies)).toHaveLength(listings.length);

      await page.setViewportSize(DESKTOP);
      await page.goto('/en');
      const row = page
        .getByRole('region', { name: 'Featured listings' })
        .last();
      await row.scrollIntoViewIfNeeded();
      const cards = row.getByRole('group');
      await expect(cards).toHaveCount(featured.length + listings.length);
      const titles = await row
        .getByRole('heading', { level: 3 })
        .allTextContents();
      expect(new Set(titles).size).toBe(titles.length);

      // Two or more pages: controls, counter and autoplay are on.
      const counter = row.locator('[class*="_counter_"]');
      await expect(counter).toHaveText(/^01 \/ 0[2-9]$/);
      await expect(
        row.getByRole('button', { name: 'Pause automatic scrolling' }),
      ).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(counter).toHaveText(/^02 \//, { timeout: 9000 });
    } finally {
      await Promise.all(
        created.map((id) =>
          request.post(`${API_BASE_URL}/advertising/admin/${id}/cancel`, {
            headers,
            data: {},
          }),
        ),
      );
    }
  });
});

test.describe('Home discovery', () => {
  test('a category tile opens its category page', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/en');
    const categories = page.getByRole('region', {
      name: 'Stay, eat and explore',
    });
    await categories.getByRole('link', { name: /Tours/ }).click();
    await expect(page).toHaveURL('/en/categories/tours');
  });

  test('a card row moves with its arrows and stops at the start', async ({
    page,
  }) => {
    // Manual controls alone: reduced motion turns autoplay off, so the row
    // only moves when this test moves it.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(DESKTOP);
    await page.goto('/en');
    const row = page.getByRole('region', { name: 'New on desavii' }).last();
    await row.scrollIntoViewIfNeeded();
    const previous = row.getByRole('button', { name: 'Previous' });
    const next = row.getByRole('button', { name: 'Next' });

    const counter = row.locator('[class*="_counter_"]');
    await expect(previous).toBeDisabled();
    await expect(counter).toHaveText(/^01 \/ \d\d$/);
    await next.click();
    await expect(previous).toBeEnabled();
    await expect(counter).toHaveText(/^02 \//);
    await previous.click();
    await expect(previous).toBeDisabled();

    // The arrow keys move the row while one of its cards has focus.
    await row.getByRole('group').first().getByRole('link').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(/^02 \//);
  });
});

test.describe('Home carousel autoplay', () => {
  test('a row of several real cards plays on its own and pauses for the visitor', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize(DESKTOP);
    await page.mouse.move(1, 1);
    await page.goto('/en');
    const row = page
      .getByRole('region', { name: 'Featured destinations' })
      .last();
    await row.scrollIntoViewIfNeeded();
    const counter = row.locator('[class*="_counter_"]');

    // Plays on its own.
    const start = await counter.textContent();
    await expect(counter).not.toHaveText(start, { timeout: 9000 });

    // Hover pauses.
    await row.hover();
    let held = await counter.textContent();
    await page.waitForTimeout(7500);
    await expect(counter).toHaveText(held);
    await page.mouse.move(1, 1);

    // Keyboard focus on a card pauses.
    await row.getByRole('group').first().getByRole('link').focus();
    await page.waitForTimeout(1200);
    held = await counter.textContent();
    await page.waitForTimeout(7500);
    await expect(counter).toHaveText(held);
    await page.evaluate(() => document.activeElement.blur());

    // The pause button stops it until play is pressed.
    await row
      .getByRole('button', { name: 'Pause automatic scrolling' })
      .click();
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement.blur());
    held = await counter.textContent();
    await page.waitForTimeout(7500);
    await expect(counter).toHaveText(held);
    await row.getByRole('button', { name: 'Play automatic scrolling' }).click();
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement.blur());
    await expect(counter).not.toHaveText(held, { timeout: 9000 });
  });

  test('under reduced motion nothing moves on its own', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(DESKTOP);
    await page.mouse.move(1, 1);
    await page.goto('/en');
    const row = page
      .getByRole('region', { name: 'Featured destinations' })
      .last();
    await row.scrollIntoViewIfNeeded();
    const counter = row.locator('[class*="_counter_"]');
    const start = await counter.textContent();
    await expect(
      row.getByRole('button', { name: 'Pause automatic scrolling' }),
    ).toHaveCount(0);
    await page.waitForTimeout(7500);
    await expect(counter).toHaveText(start);
  });
});

test.describe('Home Ask Desavii', () => {
  test('with no real model behind it, it says so and hands over to Search', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/en');
    await page.getByRole('tab', { name: 'Ask Desavii' }).click();
    await expect(
      page.getByRole('textbox', { name: 'Describe the trip you want' }),
    ).toBeDisabled();
    await expect(page.getByRole('status')).toContainText(
      'Ask Desavii is not available yet',
    );
    await page.getByRole('button', { name: 'Use Search' }).click();
    await expect(
      page.getByRole('search', { name: 'Search Armenia' }),
    ).toBeVisible();
  });

  test('a signed-in request is checked first, then opens real /search results', async ({
    page,
    request,
  }) => {
    const hotels = await categoryBySlug(request, 'hotels');
    // Stub only the model step: availability, and the parse with ids the
    // server would resolve from the real catalog.
    await page.route('**/api/v1/ai/search/availability', (route) =>
      route.fulfill({ json: { success: true, data: { available: true } } }),
    );
    await page.route('**/api/v1/ai/search/parse', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            keyword: '',
            category_id: hotels.id,
            category_name: hotels.name,
            city_id: YEREVAN_CITY_ID,
            city_name: 'Yerevan',
            amenity_ids: [],
          },
        },
      }),
    );
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
    await page.getByLabel(/^Password/).fill('DemoPass!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    await page.setViewportSize(DESKTOP);
    await page.goto('/en');
    await page.getByRole('tab', { name: 'Ask Desavii' }).click();
    await page
      .getByRole('textbox', { name: 'Describe the trip you want' })
      .fill('A quiet hotel in Yerevan for two');
    await page.getByRole('button', { name: 'Ask Desavii' }).click();

    const understood = page.getByRole('region', { name: 'Desavii understood' });
    await expect(understood).toContainText('Yerevan');
    await expect(page).toHaveURL('/en');
    await page.getByRole('button', { name: 'Show results' }).click();

    await expect(page).toHaveURL(
      `/en/search?categoryId=${hotels.id}&cityId=${YEREVAN_CITY_ID}`,
    );
    await expect(
      page.locator('main a[href*="/en/listings/"]').first(),
    ).toBeVisible();
  });
});

test.describe('Home layout', () => {
  LOCALES.forEach((locale) => {
    test(`${locale}: no horizontal scroll and no broken photo, ${WIDTHS.join('/')} px`, async ({
      page,
    }) => {
      test.slow();
      await page.goto(`/${locale}`);
      // eslint-disable-next-line no-restricted-syntax -- widths run in order on one page
      for (const width of WIDTHS) {
        // eslint-disable-next-line no-await-in-loop -- one viewport at a time
        await page.setViewportSize({ width, height: 900 });
        // eslint-disable-next-line no-await-in-loop -- one viewport at a time
        await expectNoHorizontalOverflow(page);
        // eslint-disable-next-line no-await-in-loop -- one viewport at a time
        expect(await brokenImages(page), `${locale} ${width}`).toEqual([]);
      }
    });
  });
});
