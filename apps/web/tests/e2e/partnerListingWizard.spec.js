/**
 * Partner Listing Wizard rebuild — end to end against the real backend +
 * demo-seeded database (docs/PARTNER_LISTING_WIZARD_FIELD_GAP.md).
 *
 * For every one of the nine categories a Partner creates a real draft
 * through the UI: Category -> Basics -> Location (city, street address,
 * pin) -> Details, then proves
 * - the Details step offers that category's own facts and none of
 *   another category's (category-specific taxonomy, field-gap §5),
 * - the city and address were saved by the API (read back as the owner),
 * - a reload resumes the same step with the same values.
 *
 * Plus the cross-cutting behaviour: a conditional detail appearing under
 * its controlling answer, the city being required, legacy Pricing /
 * Availability URLs landing on the merged Booking & pricing step, and the
 * Location step in HY/RU and at phone width.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, request as playwrightRequest } from './fixtures.js';

const API_BASE = 'http://localhost:4000/api/v1/';
const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const PHONE = { width: 390, height: 844 };
const GARNI = 'Garni';
const ADDRESS = '12 Charents St';
const COORDINATES = { latitude: '40.1194', longitude: '44.73' };

// category name -> Details labels it must offer, and labels that belong
// to another category and must not appear.
const CATEGORIES = [
  {
    name: 'Hotels',
    offers: ['Star rating', 'Languages spoken by staff'],
    never: ['Type of place', 'Body type', 'Cuisine'],
  },
  {
    name: 'Apartments',
    offers: ['Type of place', 'Check-in method', 'Bedrooms'],
    never: ['Star rating', 'Tour format'],
  },
  {
    name: 'Villas',
    offers: ['Type of place', 'Check-in method', 'Bedrooms'],
    never: ['Star rating', 'Dining style'],
  },
  {
    name: 'Guest Houses',
    offers: ['Type of place', 'Languages spoken by staff'],
    never: ['Body type', 'Type of venue'],
  },
  {
    name: 'Restaurants',
    offers: ['Cuisine', 'Dining style', 'Seating capacity', 'Dress code'],
    never: ['Bedrooms', 'Tour format'],
  },
  {
    name: 'Tours',
    offers: ['Tour format', 'Meeting point', 'Minimum age'],
    never: ['Bedrooms', 'Cuisine'],
  },
  {
    name: 'Car Rentals',
    offers: ['Make', 'Body type', 'Mileage policy'],
    never: ['Bedrooms', 'Star rating'],
  },
  {
    name: 'Attractions',
    offers: ['Type of attraction', 'Visit format', 'Indoor or outdoor'],
    never: ['Type of venue', 'Bedrooms'],
  },
  {
    name: 'Entertainment Venues',
    offers: ['Type of venue', 'Indoor or outdoor'],
    never: ['Type of attraction', 'Body type'],
  },
];

/** Serious/critical axe findings, scanned with animations settled. */
async function seriousOrCriticalViolations(page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
  });
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
}

