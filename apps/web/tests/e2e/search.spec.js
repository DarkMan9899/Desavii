/**
 * Search & Discovery — the Search page in a real browser against the
 * demo-seeded test database, in English, Armenian and Russian, at phone
 * (390), tablet (768), small-desktop (1024) and desktop (1440) widths:
 *
 * - the first results are on the first screen, nothing overflows;
 * - live filtering: a choice applies at once with exactly one request;
 *   typing applies once it pauses; Search / "Show N results" apply only
 *   what is pending and never re-send an unchanged search; a slow
 *   response for a superseded search never replaces the newer results;
 * - category is the filter context: its own quick filters, and a
 *   category change drops the old category's filters;
 * - every visible filter narrows the results end to end — the total
 *   after choosing an option equals that option's own count;
 * - destinations and amenities read in the visitor's language;
 * - a date range applies only once complete; the URL is the state
 *   (reload, Back, copied link); a malformed link settles on its
 *   canonical URL with one search.
 *
 * Filter catalogs come from the running API, so the spec follows the
 * seeded data rather than hardcoding ids or counts.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const LAPTOP = { width: 1024, height: 768 };
const DESKTOP = { width: 1440, height: 900 };
/** Longer than the input pause (400 ms) plus a round trip: time for any stray request to show up. */
const QUIET_MS = 1200;

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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function apiData(request, path) {
  const res = await request.get(`${API_BASE_URL}${path}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).data;
}

async function category(request, locale, slug) {
  const categories = await apiData(
    request,
    `/search/categories?locale=${locale}`,
  );
  return categories.find((candidate) => candidate.slug === slug);
}

async function filterDefinitions(request, categoryId, locale) {
  const { groups } = await apiData(
    request,
    `/search/filters?categoryId=${categoryId}&locale=${locale}`,
  );
  return groups.flatMap((group) =>
    group.definitions.map((definition) => ({
      ...definition,
      group: group.code,
    })),
  );
}

/** The name a filter shows — mirrors `utils/filterVocabulary.js`. */
function definitionLabel(locale, definition) {
  const messages = MESSAGES[locale];
  const searchName =
    messages.search.dynamicFilters.definitions[definition.code];
  if (searchName) return searchName;
  const catalog = messages.partner.listingWizard;
  if (definition.value_source === 'ATTRIBUTE') {
    return catalog.attributes[definition.code];
  }
  return catalog.policies[definition.code];
}

function optionLabel(locale, definition, option) {
  const catalog = MESSAGES[locale].partner.listingWizard;
  switch (definition.value_source) {
    case 'AMENITY':
      return option.label;
    case 'ROOM':
      return catalog.mealPlans[option.code];
    case 'REVIEW':
      return `${new Intl.NumberFormat(locale).format(Number(option.code))}+`;
    default:
      return catalog.options[definition.code][option.code];
  }
}

/** Every `GET /search` listing request the page sends, as decoded URLs. */
function recordSearchRequests(page) {
  const urls = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/\/api\/v1\/search\?/.test(url)) {
      urls.push(decodeURIComponent(url.replace(/\+/g, '%20')));
    }
  });
  return urls;
}

function nextSearch(page) {
  return page.waitForResponse((res) => /\/api\/v1\/search\?/.test(res.url()));
}

/** The total a search response reports. */
async function totalOf(responsePromise) {
  const response = await responsePromise;
  return (await response.json()).meta.total;
}

function showResultsButton(page, locale) {
  const prefix =
    MESSAGES[locale].search.filters.showResults_other.split('{{count}}')[0];
  return page.getByRole('button', { name: new RegExp(`^${prefix}\\d`) });
}

function quickPill(page, locale, label) {
  return page
    .getByRole('group', { name: MESSAGES[locale].search.filters.quick.label })
    .locator('[aria-haspopup="dialog"]')
    .filter({ hasText: label });
}

/** Opens a collapsed panel section; leaves an open one open. */
async function openSection(drawer, title) {
  // `has` is matched inside each <details>, so it starts from the page.
  const section = drawer.locator('details').filter({
    has: drawer.page().locator('summary').getByText(title, { exact: true }),
  });
  if ((await section.getAttribute('open')) === null) {
    await section.locator('summary').click();
  }
  return section;
}

/** An option chip: its name followed by its result count. */
function optionChip(scope, text) {
  return scope.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(text)}\\s*\\d+$`),
  });
}

