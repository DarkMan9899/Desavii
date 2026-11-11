/**
 * The shared listing card system (docs/LISTING_CARDS.md) against the real
 * backend + demo seed:
 *
 * - all nine categories: the precise category label and a truthful price
 *   (the listing's own basis; a restaurant's average, never "from"; "not
 *   listed" without an amount) on the real Category page;
 * - every locale at every width (390–1920) on Search and a Category page:
 *   no horizontal scroll, no text spilling out of a card, no broken image,
 *   no console error, no serious axe violation in the cards; a screenshot
 *   per combination under `test-results/visual-qa/listing-cards/`;
 * - one link per card (keyboard: one tab stop, Enter opens the listing),
 *   the favourite beside it — signed in it toggles without navigating;
 * - the public card APIs: published listings only, no owner/moderator data
 *   for an anonymous caller, whitelisted fields only, approximate points
 *   for private stays, safe errors for malformed ids, bounded page sizes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';
import { VISUAL_QA_OUTPUT_DIR } from './visualQa.js';

const API = 'http://localhost:4000/api/v1';
const WIDTHS = [390, 430, 768, 1024, 1280, 1440, 1920];
const LOCALES = ['hy', 'en', 'ru'];

const CATEGORIES = [
  ['hotels', 'Hotel', 'night'],
  ['apartments', 'Apartment', 'night'],
  ['villas', 'Villa', 'night'],
  ['guest-houses', 'Guest house', 'night'],
  ['restaurants', 'Restaurant', 'person'],
  ['tours', 'Tour', 'person'],
  ['car-rentals', 'Car rental', 'day'],
  ['attractions', 'Attraction', 'person'],
  ['entertainment-venues', 'Entertainment', 'person'],
];
const BASIS = {
  PER_NIGHT: '/ night',
  PER_DAY: '/ day',
  PER_PERSON: '/ person',
};

/** Every field a public card DTO may carry (searchDto.js). */
const PUBLIC_CARD_FIELDS = new Set([
  'id',
  'listing_type',
  'slug',
  'title',
  'city_name',
  'cover_image_url',
  'price_amount',
  'price_currency_code',
  'media_count',
  'rating_average',
  'review_count',
  'created_at',
  'category_slug',
  'cuisine',
  'price_tier',
  'star_rating',
  'transmission',
  'bedrooms',
  'duration_minutes',
  'pricing_model',
  'promotion_id',
  // The shared card facts (`listingCardFactsDto.js`).
  'max_guests',
  'seats',
  'min_age',
  'max_group_size',
  'tour_format',
  'body_type',
  'fuel_type',
  'attraction_type',
  'visit_format',
  'venue_type',
  'languages_offered',
  'amenities',
  'reservable',
]);

async function categoryId(request, slug) {
  const { data } = await (
    await request.get(`${API}/search/categories?locale=en`)
  ).json();
  return data.find((c) => c.slug === slug).id;
}

async function adminToken(request) {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' },
  });
  return (await res.json()).data.access_token;
}

/** Card geometry and content problems, measured in the page. */
function auditCards(page) {
  return page.locator('main').evaluate((main) => {
    const cards = [...main.querySelectorAll('article[aria-labelledby]')];
    return {
      count: cards.length,
      spill: cards.filter((card) =>
        [...card.querySelectorAll('p, h3, li, span')].some(
          (el) =>
            getComputedStyle(el).textOverflow !== 'ellipsis' &&
            // Visually hidden text (a badge's spoken description) is
            // clipped to 1px on purpose; it never shows.
            el.getBoundingClientRect().width > 1 &&
            el.scrollWidth > card.clientWidth + 1,
        ),
      ).length,
      brokenImages: cards.filter((card) => {
        const img = card.querySelector('img');
        return img && img.complete && img.naturalWidth === 0;
      }).length,
      nestedControls: cards.filter((card) =>
        [...card.querySelectorAll('a')].some((a) =>
          a.querySelector('a, button, input, select, textarea'),
        ),
      ).length,
      linksPerCard: [
        ...new Set(cards.map((c) => c.querySelectorAll('a').length)),
      ],
    };
  });
}

