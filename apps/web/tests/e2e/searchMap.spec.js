/**
 * Map Search, end to end against the demo-seeded test API:
 *
 * - EN 1024/1440: List and Map side by side, the Map sticky; markers are
 *   keyboard buttons that open a preview — never a navigation; Escape
 *   closes it; one map request per search.
 * - A category switch on the Map keeps the view and the committed area,
 *   and the markers follow it.
 * - "Search this area" appears only after the visitor moves the map,
 *   commits the area with one request, and the area survives reload,
 *   Back/Forward and "Clear map area".
 * - HY/RU 390: the Map alone, a marker opens a bottom sheet in the
 *   visitor's language.
 * - Map → listing: "Learn more" carries the dates and party to the
 *   listing page; the Armenian dates read in Armenian in real Chromium.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1024, height: 768 };
const DESKTOP = { width: 1440, height: 900 };
/** Time for any stray request to show up. */
const QUIET_MS = 1200;
const DAY_MS = 24 * 60 * 60 * 1000;

const MESSAGES = Object.fromEntries(
  ['en', 'hy', 'ru'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(
        new URL(`../../public/locales/${locale}/common.json`, import.meta.url),
        'utf8',
      ),
    ),
  ]),
);

async function category(request, locale, slug) {
  const res = await request.get(
    `${API_BASE_URL}/search/categories?locale=${locale}`,
  );
  return (await res.json()).data.find((candidate) => candidate.slug === slug);
}

function recordRequests(page, pattern) {
  const urls = [];
  page.on('request', (req) => {
    if (pattern.test(req.url())) urls.push(req.url());
  });
  return urls;
}
const MAP_REQUEST = /\/api\/v1\/search\/map\?/;
const LIST_REQUEST = /\/api\/v1\/search\?/;

const mapRegion = (page, locale) =>
  page.getByRole('region', { name: MESSAGES[locale].search.map.region });
const markers = (page) => page.locator('.leaflet-marker-icon');

/** A calendar day `days` from now, as the URL writes it. */
const isoDay = (days) =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Activates markers — by keyboard (focus, Enter) on a desktop, by tap on a
 * phone — until a preview opens (a cluster zooms in first); in a group of
 * listings at one point, picks the first. Returns the preview surface.
 */
