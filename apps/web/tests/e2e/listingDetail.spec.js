/**
 * Listing Detail redesign (docs/LISTING_DETAIL_REDESIGN.md) — the real page,
 * in a real browser, for a representative listing of each of the nine
 * categories (picked from the live demo data at run time, never a
 * hard-coded fixture):
 *
 * - the first screen answers what, where, how guests rate it and what to do
 *   next (the pinned reservation panel from laptop, the fixed booking bar
 *   below it);
 * - HY / EN / RU at 390, 430, 768, 1024, 1280, 1440 and 1920 px: no
 *   horizontal overflow, no broken image, no console error, no failed API
 *   request, no serious axe violation (screenshots kept as evidence);
 * - the gallery lightbox by keyboard, a private stay's location privacy in
 *   the rendered page, reviewer privacy and related listings.
 *
 * Information depth (docs/LISTING_DETAIL_INFORMATION_DEPTH.md): the
 * locale × width matrix runs on each category's fully described demo
 * listing (`seeds/demo/seedDemoListingInformationDepth.js`) — the densest
 * page a category produces — and checks that every in-page link lands on a
 * section with real content, that no stored code ever reaches the reader,
 * and that each category answers its decisive questions.
 */

import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';
import { VISUAL_QA_OUTPUT_DIR } from './visualQa.js';

const API = 'http://localhost:4000/api/v1';
const WIDTHS = [390, 430, 768, 1024, 1280, 1440, 1920];
const LOCALES = ['hy', 'en', 'ru'];
const LAPTOP_WIDTH = 1024;
const CATEGORIES = [
  ['hotels', 'Hotel'],
  ['apartments', 'Apartment'],
  ['villas', 'Villa'],
  ['guest-houses', 'Guest house'],
  ['restaurants', 'Restaurant'],
  ['tours', 'Tour'],
  ['car-rentals', 'Car rental'],
  ['attractions', 'Attraction'],
  ['entertainment-venues', 'Entertainment'],
];
const PRIVATE_STAYS = new Set(['apartments', 'villas', 'guest-houses']);
// Each category's fully described demo listing.
const REPRESENTATIVES = {
  hotels: 'demo-vendor-boutique-yerevan-hotel',
  apartments: 'demo-vendor-yerevan-city-loft',
  villas: 'sprintj-dilijan-forest-villa',
  'guest-houses': 'sprintj-goris-cave-country-guesthouse',
  restaurants: 'sprintj-toros-armenian-kitchen',
  tours: 'demo-vendor-dilijan-trail-tour',
  'car-rentals': 'demo-vendor-ararat-valley-fleet',
  attractions: 'demo-vendor-certified-yerevan-city-guide',
  'entertainment-venues': 'sprintj-labyrinth-escape-rooms',
};
// A stored code (`ENDS_ELSEWHERE`, `guide_type`) never reaches the reader.
const RAW_CODE = /\b(?:[A-Z]+_[A-Z_]+|[a-z]+_[a-z_]+)\b/;

/** Every in-page link lands on a section that shows something. */
async function emptyLinkedSections(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('nav a[href^="#"]')]
      .map((link) => link.getAttribute('href').slice(1))
      .filter((id) => {
        const heading = document.getElementById(id);
        const section = heading?.closest('section');
        const text = (section?.innerText ?? '')
          .replace(heading?.innerText ?? '', '')
          .trim();
        return text.length === 0;
      }),
  );
}

/** The category's listing with the most to show: reviews first, then amenities. */
async function pickListing(request, slug) {
  const { data: categories } = await (
    await request.get(`${API}/search/categories?locale=en`)
  ).json();
  const category = categories.find((candidate) => candidate.slug === slug);
  const { data } = await (
    await request.get(
      `${API}/search?locale=en&limit=100&categoryId=${category.id}`,
    )
  ).json();
  const own = data.filter((listing) => listing.category_slug === slug);
  own.sort(
    (a, b) =>
      b.review_count - a.review_count ||
      b.amenities.length - a.amenities.length,
  );
  expect(own.length, `${slug} needs a demo listing`).toBeGreaterThan(0);
  return own[0];
}

function trackFailures(page) {
  const failures = { console: [], api: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') failures.console.push(message.text());
  });
  page.on('pageerror', (error) => failures.console.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/api/v1/') && response.status() >= 500) {
      failures.api.push(`${response.status()} ${response.url()}`);
    }
  });
  return failures;
}

/** The booking entry point visible on the first screen at this width. */
async function bookingActionOnFirstScreen(page, width) {
  return page.evaluate((isLaptop) => {
    const inView = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return (
        rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0
      );
    };
    if (isLaptop) return inView(document.querySelector('main aside'));
    const fixedBar = [...document.querySelectorAll('main *')].find(
      (el) =>
        getComputedStyle(el).position === 'fixed' && el.querySelector('button'),
    );
    return inView(fixedBar);
  }, width >= LAPTOP_WIDTH);
}

