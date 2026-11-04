/**
 * Home featured rail (the featured-listings fix, docs/HOME_REBUILD.md)
 * against the real backend + demo seed:
 *
 * - data truth: the rail is the real Home promotions first, then real
 *   top-rated / newest listings up to the rail size — every card once,
 *   exactly the cards `selectFeaturedListings` derives from the same two
 *   API responses;
 * - every breakpoint (390–1920) in every locale: several cards side by
 *   side with the next one peeking in, no horizontal scroll, no broken
 *   image, no text spilling out of a card, no console error, no serious
 *   axe violation in the section; a screenshot per combination is written
 *   to `test-results/visual-qa/home-featured/`;
 * - behaviour: arrows, keyboard and swipe move the rail; autoplay pauses
 *   on hover and on focus and is off under reduced motion.
 */

import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';
import { VISUAL_QA_OUTPUT_DIR } from './visualQa.js';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const RAIL_SIZE = 8;
const WIDTHS = [390, 430, 768, 1024, 1280, 1440, 1920];
const LOCALES = ['hy', 'en', 'ru'];
const TITLES = {
  hy: 'Առաջարկվող հայտարարություններ',
  en: 'Featured listings',
  ru: 'Рекомендуемые предложения',
};
const NEXT = { hy: 'Հաջորդը', en: 'Next', ru: 'Вперёд' };

/** The rail the app should show, derived from the same two API calls. */
async function expectedRail(request, locale) {
  const promoted = (
    await (
      await request.get(
        `${API_BASE_URL}/advertising/public/home-featured?locale=${locale}`,
      )
    ).json()
  ).data;
  if (promoted.length >= RAIL_SIZE) return promoted.map((l) => l.slug);
  const candidates = (
    await (
      await request.get(
        `${API_BASE_URL}/search?locale=${locale}&sort=rating_desc&limit=12`,
      )
    ).json()
  ).data;
  const ids = promoted.map((l) => l.id);
  const add = (l) => {
    if (ids.length < RAIL_SIZE && !ids.includes(l.id)) ids.push(l.id);
  };
  candidates
    // "Top guest rating": an average of 4.5+ from 3+ approved reviews.
    .filter(
      (l) =>
        l.rating_average != null &&
        Number(l.rating_average) >= 4.5 &&
        l.review_count >= 3,
    )
    .forEach(add);
  const types = new Set(
    [...promoted, ...candidates]
      .filter((l) => ids.includes(l.id))
      .map((l) => l.listing_type),
  );
  candidates.forEach((l) => {
    if (types.has(l.listing_type)) return;
    types.add(l.listing_type);
    add(l);
  });
  const slugById = new Map(
    [...promoted, ...candidates].map((l) => [l.id, l.slug]),
  );
  return ids.map((id) => slugById.get(id));
}

function rail(page, locale) {
  return page.getByRole('region', { name: TITLES[locale] }).last();
}

async function railMetrics(railLocator) {
  return railLocator.evaluate((root) => {
    const cards = [...root.querySelectorAll('article')];
    const viewport = root.querySelector('[class*="_viewport_"]');
    const v = viewport.getBoundingClientRect();
    return {
      slugs: cards.map((card) =>
        card.querySelector('a').getAttribute('href').split('/').pop(),
      ),
      // Cards fully inside the visible rail.
      fullyVisible: cards.filter((card) => {
        const r = card.getBoundingClientRect();
        return r.left >= v.left - 1 && r.right <= v.right + 1;
      }).length,
      // Any text wider than its card (clipped, not wrapped). A deliberate
      // one-line ellipsis (the eyebrow) is not a spill.
      spill: cards.some((card) =>
        [...card.querySelectorAll('p, h3, li, span')].some(
          (el) =>
            getComputedStyle(el).textOverflow !== 'ellipsis' &&
            el.scrollWidth > card.clientWidth + 1,
        ),
      ),
      brokenImages: cards.filter((card) => {
        const img = card.querySelector('img');
        return img && img.complete && img.naturalWidth === 0;
      }).length,
    };
  });
}

