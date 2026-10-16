/**
 * Search & Discovery rebuild — the Search page in a real browser, at a
 * phone (390) and a desktop (1440) width, in Armenian and Russian,
 * against the demo-seeded test database:
 *
 * - the first results are on the first screen (the old page opened on
 *   a tall blank band and needed a scroll to reach any result);
 * - the date range completes in the calendar and nothing is searched
 *   until Search / Show results — then exactly one request;
 * - the URL is the state: reload, Back and a copied link all reopen the
 *   same search;
 * - category rules: a tour takes one date and names its party
 *   "travelers";
 * - price is typed in full inside the drawer (focus stays in the field);
 * - a malformed or stale link settles on its canonical URL with one
 *   search.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const MESSAGES = Object.fromEntries(
  ['hy', 'ru'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(
        new URL(`../../public/locales/${locale}/common.json`, import.meta.url),
        'utf8',
      ),
    ),
  ]),
);

async function categoryName(request, locale, slug) {
  const res = await request.get(
    `${API_BASE_URL}/search/categories?locale=${locale}`,
  );
  const { data } = await res.json();
  return data.find((category) => category.slug === slug);
}

/** Every `GET /search` listing request the page sends, as decoded URLs. */
function recordSearchRequests(page) {
  const urls = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/\/api\/v1\/search\?/.test(url)) urls.push(decodeURIComponent(url));
  });
  return urls;
}

async function pickCalendarDays(page, nextMonthLabel, dayIndexes) {
  const calendar = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('grid') });
  await calendar.getByRole('button', { name: nextMonthLabel }).click();
  const days = calendar.locator('button[role=gridcell]:not([disabled])');
  await dayIndexes.reduce(
    (previous, index) => previous.then(() => days.nth(index).click()),
    Promise.resolve(),
  );
}