test.describe('Listing Detail — the first screen, every category', () => {
  CATEGORIES.forEach(([slug, label]) => {
    test(`${slug}: what, where, rating and the next step`, async ({
      page,
      request,
    }) => {
      const listing = await pickListing(request, slug);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/en/listings/${listing.slug}`);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(listing.title.trim());

      const header = page.locator('main header').first();
      await expect(header).toContainText(label);
      if (listing.city_name)
        await expect(header).toContainText(listing.city_name);
      if (listing.review_count > 0) {
        await expect(
          header.getByRole('link', { name: /Rated .* out of 5 from/ }),
        ).toHaveAttribute('href', '#reviews');
      } else {
        await expect(header).toContainText('No reviews yet');
        await expect(header).not.toContainText('0.0');
      }
      if (PRIVATE_STAYS.has(slug)) {
        await expect(header).toContainText('Approximate area');
      }
      // A car rental never speaks of guests, nights or bedrooms up top.
      if (slug === 'car-rentals') {
        await expect(header).not.toContainText(/guest|night|bedroom/i);
      }

      await expect
        .poll(() => bookingActionOnFirstScreen(page, 1440))
        .toBe(true);
      const headingBox = await heading.boundingBox();
      expect(headingBox.y).toBeLessThan(900);

      await page.setViewportSize({ width: 390, height: 844 });
      // The bar slides in once it is shown; wait for it to settle.
      await expect.poll(() => bookingActionOnFirstScreen(page, 390)).toBe(true);
    });
  });
});

test.describe('Listing Detail — every category, locale and width', () => {
  CATEGORIES.forEach(([slug]) => {
    LOCALES.forEach((locale) => {
      test(`${slug} ${locale} @390–1920`, async ({ page }) => {
        test.setTimeout(120_000);
        const failures = trackFailures(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: WIDTHS[0], height: 900 });
        await page.goto(`/${locale}/listings/${REPRESENTATIVES[slug]}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        // Wait for the category facts, then check the reading surface.
        await expect(page.locator('nav a[href="#reviews"]')).toBeAttached();
        expect(await emptyLinkedSections(page)).toEqual([]);
        expect(await page.locator('main').innerText()).not.toMatch(RAW_CODE);

        // One width after the other on the same page.
        await WIDTHS.reduce(async (previous, width) => {
          await previous;
          await page.setViewportSize({ width, height: 900 });
          await expectNoHorizontalOverflow(page);
          const broken = await page.evaluate(
            () =>
              [...document.images].filter(
                (img) => img.complete && img.naturalWidth === 0,
              ).length,
          );
          expect(broken, `${width}px broken images`).toBe(0);
          // Below laptop: the booking bar's price and action are never
          // squeezed — a long label moves to its own row instead.
          if (width < LAPTOP_WIDTH) {
            const squeezed = await page.evaluate(() => {
              const bar = [...document.querySelectorAll('main *')].find(
                (el) =>
                  getComputedStyle(el).position === 'fixed' &&
                  el.querySelector('button'),
              );
              return bar
                ? [...bar.children].filter(
                    (child) => child.scrollWidth > child.clientWidth + 1,
                  ).length
                : 0;
            });
            expect(squeezed, `${width}px booking bar clipped`).toBe(0);
          }
          await page.screenshot({
            path: path.join(
              VISUAL_QA_OUTPUT_DIR,
              'listing-detail',
              `${slug}-${locale}-${width}.png`,
            ),
          });
        }, Promise.resolve());

        const axe = await new AxeBuilder({ page }).include('main').analyze();
        expect(
          axe.violations
            .filter((violation) =>
              ['serious', 'critical'].includes(violation.impact),
            )
            .map((violation) => violation.id),
        ).toEqual([]);
        expect(failures.console.filter((e) => !/favicon/.test(e))).toEqual([]);
        expect(failures.api).toEqual([]);
      });
    });
  });
});