test.describe('Home featured rail — data truth', () => {
  test('shows exactly the real promotions, then real top-rated / newest listings, each once', async ({
    page,
    request,
  }) => {
    const expected = await expectedRail(request, 'en');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en');
    const row = rail(page, 'en');
    await row.scrollIntoViewIfNeeded();
    await expect(row.getByRole('article').first()).toBeVisible();
    const { slugs } = await railMetrics(row);
    expect(slugs).toEqual(expected);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

test.describe('Home featured rail — every breakpoint and locale', () => {
  LOCALES.forEach((locale) => {
    WIDTHS.forEach((width) => {
      test(`${locale} @${width}: several cards, no overflow, no broken image, no console error`, async ({
        page,
        request,
      }) => {
        const expected = await expectedRail(request, locale);
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        page.on('pageerror', (error) => errors.push(error.message));
        // A still rail, so the screenshot and the geometry are stable.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}`);
        const row = rail(page, locale);
        await row.scrollIntoViewIfNeeded();
        await expect(row.getByRole('article')).toHaveCount(expected.length);
        await page.waitForLoadState('networkidle');

        const metrics = await railMetrics(row);
        expect(metrics.spill).toBe(false);
        expect(metrics.brokenImages).toBe(0);
        // The heading wraps inside the screen (long Armenian words too).
        const heading = await page
          .locator('#featured-listings-heading')
          .evaluate((el) => ({
            right: el.getBoundingClientRect().right,
            fits: el.scrollWidth <= el.clientWidth + 1,
          }));
        expect(heading.fits).toBe(true);
        expect(heading.right).toBeLessThanOrEqual(width);
        // Phones show one card with the next peeking in; wider screens
        // show several side by side.
        expect(metrics.fullyVisible).toBeGreaterThanOrEqual(
          width < 768 ? 1 : 2,
        );
        // More cards than fit: the progress track shows, and from tablet up
        // the paired arrows too (phones swipe).
        if (expected.length > metrics.fullyVisible) {
          await expect(row.locator('[class*="_progress_"]')).toBeVisible();
          if (width >= 768) {
            await expect(
              row.getByRole('button', { name: NEXT[locale] }),
            ).toBeEnabled();
          }
        }
        await expectNoHorizontalOverflow(page);

        const axe = await new AxeBuilder({ page })
          .include('section:has(#featured-listings-heading)')
          .analyze();
        const serious = axe.violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact),
        );
        expect(serious.map((v) => v.id)).toEqual([]);
        expect(errors).toEqual([]);

        // The whole section (heading, toolbar and rail), full width.
        await page
          .locator('section:has(#featured-listings-heading)')
          .screenshot({
            path: path.join(
              VISUAL_QA_OUTPUT_DIR,
              'home-featured',
              `${locale}-${width}.png`,
            ),
          });
      });
    });
  });
});

test.describe('Home featured rail — behaviour', () => {
  test('arrows and keys move the rail and stop at its ends', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en');
    const row = rail(page, 'en');
    await row.scrollIntoViewIfNeeded();
    const previous = row.getByRole('button', { name: 'Previous' });
    const next = row.getByRole('button', { name: 'Next' });
    const counter = row.locator('[class*="_counter_"]');
    await expect(previous).toBeDisabled();
    await expect(counter).toHaveText(/^01 \/ 0[2-9]$/);
    await next.click();
    await expect(counter).toHaveText(/^02 \//);
    await expect(previous).toBeEnabled();
    await previous.click();
    await expect(previous).toBeDisabled();

    await row.getByRole('article').first().getByRole('link').focus();
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(/^02 \//);
  });

  test('a swipe on a phone moves to the next card', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    const row = rail(page, 'en');
    await row.scrollIntoViewIfNeeded();
    const counter = row.locator('[class*="_counter_"]');
    await expect(counter).toHaveText(/^01 \//);
    const box = await row.getByRole('article').first().boundingBox();
    const y = box.y + box.height / 3;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, y, { steps: 12 });
    await page.mouse.up();
    await expect(counter).toHaveText(/^02 \//);
  });

  test('autoplay plays, pauses on hover and focus, and is off under reduced motion', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en');
    const row = rail(page, 'en');
    await row.scrollIntoViewIfNeeded();
    const counter = row.locator('[class*="_counter_"]');
    await expect(
      row.getByRole('button', { name: 'Pause automatic scrolling' }),
    ).toBeVisible();

    // Hover holds the rail past the 6 s autoplay delay.
    await row.getByRole('article').first().hover();
    await page.waitForTimeout(7000);
    await expect(counter).toHaveText(/^01 \//);

    // Focus holds it too — also once the pointer leaves (the plugin's own
    // restart on leave must not override the focus hold).
    await row.getByRole('article').first().getByRole('link').focus();
    await page.mouse.move(1, 1);
    await page.waitForTimeout(7000);
    await expect(counter).toHaveText(/^01 \//);

    // Released, it moves on its own.
    await page.evaluate(() => document.activeElement.blur());
    await expect(counter).toHaveText(/^02 \//, { timeout: 9000 });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await rail(page, 'en').scrollIntoViewIfNeeded();
    await expect(
      rail(page, 'en').getByRole('button', {
        name: 'Pause automatic scrolling',
      }),
    ).toHaveCount(0);
  });
});
