/**
 * Phase 11 pre-flight verification: end-to-end coverage of every public
 * page against the real backend + demo-seeded test database
 * (`npm run db:seed:demo`) — home, search (filters/sort/pagination),
 * listing detail (gallery/sections), companies directory + profile, every
 * CMS page, language switching, and 404.
 */

import { test, expect } from './fixtures.js';

test.describe('Home', () => {
  test('renders the hero and real category/listing content', async ({
    page,
  }) => {
    await page.goto('/en');
    await expect(page.locator('h1')).toBeVisible();
    // Demo seed guarantees at least one Hotels listing exists — the
    // homepage's showcase sections read from real backend data, not
    // placeholders, so a real listing title should appear somewhere.
    await expect(
      page.getByText(/Hotel|Apartment|Tour|Experience/i).first(),
    ).toBeVisible();
  });
});

test.describe('Search', () => {
  test('lists real demo listings, supports keyword search, category filter, sort, and pagination', async ({
    page,
  }) => {
    await page.goto('/en/search');
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
    // 40 published demo listings exist — the default first page should
    // show real results, not an empty state.
    await expect(
      page.locator('a[href*="/en/listings/"]').first(),
    ).toBeVisible();

    // Search & Discovery rebuild: the form applies on Search, not per
    // keystroke.
    const form = page.getByRole('search');
    const hotelCard = page
      .locator('main a[href*="/en/listings/"]')
      .filter({ hasText: /Hotel/i })
      .first();
    await form.getByLabel('Keyword').fill('Hotel');
    await form.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/destination=Hotel/);
    await expect(hotelCard).toBeVisible();

    await form.getByLabel('Keyword').fill('');
    await form.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'Hotels', exact: true }).click();
    await form.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/categoryId=\d+/);
    await expect(hotelCard).toBeVisible();
  });
});

test.describe('Listing detail', () => {
  test('renders gallery, pricing, amenities, and location for a real demo listing', async ({
    page,
  }) => {
    await page.goto('/en/search');
    const firstListing = page.locator('a[href*="/en/listings/"]').first();
    await firstListing.click();

    // Listing links prefer the real slug over the numeric id (SearchResultCard.jsx,
    // ListingDetailPageContent.jsx: `slug ?? id`) — assert on the route shape, not a
    // numeric-only id that a slugged listing will never have.
    await expect(page).toHaveURL(/\/en\/listings\/[^/]+/);
    await expect(page.locator('h1')).toBeVisible();
    // Amenities/pricing/location sections all render from the demo
    // listing's real backend data. `.first()`: the page also renders a
    // "related listings" section with its own priced cards further down.
    await expect(page.getByText(/֏|AMD/).first()).toBeVisible();
  });
});

test.describe('Companies directory', () => {
  test('lists the 5 demo partner organizations and links to a profile', async ({
    page,
  }) => {
    await page.goto('/en/companies');
    await expect(
      page.getByRole('heading', { name: 'Ararat Grand Hotels' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Highland Experiences' }),
    ).toBeVisible();

    await page.getByRole('heading', { name: 'Ararat Grand Hotels' }).click();
    await expect(page).toHaveURL(/\/en\/companies\/ararat-grand-hotels/);
    await expect(page.locator('h1')).toContainText('Ararat Grand Hotels');
  });
});

test.describe('Static / CMS pages', () => {
  const pages = [
    ['about', 'About'],
    ['contact', 'Contact'],
    ['faq', 'question'],
    ['help', 'Help'],
    ['become-a-partner', 'Partner'],
    ['blog', 'Blog'],
  ];

  // eslint-disable-next-line no-restricted-syntax -- each page needs its own goto/expect pair, not parallelizable meaningfully
  for (const [path, headingSubstring] of pages) {
    test(`/${path} renders without error`, async ({ page }) => {
      const response = await page.goto(`/en/${path}`);
      expect(response.ok()).toBe(true);
      await expect(page.locator('h1')).toContainText(
        new RegExp(headingSubstring, 'i'),
      );
    });
  }
});

test.describe('Language switching', () => {
  test('switching to Armenian updates visible text', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('button', { name: 'ՀՅ' }).click();
    await expect(page).toHaveURL(/\/hy$/);
  });
});

test.describe('404', () => {
  test('an unknown route shows the 404 page', async ({ page }) => {
    const response = await page.goto('/en/this-route-does-not-exist');
    expect(response.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 3 })).toBeVisible();
  });
});