test.describe('Listing Detail — each category answers its decisive questions', () => {
  // [category, locale, section id, facts that section must state]
  const EXPECTED = [
    [
      'tours',
      'en',
      'meeting',
      ['Meeting point', 'Start times', '09:00 and 14:00', 'Where it ends'],
    ],
    [
      'tours',
      'en',
      'attributes',
      ['Guide', 'Live guide', 'Getting around', 'On foot', 'Weather'],
    ],
    ['tours', 'en', 'guestNotes', ['What to bring', 'Know before you go']],
    ['tours', 'en', 'policies', ['Book ahead', 'At least 1 day before']],
    ['tours', 'hy', 'meeting', ['Մեկնարկի ժամերը', '09:00 և 14:00']],
    ['tours', 'ru', 'meeting', ['Время начала', '09:00 и 14:00']],
    [
      'car-rentals',
      'en',
      'attributes',
      ['Engine and drive', 'All-wheel drive', 'Driver and mileage'],
    ],
    ['car-rentals', 'en', 'policies', ['Fuel', 'Full to full']],
    ['car-rentals', 'en', 'guestNotes', ['Your passport']],
    ['villas', 'en', 'policies', ['Minimum stay', '2 nights', '14 nights']],
    ['villas', 'ru', 'policies', ['Минимальный срок', '2 ночи']],
    ['apartments', 'en', 'attributes', ['Self check-in']],
    // Space type and hotel style lead the key facts; Details adds the rest.
    ['guest-houses', 'en', 'attributes', ['Mountain view', 'Met in person']],
    ['hotels', 'en', 'attributes', ['18']],
    ['restaurants', 'en', 'amenities', ['Step-free access']],
    ['attractions', 'en', 'guestNotes', ['paid separately']],
    ['entertainment-venues', 'en', 'policies', ['Cancellation']],
    ['entertainment-venues', 'en', 'guestNotes', ['Arrive 15 minutes']],
  ];

  EXPECTED.forEach(([slug, locale, sectionId, facts]) => {
    test(`${slug} ${locale}: #${sectionId} states ${facts.join(' · ')}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/listings/${REPRESENTATIVES[slug]}`);
      const section = page
        .locator(`[id="${sectionId}"]`)
        .locator('xpath=ancestor::section[1]');
      await expect(section).toBeVisible();
      await facts.reduce(async (previous, fact) => {
        await previous;
        await expect(section).toContainText(fact);
      }, Promise.resolve());
    });
  });

  test('a listing with nothing to say about a section has no link to it', async ({
    page,
    request,
  }) => {
    // A bare legacy demo tour: no attributes, policies or guest notes.
    const { data } = await (
      await request.get(`${API}/listings/demo-tours-cozy-goris-tour`)
    ).json();
    expect(data.attribute_values).toEqual([]);
    await page.goto('/en/listings/demo-tours-cozy-goris-tour');
    await expect(page.locator('nav a[href="#reviews"]')).toBeAttached();
    expect(await emptyLinkedSections(page)).toEqual([]);
    await expect(page.locator('nav a[href="#attributes"]')).toHaveCount(0);
    await expect(page.locator('nav a[href="#meeting"]')).toHaveCount(0);
  });
});

test.describe('Listing Detail — gallery, privacy and related listings', () => {
  test('the lightbox opens by keyboard, pages by arrow keys and returns focus', async ({
    page,
    request,
  }) => {
    const listing = await pickListing(request, 'hotels');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/listings/${listing.slug}`);
    const opener = page.getByRole('button', { name: /View photo 1 of/ });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('1 of');
    await page.keyboard.press('ArrowRight');
    await expect(dialog).toContainText('2 of');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a private stay never reveals its stored place in the page', async ({
    page,
    request,
  }) => {
    const listing = await pickListing(request, 'villas');
    const detail = await (
      await request.get(`${API}/listings/${listing.slug}?locale=en`)
    ).json();
    expect(detail.data.location.location_precision).toBe('approximate');
    expect(detail.data.location.address_line).toBeNull();

    await page.goto(`/en/listings/${listing.slug}`);
    await expect(page.locator('main header')).toContainText('Approximate area');
    const html = await page.content();
    expect(html).not.toMatch(/data-(lat|lng|latitude|longitude)=/i);
  });

  test("the place reads in the visitor's language", async ({
    page,
    request,
  }) => {
    const listing = await pickListing(request, 'restaurants');
    const { data } = await (
      await request.get(`${API}/listings/${listing.slug}`)
    ).json();
    const names = data.location.name_translations;
    await ['hy', 'ru'].reduce(async (previous, locale) => {
      await previous;
      const localized = names.find((entry) => entry.language_code === locale);
      expect(localized?.city_name, `${locale} city name`).toBeTruthy();
      await page.goto(`/${locale}/listings/${listing.slug}`);
      await expect(page.locator('main header').first()).toContainText(
        localized.city_name,
      );
    }, Promise.resolve());
  });

  test('reviews name a reviewer by first name and initial only', async ({
    page,
    request,
  }) => {
    const listing = await pickListing(request, 'tours');
    expect(listing.review_count).toBeGreaterThan(0);
    const { data } = await (
      await request.get(`${API}/reviews?listingId=${listing.id}`)
    ).json();
    data.forEach((review) => {
      expect(review).not.toHaveProperty('customer_user_id');
      expect(review).not.toHaveProperty('booking_id');
      expect(review.customer_display_name).toMatch(/^\S+( \S\.)?$/);
    });

    await page.goto(`/en/listings/${listing.slug}#reviews`);
    const reviews = page.getByRole('region', { name: 'Reviews', exact: true });
    await expect(reviews).toContainText(data[0].customer_display_name);
    await expect(
      reviews.getByText(Number(listing.rating_average).toFixed(1), {
        exact: true,
      }),
    ).toHaveCount(1);
  });

  test('related listings: at most six shared cards, never the listing itself', async ({
    page,
    request,
  }) => {
    const listing = await pickListing(request, 'hotels');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/listings/${listing.slug}`);
    const related = page.getByRole('region', { name: 'You might also like' });
    await related.scrollIntoViewIfNeeded();
    const cards = related.locator('article[aria-labelledby]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeLessThanOrEqual(6);
    await expect(
      related.locator(`a[href*="/listings/${listing.slug}"]`),
    ).toHaveCount(0);
  });
});