async function pickCalendarDays(page, nextMonthLabel, dayIndexes, afterEach) {
  const calendar = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('grid') });
  await calendar.getByRole('button', { name: nextMonthLabel }).click();
  const days = calendar.locator('button[role=gridcell]:not([disabled])');
  await dayIndexes.reduce(
    (previous, index, position) =>
      previous
        .then(() => days.nth(index).click())
        .then(() => afterEach?.(position)),
    Promise.resolve(),
  );
}

async function expectResultsTotal(page, total) {
  await expect(page.getByRole('status')).toHaveText(
    new RegExp(`(^|\\D)${total}(\\D|$)`),
  );
}

test.describe('Search & Discovery', () => {
  [
    ['en', DESKTOP],
    ['hy', PHONE],
    ['hy', DESKTOP],
    ['ru', PHONE],
    ['ru', LAPTOP],
  ].forEach(([locale, viewport]) => {
    test(`${locale.toUpperCase()} ${viewport.width}: the first results are on the first screen and nothing overflows`, async ({
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

  test('EN 1440: filters apply live — one request per choice, none for an unchanged Search, category change cleans up', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.en.search.filters;
    const hotels = await category(request, 'en', 'hotels');
    const restaurants = await category(request, 'en', 'restaurants');
    const hotelFilters = await filterDefinitions(request, hotels.id, 'en');
    const restaurantFilters = await filterDefinitions(
      request,
      restaurants.id,
      'en',
    );
    await page.setViewportSize(DESKTOP);
    await page.goto('/en/search');
    await expect(page.getByRole('status')).toHaveText(/\d/);
    const requests = recordSearchRequests(page);
    const form = page.getByRole('search');

    // Category: applies without Search, and brings its own quick filters.
    let searched = nextSearch(page);
    await form.getByRole('combobox', { name: t.categoryLabel }).click();
    await page.getByRole('option', { name: hotels.name, exact: true }).click();
    await searched;
    await expect(page).toHaveURL(new RegExp(`categoryId=${hotels.id}$`));
    expect(requests).toHaveLength(1);
    await Promise.all(
      hotelFilters
        .filter((definition) => !definition.is_advanced)
        .map((definition) =>
          expect(
            quickPill(page, 'en', definitionLabel('en', definition)),
          ).toBeVisible(),
        ),
    );

    // An amenity in the full panel: applies at once, the panel stays open
    // on the live count.
    const amenities = hotelFilters.find((d) => d.value_source === 'AMENITY');
    const amenity = amenities.options.find((option) => option.count > 0);
    await page
      .getByRole('button', { name: t.quick.allFilters })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: t.drawerTitle });
    const amenitySection = await openSection(
      drawer,
      MESSAGES.en.search.dynamicFilters.groups.AMENITIES,
    );
    searched = nextSearch(page);
    await amenitySection.getByText(amenity.label, { exact: true }).click();
    const total = await totalOf(searched);
    expect(total).toBe(amenity.count);
    await expect(page).toHaveURL(new RegExp(`amenityIds=${amenity.value}`));
    await expect(showResultsButton(drawer, 'en')).toHaveText(
      new RegExp(`${total}`),
    );
    expect(requests).toHaveLength(2);

    // "Show N results" and an unchanged Search send nothing more.
    await showResultsButton(drawer, 'en').click();
    await expect(drawer).toBeHidden();
    await form.getByRole('button', { name: t.submit }).click();
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(2);
    await expectResultsTotal(page, total);

    // Restaurants: the hotel amenity goes, restaurant quick filters come.
    searched = nextSearch(page);
    await form.getByRole('combobox', { name: t.categoryLabel }).click();
    await page
      .getByRole('option', { name: restaurants.name, exact: true })
      .click();
    await searched;
    await expect(page).toHaveURL(new RegExp(`categoryId=${restaurants.id}$`));
    await Promise.all(
      restaurantFilters
        .filter((definition) => !definition.is_advanced)
        .map((definition) =>
          expect(
            quickPill(page, 'en', definitionLabel('en', definition)),
          ).toBeVisible(),
        ),
    );
    await expect(
      quickPill(
        page,
        'en',
        MESSAGES.en.partner.listingWizard.attributes.star_rating,
      ),
    ).toHaveCount(0);
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(3);
  });

  test('EN 1440: typing applies once it pauses; Search right after typing sends it once', async ({
    page,
  }) => {
    const t = MESSAGES.en.search.filters;
    await page.setViewportSize(DESKTOP);
    await page.goto('/en/search');
    await expect(page.getByRole('status')).toHaveText(/\d/);
    const requests = recordSearchRequests(page);
    const keyword = page
      .getByRole('search')
      .getByRole('textbox', { name: t.keywordLabel });

    await keyword.pressSequentially('Yerevan', { delay: 40 });
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('keyword=Yerevan');
    await expect(page).toHaveURL(/destination=Yerevan$/);
    await expect(keyword).toBeFocused();

    await keyword.pressSequentially(' hotel', { delay: 20 });
    await keyword.press('Enter');
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain('keyword=Yerevan hotel');
  });

  test('EN 1440: a slow response for a superseded search never replaces the newer results', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.en.search.filters;
    const hotels = await category(request, 'en', 'hotels');
    const tours = await category(request, 'en', 'tours');
    const toursTotal = (
      await (
        await request.get(`${API_BASE_URL}/search?categoryId=${tours.id}`)
      ).json()
    ).meta.total;
    await page.route('**/api/v1/search?*', async (route) => {
      if (route.request().url().includes(`categoryId=${hotels.id}`)) {
        await new Promise((resolve) => {
          setTimeout(resolve, 2500);
        });
      }
      await route.continue().catch(() => undefined);
    });
    await page.setViewportSize(DESKTOP);
    await page.goto('/en/search');
    await expect(page.getByRole('status')).toHaveText(/\d/);
    const form = page.getByRole('search');
    const combobox = form.getByRole('combobox', { name: t.categoryLabel });

    await combobox.click();
    await page.getByRole('option', { name: hotels.name, exact: true }).click();
    await combobox.click();
    await page.getByRole('option', { name: tours.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`categoryId=${tours.id}$`));
    await expectResultsTotal(page, toursTotal);
    await page.waitForTimeout(3000);
    await expectResultsTotal(page, toursTotal);
  });

  [
    ['en', DESKTOP, 'restaurants'],
    ['hy', TABLET, 'tours'],
    ['ru', LAPTOP, 'car-rentals'],
    ['en', DESKTOP, 'hotels'],
  ].forEach(([locale, viewport, slug]) => {
    test(`${locale.toUpperCase()} ${viewport.width} ${slug}: a quick filter narrows the results to exactly its count`, async ({
      page,
      request,
    }) => {
      const current = await category(request, locale, slug);
      const definitions = await filterDefinitions(request, current.id, locale);
      const definition = definitions.find(
        (candidate) =>
          !candidate.is_advanced &&
          ['SINGLE_SELECT', 'MULTI_SELECT'].includes(candidate.input_type) &&
          candidate.options.some((option) => option.count > 0),
      );
      expect(definition).toBeDefined();
      const option = definition.options.find(
        (candidate) => candidate.count > 0,
      );
      const label = definitionLabel(locale, definition);

      await page.setViewportSize(viewport);
      await page.goto(`/${locale}/search?categoryId=${current.id}`);
      await expect(page.getByRole('status')).toHaveText(/\d/);
      await quickPill(page, locale, label).click();
      const popover = page.getByRole('dialog', { name: label });
      const searched = nextSearch(page);
      const optionText = optionLabel(locale, definition, option);
      if (definition.input_type === 'SINGLE_SELECT') {
        await optionChip(popover, optionText).click();
      } else {
        await popover.getByText(optionText, { exact: true }).click();
      }
      expect(await totalOf(searched)).toBe(option.count);
      await expect(page).toHaveURL(new RegExp(`${definition.param}=`));
      await expectResultsTotal(page, option.count);
      await popover
        .getByRole('button', {
          name: MESSAGES[locale].search.filters.quick.done,
        })
        .click();
      await expect(quickPill(page, locale, optionText)).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  });

  test('HY 390: destinations and amenities read in Armenian; the panel filters live and "Show N results" closes it', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.hy.search.filters;
    const hotels = await category(request, 'hy', 'hotels');
    const hyCities = await apiData(
      request,
      `/search/destinations?locale=hy&categoryId=${hotels.id}`,
    );
    const enCities = await apiData(
      request,
      `/search/destinations?locale=en&categoryId=${hotels.id}`,
    );
    const offered = hyCities.filter((city) => city.listing_count > 0);
    const amenities = (await filterDefinitions(request, hotels.id, 'hy')).find(
      (d) => d.value_source === 'AMENITY',
    );
    const amenity = amenities.options.find((option) => option.count > 0);
    expect(offered.length).toBeGreaterThan(0);

    await page.setViewportSize(PHONE);
    await page.goto(`/hy/search?categoryId=${hotels.id}`);
    await expect(page.getByRole('status')).toHaveText(/\d/);
    const requests = recordSearchRequests(page);
    await page
      .getByRole('button', {
        name: new RegExp(`^${t.editSearchSummary.replace('{{summary}}', '')}`),
      })
      .click();
    const drawer = page.getByRole('dialog', { name: t.drawerTitle });

    await drawer.getByRole('combobox', { name: t.destinationLabel }).click();
    const options = page.getByRole('option');
    await Promise.all(
      offered.map((city) =>
        expect(
          options.filter({
            hasText: new RegExp(`^${escapeRegExp(city.name)}`),
          }),
        ).toHaveCount(1),
      ),
    );
    const optionTexts = await options.allTextContents();
    enCities
      .filter((city) => city.listing_count > 0)
      .forEach((city) => {
        const armenian = offered.find((c) => c.slug === city.slug).name;
        if (armenian !== city.name) {
          expect(optionTexts.join('|')).not.toContain(city.name);
        }
      });
    await page.keyboard.press('Escape');

    const amenitySection = await openSection(
      drawer,
      MESSAGES.hy.search.dynamicFilters.groups.AMENITIES,
    );
    const searched = nextSearch(page);
    await amenitySection.getByText(amenity.label, { exact: true }).click();
    const total = await totalOf(searched);
    expect(total).toBe(amenity.count);
    await expect(showResultsButton(drawer, 'hy')).toHaveText(
      new RegExp(`${total}`),
    );
    await showResultsButton(drawer, 'hy').click();
    await expect(drawer).toBeHidden();
    await expect(
      page.getByRole('group', { name: t.activeFilters }),
    ).toContainText(amenity.label);
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(1);
    await expectNoHorizontalOverflow(page);
  });

  test('HY 1440: a stay range applies only once complete; reload, Back and a copied link reopen it', async ({
    page,
    request,
    browser,
  }) => {
    const t = MESSAGES.hy.search.filters;
    const hotels = await category(request, 'hy', 'hotels');
    await page.setViewportSize(DESKTOP);
    await page.goto(`/hy/search?categoryId=${hotels.id}`);
    await expect(page.getByRole('status')).toHaveText(/\d/);
    const requests = recordSearchRequests(page);
    const form = page.getByRole('search');

    await form
      .getByRole('button', { name: new RegExp(t.dates.stay.label) })
      .click();
    await pickCalendarDays(
      page,
      MESSAGES.hy.partner.listingWizard.datePicker.nextMonth,
      [9, 11],
      async (position) => {
        if (position === 0) {
          await page.waitForTimeout(QUIET_MS);
          expect(requests).toEqual([]);
        }
      },
    );
    await expect(page).toHaveURL(
      /dateFrom=\d{4}-\d{2}-\d{2}&dateTo=\d{4}-\d{2}-\d{2}$/,
    );
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatch(/dateFrom=.*dateTo=/);
    const datedUrl = page.url();

    await form.getByRole('combobox', { name: t.party.guests }).click();
    await page.getByRole('option', { name: '2 հյուր', exact: true }).click();
    await expect(page).toHaveURL(/guests=2$/);
    const chips = page.getByRole('group', { name: t.activeFilters });
    await expect(chips).toContainText('2 հյուր');

    const searchUrl = page.url();
    await page.reload();
    await expect(chips).toContainText('2 հյուր');
    const copied = await browser.newPage({ viewport: DESKTOP });
    await copied.goto(searchUrl);
    await expect(
      copied.getByRole('group', { name: t.activeFilters }),
    ).toContainText('2 հյուր');
    await copied.close();

    await page.goBack();
    await expect(page).toHaveURL(datedUrl);
    await expect(chips).not.toContainText('2 հյուր');
  });

  test('RU 390: a tour date applies on pick; a typed price applies after the pause and keeps focus', async ({
    page,
    request,
  }) => {
    const t = MESSAGES.ru.search.filters;
    const tours = await category(request, 'ru', 'tours');
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
    await expect(page).toHaveURL(new RegExp(`categoryId=${tours.id}$`));
    await drawer
      .getByRole('button', { name: new RegExp(t.dates.day.label) })
      .click();
    await pickCalendarDays(
      page,
      MESSAGES.ru.partner.listingWizard.datePicker.nextMonth,
      [4],
    );
    await expect(page).toHaveURL(/dateFrom=(\d{4}-\d{2}-\d{2})&dateTo=\1$/);

    const minPrice = drawer.getByLabel(t.price.minLabel);
    const searched = nextSearch(page);
    await minPrice.pressSequentially('5000');
    await expect(minPrice).toHaveValue('5000');
    await expect(minPrice).toBeFocused();
    await searched;
    await expect(page).toHaveURL(/priceMin=5000$/);
    await expect(minPrice).toBeFocused();

    await showResultsButton(drawer, 'ru').click();
    await expect(drawer).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test('RU 390: an inverted price range is explained and never applied', async ({
    page,
  }) => {
    const t = MESSAGES.ru.search.filters;
    await page.setViewportSize(PHONE);
    await page.goto('/ru/search');
    await page
      .getByRole('button', { name: t.quick.allFilters })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: t.drawerTitle });
    await drawer.getByLabel(t.price.minLabel).fill('9000');
    await drawer.getByLabel(t.price.maxLabel).fill('1000');
    await expect(drawer.getByRole('alert')).toHaveText(t.price.invalidRange);
    await page.waitForTimeout(QUIET_MS);
    await expect(page).toHaveURL(/\/ru\/search$/);
  });

  test('HY: a malformed or stale link settles on its canonical URL with a single search', async ({
    page,
    request,
  }) => {
    const tours = await category(request, 'hy', 'tours');
    const requests = recordSearchRequests(page);
    await page.goto(
      '/hy/search?category=tours&dateFrom=2020-01-01&dateTo=2020-01-03&guests=abc&priceMin=9&priceMax=1&attr_bedrooms_min=2&ratingMin=7&utm_source=x',
    );
    await expect(page).toHaveURL(
      new RegExp(`/hy/search\\?categoryId=${tours.id}$`),
    );
    await expect(page.getByRole('status')).toHaveText(/\d/);
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain(`categoryId=${tours.id}`);
    expect(requests[0]).not.toContain('dateFrom');
    expect(requests[0]).not.toContain('attr_bedrooms');
  });
});
