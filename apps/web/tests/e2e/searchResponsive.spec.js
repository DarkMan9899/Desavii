/**
 * Search — responsive geometry, asserted structurally (bounding boxes, not
 * screenshots):
 *
 * - every Search dropdown (the panel's Selects and calendar on phones, the
 *   Sort select, the quick-filter popovers on tablets) opens fully inside
 *   the viewport, never adds a horizontal scroll, and still filters live;
 * - on Tablet+ every control in the search bar has the one field height,
 *   controls sharing a row share their top and bottom edges, and the
 *   Search button matches them — for every category, whose fields differ.
 *
 * The owner-reported regressions this guards: a quick-filter popover that
 * ran ~120px past a 768px screen, and Destination / Category triggers
 * that grew to 66px when a long HY/RU value wrapped.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const FIELD_HEIGHT = 48;
const TOLERANCE = 1;

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

async function categories(request, locale) {
  const res = await request.get(
    `${API_BASE_URL}/search/categories?locale=${locale}`,
  );
  return Object.fromEntries(
    (await res.json()).data.map((category) => [category.slug, category]),
  );
}

function nextSearch(page) {
  return page.waitForResponse((res) => /\/api\/v1\/search\?/.test(res.url()));
}

/** The open Select's panel (the listbox's container). */
function openListPanel(page) {
  return page.locator('[role=listbox]:visible').last().locator('xpath=..');
}

async function expectInsideViewport(page, locator) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  expect(box, 'popup is rendered').not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height + TOLERANCE);
  await expectNoHorizontalOverflow(page);
}

async function openPhonePanel(page, locale) {
  const t = MESSAGES[locale].search.filters;
  await page
    .getByRole('button', {
      name: new RegExp(`^${t.editSearchSummary.replace('{{summary}}', '')}`),
    })
    .click();
  const drawer = page.getByRole('dialog', { name: t.drawerTitle });
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Each search-bar item's control box: Input shell, Select / date trigger, button. */
function barGeometry(page) {
  return page.evaluate(() => {
    const row = document.querySelector('form[role=search]').firstElementChild;
    return [...row.children].map((item) => {
      const control = item.querySelector('[role=combobox], input, button');
      const shell =
        control.tagName === 'INPUT' ? control.parentElement : control;
      const { top, bottom, height } = shell.getBoundingClientRect();
      return { top, bottom, height, text: item.textContent.trim() };
    });
  });
}

async function expectUniformBar(page) {
  const items = await barGeometry(page);
  items.forEach((item) => {
    expect(
      Math.abs(item.height - FIELD_HEIGHT),
      `"${item.text}" is ${item.height}px tall`,
    ).toBeLessThanOrEqual(TOLERANCE);
  });
  // Items on one row (same bottom edge) share their top edge too.
  const rows = items.reduce((byRow, item) => {
    const key = Math.round(item.bottom / 10);
    return { ...byRow, [key]: [...(byRow[key] ?? []), item] };
  }, {});
  Object.values(rows).forEach((row) => {
    const tops = row.map((item) => item.top);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(
      TOLERANCE,
    );
  });
}

test.describe('Search — responsive geometry', () => {
  [
    ['hy', 390],
    ['ru', 390],
  ].forEach(([locale, width]) => {
    test(`${locale.toUpperCase()} ${width}: every panel dropdown opens inside the screen and still filters live`, async ({
      page,
      request,
    }) => {
      const t = MESSAGES[locale].search.filters;
      const bySlug = await categories(request, locale);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${locale}/search?categoryId=${bySlug.hotels.id}`);
      await expect(page.getByRole('status')).toHaveText(/\d/);

      // Sort, on the page itself.
      await page.getByRole('combobox', { name: t.sortLabel }).click();
      await expectInsideViewport(page, openListPanel(page));
      await page.keyboard.press('Escape');

      const drawer = await openPhonePanel(page, locale);

      // Destination: a city with listings, applied at once.
      await drawer.getByRole('combobox', { name: t.destinationLabel }).click();
      await expectInsideViewport(page, openListPanel(page));
      let searched = nextSearch(page);
      await page.getByRole('option').nth(1).click();
      await searched;
      await expect(page).toHaveURL(/cityId=\d+/);

      // Category: the longest names in the catalog, applied at once.
      await drawer.getByRole('combobox', { name: t.categoryLabel }).click();
      await expectInsideViewport(page, openListPanel(page));
      searched = nextSearch(page);
      await page
        .getByRole('option', { name: bySlug['car-rentals'].name, exact: true })
        .click();
      await searched;
      await expect(page).toHaveURL(
        new RegExp(`categoryId=${bySlug['car-rentals'].id}`),
      );

      // The date picker's calendar.
      await drawer
        .getByRole('button', { name: new RegExp(t.dates.rental.label) })
        .click();
      // The calendar is portaled into the panel, so it is found by its own
      // name (the field's label), not as "a dialog with a grid".
      await expectInsideViewport(
        page,
        page.getByRole('dialog', { name: t.dates.rental.label }),
      );
      await page.keyboard.press('Escape');
      await expect(drawer).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  });

  [
    ['hy', 768],
    ['ru', 768],
    ['en', 844],
  ].forEach(([locale, width]) => {
    test(`${locale.toUpperCase()} ${width}: every quick-filter popover opens inside the screen and still filters live`, async ({
      page,
      request,
    }) => {
      const t = MESSAGES[locale].search.filters;
      const bySlug = await categories(request, locale);
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(`/${locale}/search?categoryId=${bySlug.hotels.id}`);
      await expect(page.getByRole('status')).toHaveText(/\d/);
      const pills = page
        .getByRole('group', { name: t.quick.label })
        .locator('[aria-haspopup="dialog"]');
      await expect(pills.first()).toBeVisible();
      const count = await pills.count();

      await [...Array(count).keys()].reduce(
        (previous, index) =>
          previous.then(async () => {
            await pills.nth(index).click();
            const panel = page.getByRole('dialog').last().locator('xpath=..');
            await expectInsideViewport(page, panel);
            await page.keyboard.press('Escape');
          }),
        Promise.resolve(),
      );

      // The rightmost pill's first option still applies live.
      await pills.last().click();
      const dialog = page.getByRole('dialog').last();
      const searched = nextSearch(page);
      await dialog.locator('button[aria-pressed], label').first().click();
      await searched;
      await expectNoHorizontalOverflow(page);
    });
  });

  [
    ['hy', 1024],
    ['hy', 1280],
    ['hy', 1440],
    ['ru', 1440],
    ['en', 1920],
  ].forEach(([locale, width]) => {
    test(`${locale.toUpperCase()} ${width}: every search-bar control has the field height and lines up, for every category`, async ({
      page,
      request,
    }) => {
      const bySlug = await categories(request, locale);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/search?categoryId=${bySlug.hotels.id}`);
      await expect(page.getByRole('status')).toHaveText(/\d/);
      await expectUniformBar(page);

      const form = page.getByRole('search');
      await [
        'car-rentals',
        'restaurants',
        'tours',
        'entertainment-venues',
      ].reduce(
        (previous, slug) =>
          previous.then(async () => {
            const searched = nextSearch(page);
            await form
              .getByRole('combobox', {
                name: MESSAGES[locale].search.filters.categoryLabel,
              })
              .click();
            await page
              .getByRole('option', { name: bySlug[slug].name, exact: true })
              .click();
            await searched;
            await expectUniformBar(page);
            await expectNoHorizontalOverflow(page);
          }),
        Promise.resolve(),
      );
    });
  });
});