async function login(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(VENDOR.email);
  await page.getByLabel(/^Password/).fill(VENDOR.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

async function ownerListing(listingId) {
  const auth = await playwrightRequest.newContext({ baseURL: API_BASE });
  const token = (await (await auth.post('auth/login', { data: VENDOR })).json())
    .data.access_token;
  await auth.dispose();
  const ctx = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const listing = (await (await ctx.get(`listings/${listingId}`)).json()).data;
  await ctx.dispose();
  return listing;
}

/** Category -> Basics: creates the draft and lands on Location. */
async function createDraft(page, categoryName, title) {
  await page.goto('/en/partner/listings/new');
  await page.getByRole('radio', { name: new RegExp(categoryName) }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel(/^Title/).fill(title);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
  return Number(new URL(page.url()).searchParams.get('listingId'));
}

async function chooseCity(page, cityName) {
  await page.getByRole('combobox', { name: /City or town/ }).click();
  await page.getByLabel('Search cities').fill(cityName);
  await page.getByRole('option', { name: cityName, exact: true }).click();
}

async function fillLocation(page) {
  await chooseCity(page, GARNI);
  await page.getByLabel('Street address').fill(ADDRESS);
  await page.getByText('Enter coordinates manually').click();
  await page.getByLabel(/^Latitude/).fill(COORDINATES.latitude);
  await page.getByLabel(/^Longitude/).fill(COORDINATES.longitude);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
}

test.describe('Partner Listing Wizard — every category', () => {
  CATEGORIES.forEach((category) => {
    test(`${category.name}: location saved, category-specific details, reload resumes`, async ({
      page,
    }) => {
      await login(page);
      const listingId = await createDraft(
        page,
        category.name,
        `E2E wizard ${category.name} ${Date.now()}`,
      );
      await fillLocation(page);

      const main = page.getByRole('main');
      await Promise.all(
        category.offers.map((label) =>
          expect(main.getByText(label, { exact: true }).first()).toBeVisible(),
        ),
      );
      await Promise.all(
        category.never.map((label) =>
          expect(main.getByText(label, { exact: true })).toHaveCount(0),
        ),
      );

      const stored = await ownerListing(listingId);
      expect(stored.location.city_name).toBe(GARNI);
      expect(stored.location.address_line).toBe(ADDRESS);

      // Reload resumes the same step; Back shows the stored location.
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Details' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(
        page.getByRole('combobox', { name: /City or town/ }),
      ).toHaveText(new RegExp(GARNI));
      await expect(page.getByLabel('Street address')).toHaveValue(ADDRESS);
    });
  });
});

test.describe('Partner Listing Wizard — rules and compatibility', () => {
  test('a city is required before the Location step saves', async ({
    page,
  }) => {
    await login(page);
    await createDraft(page, 'Restaurants', `E2E wizard no city ${Date.now()}`);
    await page.getByText('Enter coordinates manually').click();
    await page.getByLabel(/^Latitude/).fill(COORDINATES.latitude);
    await page.getByLabel(/^Longitude/).fill(COORDINATES.longitude);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      page.getByText('Choose the city the listing is in.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
  });

  test('a tour’s pickup details appear only for a hotel pickup', async ({
    page,
  }) => {
    await login(page);
    await createDraft(page, 'Tours', `E2E wizard pickup ${Date.now()}`);
    await fillLocation(page);

    await expect(page.getByLabel('Pickup details')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Meeting point' }).click();
    await page.getByRole('option', { name: 'Hotel pickup' }).click();
    await expect(page.getByLabel('Pickup details')).toBeVisible();
    await page.getByRole('combobox', { name: 'Meeting point' }).click();
    await page.getByRole('option', { name: 'Fixed location' }).click();
    await expect(page.getByLabel('Pickup details')).toHaveCount(0);
  });

  test('legacy Pricing and Availability step URLs open Booking & pricing', async ({
    page,
  }) => {
    await login(page);
    const listingId = await createDraft(
      page,
      'Hotels',
      `E2E wizard legacy step ${Date.now()}`,
    );
    // One legacy URL after the other.
    await ['pricing', 'availability'].reduce(
      (previous, legacyStep) =>
        previous.then(async () => {
          await page.goto(
            `/en/partner/listings/new?listingId=${listingId}&step=${legacyStep}`,
          );
          await expect(
            page.getByRole('heading', { name: 'Booking & pricing' }),
          ).toBeVisible();
          await expect(
            page.getByText('Step 7 of 10: Booking & pricing'),
          ).toBeVisible();
        }),
      Promise.resolve(),
    );
  });

  test('editing a saved draft: change a detail, Next, reload, the new value stands', async ({
    page,
  }) => {
    await login(page);
    const listingId = await createDraft(
      page,
      'Car Rentals',
      `E2E wizard edit ${Date.now()}`,
    );
    await fillLocation(page);

    const bodyType = page.getByRole('combobox', { name: 'Body type' });
    await bodyType.click();
    await page.getByRole('option', { name: 'SUV', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Amenities' }),
    ).toBeVisible();
    expect(
      (await ownerListing(listingId)).attribute_values.find(
        (entry) => entry.code === 'body_type',
      ).option_codes,
    ).toEqual(['SUV']);

    // Re-open the saved draft the way the Partner listings page does.
    await page.goto(
      `/en/partner/listings/new?listingId=${listingId}&step=attributes`,
    );
    await expect(bodyType).toHaveText(/SUV/);
    await bodyType.click();
    await page.getByRole('option', { name: 'Minivan', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Amenities' }),
    ).toBeVisible();

    await page.goto(
      `/en/partner/listings/new?listingId=${listingId}&step=attributes`,
    );
    await expect(bodyType).toHaveText(/Minivan/);
    expect(
      (await ownerListing(listingId)).attribute_values.find(
        (entry) => entry.code === 'body_type',
      ).option_codes,
    ).toEqual(['MINIVAN']);
  });

  test('a validation failure reads in the page language', async ({ page }) => {
    await login(page);
    const listingId = await createDraft(
      page,
      'Tours',
      `E2E wizard validation ${Date.now()}`,
    );
    await page.goto(
      `/ru/partner/listings/new?listingId=${listingId}&step=location`,
    );
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await expect(
      page.getByText('Выберите город, в котором находится объявление.'),
    ).toBeVisible();

    await page.goto(
      `/hy/partner/listings/new?listingId=${listingId}&step=location`,
    );
    await page.getByRole('button', { name: 'Շարունակել' }).click();
    await expect(
      page.getByText('Ընտրեք այն քաղաքը, որտեղ գտնվում է հայտարարությունը։'),
    ).toBeVisible();
  });

  test('a phone-width Partner completes Location and Details', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await login(page);
    await createDraft(page, 'Restaurants', `E2E wizard phone ${Date.now()}`);
    await fillLocation(page);

    await page.getByRole('combobox', { name: 'Dining style' }).click();
    await page.getByRole('option', { name: 'Wine bar', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Amenities' }),
    ).toBeVisible();
    const hasPageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBe(false);
  });

  test('the Location step reads in Armenian and Russian, and fits a phone', async ({
    page,
  }) => {
    await login(page);
    const listingId = await createDraft(
      page,
      'Villas',
      `E2E wizard locales ${Date.now()}`,
    );

    await page.goto(
      `/hy/partner/listings/new?listingId=${listingId}&step=location`,
    );
    await expect(
      page.getByRole('combobox', { name: /Քաղաք կամ բնակավայր/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/հանրային քարտեզը ցույց է տալիս/),
    ).toBeVisible();

    await page.setViewportSize(PHONE);
    await page.goto(
      `/ru/partner/listings/new?listingId=${listingId}&step=location`,
    );
    await expect(
      page.getByRole('combobox', { name: /Город или населённый пункт/ }),
    ).toBeVisible();
    await expect(page.getByText('Шаг 3 из 10: Местоположение')).toBeVisible();
    const hasPageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBe(false);
  });

  test('the rebuilt steps have no serious or critical accessibility violations', async ({
    page,
  }) => {
    await login(page);
    const listingId = await createDraft(
      page,
      'Tours',
      `E2E wizard a11y ${Date.now()}`,
    );

    // Location with the city list open.
    await page.getByRole('combobox', { name: /City or town/ }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await seriousOrCriticalViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await fillLocation(page);

    // Details with the conditional pickup field showing.
    await page.getByRole('combobox', { name: 'Meeting point' }).click();
    await page.getByRole('option', { name: 'Hotel pickup' }).click();
    await expect(page.getByLabel('Pickup details')).toBeVisible();
    expect(await seriousOrCriticalViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Amenities' }),
    ).toBeVisible();

    // Booking & pricing and Policies, one after the other.
    await [
      ['booking', 'Booking & pricing'],
      ['policies', 'Policies'],
    ].reduce(
      (previous, [step, heading]) =>
        previous.then(async () => {
          await page.goto(
            `/en/partner/listings/new?listingId=${listingId}&step=${step}`,
          );
          await expect(
            page.getByRole('heading', { name: heading, level: 2 }),
          ).toBeVisible();
          expect(await seriousOrCriticalViolations(page)).toEqual([]);
        }),
      Promise.resolve(),
    );
  });
});