test.describe('Search & Discovery', () => {
  [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ].forEach(([device, viewport]) => {
    ['hy', 'ru'].forEach((locale) => {
      test(`${locale.toUpperCase()} ${device}: the first results are on the first screen and nothing overflows`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/${locale}/search`);
        const firstCard = page.locator('main a[href*="/listings/"]').first();
        await expect(firstCard).toBeVisible();
        const { y } = await firstCard.boundingBox();
        expect(y).toBeLessThan(viewport.height);
        await expect(page.getByRole('status')).toHaveText(/\d/);
        await expectNoHorizontalOverflow(page);
      });
    });
  });

  test('HY desktop: a stay search applies once, survives reload and Back, and a copied link reopens it', async ({
    page,
    request,
    browser,
  }) => {
    const t = MESSAGES.hy.search.filters;
    const hotels = await categoryName(request, 'hy', 'hotels');
    await page.setViewportSize(DESKTOP);
    await page.goto('/hy/search');
    await expect(page.getByRole('status')).toHaveText(/\d/);
    const requests = recordSearchRequests(page);

    const form = page.getByRole('search');
    await form.getByRole('combobox', { name: t.categoryLabel }).click();
    await page.getByRole('option', { name: hotels.name, exact: true }).click();
    await form
      .getByRole('button', { name: new RegExp(t.dates.stay.label) })
      .click();
    await pickCalendarDays(
      page,
      MESSAGES.hy.partner.listingWizard.datePicker.nextMonth,
      [9, 11],
    );
    await form.getByRole('combobox', { name: t.party.guests }).click();
    await page.getByRole('option', { name: '2 հյուր', exact: true }).click();
    expect(requests).toEqual([]);

    const searched = page.waitForResponse((res) =>
      /\/api\/v1\/search\?/.test(res.url()),
    );
    await form.getByRole('button', { name: t.submit }).click();
    await searched;
    await expect(page).toHaveURL(
      new RegExp(
        `categoryId=${hotels.id}&dateFrom=\\d{4}-\\d{2}-\\d{2}&dateTo=\\d{4}-\\d{2}-\\d{2}&guests=2$`,
      ),
    );
    await expect(page.getByRole('status')).toHaveText(/\d/);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/guests=2/);
    const chips = page.getByRole('group', { name: t.activeFilters });
    await expect(chips).toContainText(hotels.name);
    await expect(chips).toContainText('2 հյուր');

    const searchUrl = page.url();
    await page.reload();
    await expect(chips).toContainText(hotels.name);
    await expect(
      form.getByRole('combobox', { name: t.categoryLabel }),
    ).toHaveText(hotels.name);

    const copied = await browser.newPage({ viewport: DESKTOP });
    await copied.goto(searchUrl);
    await expect(
      copied.getByRole('group', { name: t.activeFilters }),
    ).toContainText('2 հյուր');
    await copied.close();

    await page.goBack();
    await expect(page).toHaveURL(/\/hy\/search$/);
    await expect(chips).toHaveCount(0);
  });

  test('RU phone: the drawer edits the whole search — a tour takes one date, price is typed in full', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.ru.search.filters;
    const tours = await categoryName(request, 'ru', 'tours');
    await page.setViewportSize(PHONE);
    await page.goto('/ru/search');
    await expect(page.getByRole('status')).toHaveText(/\d/);

    await page
      .getByRole('button', {
        name: new RegExp(`^${t.editSearchSummary.replace('{{summary}}', '')}`),
      })
      .click();
    const drawer = page.getByRole('dialog', { name: t.drawerTitle });
    await drawer.getByRole('combobox', { name: t.categoryLabel }).click();
    await page.getByRole('option', { name: tours.name, exact: true }).click();
    await drawer
      .getByRole('button', { name: new RegExp(t.dates.day.label) })
      .click();
    await pickCalendarDays(
      page,
      MESSAGES.ru.partner.listingWizard.datePicker.nextMonth,
      [4],
    );
    await drawer.getByRole('combobox', { name: t.party.travelers }).click();
    await page
      .getByRole('option', { name: '3 путешественника', exact: true })
      .click();

    const minPrice = drawer.getByLabel(t.price.minLabel);
    await minPrice.pressSequentially('5000');
    await expect(minPrice).toHaveValue('5000');
    await expect(minPrice).toBeFocused();
    await drawer.getByLabel(t.price.maxLabel).pressSequentially('90000');

    await drawer.getByRole('button', { name: t.apply }).click();
    await expect(page).toHaveURL(/guests=3&priceMin=5000&priceMax=90000$/);
    const url = new URL(page.url());
    expect(url.searchParams.get('categoryId')).toBe(String(tours.id));
    expect(url.searchParams.get('dateFrom')).toBe(
      url.searchParams.get('dateTo'),
    );
    await expect(
      page.getByRole('group', { name: t.activeFilters }),
    ).toContainText('3 путешественника');
    await expectNoHorizontalOverflow(page);
  });

  test('RU phone: an inverted price range is explained and not applied', async ({
    page,
  }) => {
    const t = MESSAGES.ru.search.filters;
    await page.setViewportSize(PHONE);
    await page.goto('/ru/search');
    await page.getByRole('button', { name: t.filtersButton }).click();
    const drawer = page.getByRole('dialog', { name: t.drawerTitle });
    await drawer.getByLabel(t.price.minLabel).fill('9000');
    await drawer.getByLabel(t.price.maxLabel).fill('1000');
    await drawer.getByRole('button', { name: t.apply }).click();
    await expect(drawer.getByRole('alert')).toHaveText(t.price.invalidRange);
    await expect(page).toHaveURL(/\/ru\/search$/);
  });

  test('HY: a malformed or stale link settles on its canonical URL with a single search', async ({
    page,
    request,
  }) => {
    const tours = await categoryName(request, 'hy', 'tours');
    const requests = recordSearchRequests(page);
    await page.goto(
      '/hy/search?category=tours&dateFrom=2020-01-01&dateTo=2020-01-03&guests=abc&priceMin=9&priceMax=1&utm_source=x',
    );
    await expect(page).toHaveURL(
      new RegExp(`/hy/search\\?categoryId=${tours.id}$`),
    );
    await expect(page.getByRole('status')).toHaveText(/\d/);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain(`categoryId=${tours.id}`);
    expect(requests[0]).not.toContain('dateFrom');
  });
});