async function openListingPreview(page, locale, { phone = false } = {}) {
  const t = MESSAGES[locale].search.map.preview;
  const surface = phone
    ? page.getByRole('dialog')
    : page.getByRole('button', { name: t.close }).locator('..');
  await expect(async () => {
    if (!(await surface.count())) {
      const marker = markers(page).first();
      if (phone) {
        await marker.click();
      } else {
        await marker.focus();
        await page.keyboard.press('Enter');
      }
    }
    await expect(surface).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  const groupItem = surface.locator('ul li button').first();
  if (await groupItem.count()) await groupItem.click();
  await expect(surface.getByRole('link', { name: t.learnMore })).toBeVisible();
  return surface;
}

/** Drags the map by the visitor's pointer, from its visible middle. */
async function dragMap(page, locale, dx, dy) {
  const region = mapRegion(page, locale);
  await region.scrollIntoViewIfNeeded();
  const box = await region.boundingBox();
  const visibleBottom = Math.min(
    box.y + box.height,
    page.viewportSize().height,
  );
  const x = box.x + box.width / 2;
  const y = (Math.max(box.y, 0) + visibleBottom) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe('Map Search', () => {
  [DESKTOP, LAPTOP].forEach((viewport) => {
    test(`EN ${viewport.width}: List beside a sticky Map; a marker opens a preview by keyboard, never a page`, async ({
      page,
    }) => {
      const t = MESSAGES.en.search;
      await page.setViewportSize(viewport);
      await page.goto('/en/search');
      await expect(page.getByRole('status').first()).toHaveText(/\d/);
      const mapRequests = recordRequests(page, MAP_REQUEST);

      await page.getByRole('button', { name: t.view.map }).click();
      await expect(page).toHaveURL(/\?view=map$/);
      await expect(
        page.getByRole('button', { name: t.view.map }),
      ).toHaveAttribute('aria-pressed', 'true');
      const region = mapRegion(page, 'en');
      await expect(region).toBeVisible();
      await expect(markers(page).first()).toBeVisible();
      await expect(page.locator('[data-listing-id]').first()).toBeVisible();
      expect(mapRequests).toHaveLength(1);
      await expectNoHorizontalOverflow(page);

      // List left, Map right; the Map stays in view while the List scrolls.
      const listBox = await page
        .locator('[data-listing-id]')
        .first()
        .boundingBox();
      const mapBox = await region.boundingBox();
      expect(listBox.x + listBox.width).toBeLessThanOrEqual(mapBox.x);
      await page.mouse.wheel(0, 1500);
      await expect
        .poll(async () => (await region.boundingBox()).y)
        .toBeLessThan(viewport.height / 4);
      const stuck = await region.boundingBox();
      expect(stuck.y).toBeGreaterThanOrEqual(0);

      // Keyboard: a marker is a named button; Enter activates it.
      const first = markers(page).first();
      await expect(first).toHaveAttribute('role', 'button');
      await expect(first).toHaveAttribute('aria-label', /\S/);
      const url = page.url();
      const preview = await openListingPreview(page, 'en');
      expect(page.url()).toBe(url);
      await expect(preview.getByRole('heading', { level: 3 })).toBeFocused();
      await expect(
        preview.getByRole('link', { name: t.map.preview.learnMore }),
      ).toHaveAttribute('href', /^\/en\/listings\//);

      await page.keyboard.press('Escape');
      await expect(preview).toBeHidden();
      expect(page.url()).toBe(url);
    });
  });

  test('EN 1440: a category switch on the Map keeps the view and the area; the markers follow it', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.en.search;
    const hotels = await category(request, 'en', 'hotels');
    const restaurants = await category(request, 'en', 'restaurants');
    const area = '43.00000,39.00000,47.00000,41.50000';
    await page.setViewportSize(DESKTOP);
    await page.goto(
      `/en/search?categoryId=${hotels.id}&bbox=${encodeURIComponent(area)}&view=map`,
    );
    await expect(markers(page).first()).toBeVisible();
    const mapRequests = recordRequests(page, MAP_REQUEST);

    const searched = page.waitForResponse((res) => MAP_REQUEST.test(res.url()));
    await page
      .getByRole('search')
      .getByRole('combobox', { name: t.filters.categoryLabel })
      .click();
    await page
      .getByRole('option', { name: restaurants.name, exact: true })
      .click();
    const body = await (await searched).json();
    await expect(page).toHaveURL(
      new RegExp(`categoryId=${restaurants.id}.*bbox=.*view=map`),
    );
    expect(mapRequests).toHaveLength(1);
    expect(mapRequests[0]).toContain(`categoryId=${restaurants.id}`);
    expect(mapRequests[0]).toContain('bbox=');
    expect(
      body.data.every((marker) => marker.category_slug === 'restaurants'),
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: t.map.clearArea }),
    ).toBeVisible();
  });

  test('EN 1440: "Search this area" — only after a move, one request, and the area survives reload, Back/Forward and Clear', async ({
    page,
  }) => {
    const t = MESSAGES.en.search;
    await page.setViewportSize(DESKTOP);
    await page.goto('/en/search?view=map');
    await expect(markers(page).first()).toBeVisible();
    const searchArea = page.getByRole('button', { name: t.map.searchArea });
    await expect(searchArea).toBeHidden();
    const mapRequests = recordRequests(page, MAP_REQUEST);
    const listRequests = recordRequests(page, LIST_REQUEST);

    await dragMap(page, 'en', -160, -60);
    await expect(searchArea).toBeVisible();
    await page.waitForTimeout(QUIET_MS);
    expect(mapRequests).toEqual([]);
    expect(listRequests).toEqual([]);

    await searchArea.click();
    await expect(page).toHaveURL(/bbox=[-\d.]+%2C[-\d.]+%2C[-\d.]+%2C[-\d.]+/);
    await expect.poll(() => mapRequests.length).toBe(1);
    await page.waitForTimeout(QUIET_MS);
    expect(mapRequests).toHaveLength(1);
    expect(listRequests).toHaveLength(1);
    expect(mapRequests[0]).toContain('bbox=');
    await expect(searchArea).toBeHidden();
    const chips = page.getByRole('group', { name: t.filters.activeFilters });
    await expect(chips).toContainText(t.map.areaChip);
    const areaUrl = page.url();

    await page.reload();
    await expect(page).toHaveURL(areaUrl);
    const clear = page.getByRole('button', { name: t.map.clearArea });
    await expect(clear).toBeVisible();

    await clear.click();
    await expect(page).toHaveURL(/\?view=map$/);
    await expect(chips.getByText(t.map.areaChip)).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(areaUrl);
    await expect(clear).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\?view=map$/);
    await expect(clear).toBeHidden();
  });

  [
    ['hy', 'Իմանալ ավելին'],
    ['ru', 'Подробнее'],
  ].forEach(([locale, learnMore]) => {
    test(`${locale.toUpperCase()} 390: the Map alone; a marker opens a bottom sheet in ${locale.toUpperCase()}`, async ({
      page,
    }) => {
      const t = MESSAGES[locale].search;
      expect(t.map.preview.learnMore).toBe(learnMore);
      await page.setViewportSize(PHONE);
      await page.goto(`/${locale}/search`);
      await page.getByRole('button', { name: t.view.map }).click();
      await expect(page).toHaveURL(/view=map/);
      const region = mapRegion(page, locale);
      await expect(region).toBeVisible();
      await expect(page.locator('[data-listing-id]').first()).toBeHidden();
      const { width } = await region.boundingBox();
      expect(width).toBeGreaterThan(PHONE.width - 40);
      await expectNoHorizontalOverflow(page);

      const sheet = await openListingPreview(page, locale, { phone: true });
      await expect(sheet).toHaveAttribute('aria-modal', 'true');
      await expect(
        sheet.getByRole('link', { name: learnMore }),
      ).toHaveAttribute('href', new RegExp(`^/${locale}/listings/`));
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(page).toHaveURL(/view=map/);
    });
  });

  test('HY 1440: Map → listing keeps the dates and party; the dates read in Armenian', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.hy.search;
    const hotels = await category(request, 'hy', 'hotels');
    const dateFrom = isoDay(40);
    const dateTo = isoDay(42);
    await page.setViewportSize(DESKTOP);
    await page.goto(
      `/hy/search?categoryId=${hotels.id}&dateFrom=${dateFrom}&dateTo=${dateTo}&guests=2&view=map`,
    );
    await expect(markers(page).first()).toBeVisible();

    // Real Chromium has no Armenian date data of its own: the chip must
    // still read in Armenian (date-fns fallback), never in English.
    const chips = page.getByRole('group', { name: t.filters.activeFilters });
    const datesChip = chips
      .getByRole('button')
      .filter({ hasText: /\d/ })
      .first();
    const datesText = await datesChip.innerText();
    expect(datesText).toMatch(/[Ա-և]/);
    expect(datesText).not.toMatch(
      /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/,
    );

    const preview = await openListingPreview(page, 'hy');
    const learnMore = preview.getByRole('link', {
      name: t.map.preview.learnMore,
    });
    const href = await learnMore.getAttribute('href');
    expect(href).toBe(
      `${href.split('?')[0]}?dateFrom=${dateFrom}&dateTo=${dateTo}&guests=2`,
    );
    const title = await preview.getByRole('heading', { level: 3 }).innerText();

    await learnMore.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/hy/listings/[^?]+\\?dateFrom=${dateFrom}&dateTo=${dateTo}&guests=2$`,
      ),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
  });

  [
    ['hy', /[Ա-և]/, /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/],
    ['ru', /[Ѐ-ӿ]/, /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/],
    ['en', /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/, /[Ѐ-ӿԱ-և]/],
  ].forEach(([locale, expected, foreign]) => {
    test(`${locale.toUpperCase()}: the dates chip reads in ${locale.toUpperCase()} in real Chromium`, async ({
      page,
      request,
    }) => {
      const t = MESSAGES[locale].search;
      const hotels = await category(request, locale, 'hotels');
      await page.setViewportSize(DESKTOP);
      await page.goto(
        `/${locale}/search?categoryId=${hotels.id}&dateFrom=${isoDay(40)}&dateTo=${isoDay(42)}`,
      );
      const chips = page.getByRole('group', { name: t.filters.activeFilters });
      const datesChip = chips
        .getByRole('button')
        .filter({ hasText: /\d/ })
        .first();
      await expect(datesChip).toHaveText(expected);
      await expect(datesChip).not.toHaveText(foreign);
    });
  });
});