test.describe('Listing cards — all nine categories', () => {
  CATEGORIES.forEach(([slug, label, unit]) => {
    test(`${slug}: the precise category and a truthful price`, async ({
      page,
      request,
    }) => {
      const id = await categoryId(request, slug);
      const { data } = await (
        await request.get(`${API}/search?locale=en&categoryId=${id}`)
      ).json();
      // A listing can sit in several categories; the card names its own,
      // so check one whose own category is this page's.
      const listing = data.find((l) => l.category_slug === slug);
      expect(listing, `${slug} needs a demo listing`).toBeTruthy();

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/en/categories/${slug}`);
      const card = page
        .getByRole('article', {
          name: listing.title.trim() || 'Untitled listing',
        })
        .last();
      await expect(card).toBeVisible();
      await expect(card.locator('p').first()).toContainText(
        label.toUpperCase(),
        {
          ignoreCase: true,
        },
      );

      const footer = card.locator('[class*="footer"]');
      if (listing.price_amount && listing.price_currency_code) {
        if (listing.listing_type === 'RESTAURANT') {
          await expect(footer).toContainText('Avg.');
          await expect(footer).not.toContainText('From');
        } else {
          await expect(footer).toContainText('From');
        }
        const basis = BASIS[listing.pricing_model];
        if (basis) await expect(footer).toContainText(basis);
      } else {
        await expect(footer).toContainText('Price not listed');
      }
      // Stay wording only ever appears on stays.
      if (unit !== 'night') await expect(footer).not.toContainText('/ night');

      // The decision layer: title first, then category · city.
      const text = await card.innerText();
      expect(text.indexOf(listing.title.trim())).toBeLessThan(
        text.toUpperCase().indexOf(label.toUpperCase()),
      );
      // The rating is the real approved-review average and count, or an
      // honest "No reviews yet" — never 0.0.
      const rating = await card.locator('p[class*="rating"]').innerText();
      if (listing.review_count > 0) {
        expect(rating).toContain(Number(listing.rating_average).toFixed(1));
        expect(rating).toContain(
          `${listing.review_count} review${listing.review_count === 1 ? '' : 's'}`,
        );
      } else {
        expect(rating).toBe('No reviews yet');
      }
      const facts = await card.getByRole('listitem').allInnerTexts();
      expect(facts.length).toBeLessThanOrEqual(3);
      // A car rental never speaks of guests or nights.
      if (slug === 'car-rentals') {
        expect(text).not.toMatch(/guest|night|bedroom/i);
      }
      // What this category's card shows, kept with the screenshots.
      await fs.mkdir(path.join(VISUAL_QA_OUTPUT_DIR, 'listing-cards'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(VISUAL_QA_OUTPUT_DIR, 'listing-cards', `facts-${slug}.json`),
        JSON.stringify({ slug, title: listing.title.trim(), rating, facts }),
      );
    });
  });
});

test.describe('Listing cards — every category on a phone, HY and RU', () => {
  CATEGORIES.forEach(([slug]) => {
    ['hy', 'ru'].forEach((locale) => {
      test(`${slug} ${locale} @390`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.goto(`/${locale}/categories/${slug}`);
        const first = page.locator('main article[aria-labelledby]').first();
        await expect(first).toBeVisible();
        await first.locator('h2, h3, h4').scrollIntoViewIfNeeded();

        const audit = await auditCards(page);
        expect(audit.spill).toBe(0);
        expect(audit.nestedControls).toBe(0);
        await expectNoHorizontalOverflow(page);
        const axe = await new AxeBuilder({ page })
          .include('main article[aria-labelledby]')
          .analyze();
        expect(
          axe.violations
            .filter((v) => ['serious', 'critical'].includes(v.impact))
            .map((v) => v.id),
        ).toEqual([]);

        await page.screenshot({
          path: path.join(
            VISUAL_QA_OUTPUT_DIR,
            'listing-cards',
            `category-${slug}-${locale}-390.png`,
          ),
        });
      });
    });
  });
});

test.describe('Listing cards — every locale and width', () => {
  ['search', 'categories/tours'].forEach((route) => {
    LOCALES.forEach((locale) => {
      WIDTHS.forEach((width) => {
        test(`${route} ${locale} @${width}`, async ({ page }) => {
          const errors = [];
          page.on(
            'console',
            (m) => m.type() === 'error' && errors.push(m.text()),
          );
          page.on('pageerror', (e) => errors.push(e.message));
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`/${locale}/${route}`);
          const first = page.locator('main article[aria-labelledby]').first();
          await expect(first).toBeVisible();
          await first.scrollIntoViewIfNeeded();

          const audit = await auditCards(page);
          expect(audit.count).toBeGreaterThan(0);
          expect(audit.spill).toBe(0);
          expect(audit.brokenImages).toBe(0);
          expect(audit.nestedControls).toBe(0);
          expect(audit.linksPerCard).toEqual([1]);
          await expectNoHorizontalOverflow(page);

          const axe = await new AxeBuilder({ page })
            .include('main article[aria-labelledby]')
            .analyze();
          expect(
            axe.violations
              .filter((v) => ['serious', 'critical'].includes(v.impact))
              .map((v) => v.id),
          ).toEqual([]);
          expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);

          await page.screenshot({
            path: path.join(
              VISUAL_QA_OUTPUT_DIR,
              'listing-cards',
              `${route.replace('/', '-')}-${locale}-${width}.png`,
            ),
          });
        });
      });
    });
  });
});

test.describe('Listing cards — keyboard and favourites', () => {
  test('one tab stop per card, a visible focus ring, Enter opens the listing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/categories/tours');
    const card = page.locator('main article[aria-labelledby]').last();
    const link = card.getByRole('link');
    await link.focus();
    await page.keyboard.press('Tab');
    // The next tab stop is outside this card: one stop per card (signed out).
    await expect(link).not.toBeFocused();
    await link.focus();
    const ring = await link.evaluate(
      (el) => getComputedStyle(el, '::after').outlineStyle,
    );
    expect(ring).toBe('solid');
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/en\/listings\//);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('signed in, the favourite toggles on the card without navigating', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel(/^Password/).fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/categories/villas');
    const card = page.locator('main article[aria-labelledby]').last();
    const add = card.getByRole('button', { name: 'Add to favorites' });
    const remove = card.getByRole('button', { name: 'Remove from favorites' });
    const startedFavourite = await remove.isVisible();
    const url = page.url();
    try {
      await (startedFavourite ? remove : add).click();
      await expect(startedFavourite ? add : remove).toBeVisible();
      expect(page.url()).toBe(url);
    } finally {
      // Leave the account's favourites as they were.
      if ((await remove.isVisible()) !== startedFavourite) {
        await (startedFavourite ? add : remove).click();
        await expect(startedFavourite ? remove : add).toBeVisible();
      }
    }
  });
});

test.describe('Listing cards — public API boundaries', () => {
  test('an anonymous caller sees published listings only, whatever it asks for', async ({
    request,
  }) => {
    const token = await adminToken(request);
    const elevated = await (
      await request.get(`${API}/search?locale=en&status=DRAFT&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const hidden = elevated.data.filter((l) => l.status !== 'PUBLISHED');

    const answers = await Promise.all(
      [
        'status=DRAFT',
        'status=REJECTED',
        'status=DRAFT&partnerId=1',
        'partnerId=1',
      ].map(async (query) => {
        const res = await request.get(
          `${API}/search?locale=en&limit=50&${query}`,
        );
        return { status: res.status(), body: await res.json() };
      }),
    );
    answers.forEach(({ status, body }) => {
      if (status !== 200) {
        // Validation errors answer 400/422, never a 5xx.
        expect([400, 422]).toContain(status);
        return;
      }
      // The public card carries no status (it is always PUBLISHED).
      expect(body.data.some((l) => 'status' in l)).toBe(false);
      expect(body.data.some((l) => hidden.some((h) => h.id === l.id))).toBe(
        false,
      );
      // Owner-only lifecycle fields never reach an anonymous caller.
      expect(body.data.some((l) => 'expires_at' in l)).toBe(false);
    });

    if (hidden.length > 0) {
      const res = await request.get(
        `${API}/listings/${hidden[0].id}?locale=en`,
      );
      expect([403, 404]).toContain(res.status());
    }
  });

  test('a public card carries whitelisted fields only — no address, point or contact', async ({
    request,
  }) => {
    const { data } = await (
      await request.get(`${API}/search?locale=en&limit=50`)
    ).json();
    const extra = new Set(
      data.flatMap((l) =>
        Object.keys(l).filter((k) => !PUBLIC_CARD_FIELDS.has(k)),
      ),
    );
    expect([...extra]).toEqual([]);
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/"(address|latitude|longitude|email|phone|cost)/i);
  });

  test('the Home Featured and Category TOP feeds send the same public card', async ({
    request,
  }) => {
    const hotels = await categoryId(request, 'hotels');
    const feeds = await Promise.all(
      [
        `${API}/advertising/public/home-featured?locale=en`,
        `${API}/advertising/public/category-top?locale=en&categoryId=${hotels}`,
      ].map(async (url) => {
        const res = await request.get(url);
        expect(res.status()).toBe(200);
        return (await res.json()).data;
      }),
    );
    const rows = feeds.flat();
    expect(rows.length).toBeGreaterThan(0);
    const extra = new Set(
      rows.flatMap((l) =>
        Object.keys(l).filter((k) => !PUBLIC_CARD_FIELDS.has(k)),
      ),
    );
    expect([...extra]).toEqual([]);
  });

  test('map points of private stays are approximate', async ({ request }) => {
    const id = await categoryId(request, 'apartments');
    const res = await request.get(
      `${API}/search/map?locale=en&categoryId=${id}`,
    );
    expect(res.ok()).toBe(true);
    const { data } = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((m) => m.location_precision === 'approximate')).toBe(
      true,
    );
  });

  test('malformed ids and oversized pages are refused safely', async ({
    request,
  }) => {
    const answers = await Promise.all(
      ["1' OR '1'='1", '../../etc/passwd', '%00', '9'.repeat(40)].map(
        async (id) => {
          const res = await request.get(
            `${API}/listings/${encodeURIComponent(id)}`,
          );
          return { status: res.status(), body: await res.text() };
        },
      ),
    );
    answers.forEach(({ status, body }) => {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(body).not.toMatch(/stack|sql|syntax|ER_|at \w+ \(/i);
    });
    const big = await request.get(`${API}/search?locale=en&limit=100000`);
    if (big.ok()) {
      expect((await big.json()).data.length).toBeLessThanOrEqual(100);
    } else {
      expect([400, 422]).toContain(big.status());
    }
  });

  test('favourites are never readable without signing in', async ({
    request,
  }) => {
    expect((await request.get(`${API}/favorites`)).status()).toBe(401);
    expect((await request.get(`${API}/favorites/ids`)).status()).toBe(401);
  });
});
