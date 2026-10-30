/**
 * Shared header — the row always fits (HOME-017). Links that do not fit
 * beside the logo and actions move, in order, into one "More" menu; the
 * actions themselves are never hidden. Asserted structurally (bounding
 * boxes), on Home and on a representative inner page, in every locale at
 * the widths that used to overlap — plus keyboard use and axe on the open
 * menu.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';

const MORE = { hy: 'Ավելին', en: 'More', ru: 'Ещё' };
const CASES = [
  ['hy', 1024],
  ['en', 1024],
  ['ru', 1024],
  ['hy', 1280],
];

// Every visible link/button in the header row overlaps none of the others
// and stays on screen.
async function headerControlsOverlap(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('header a, header button')]
      .filter((el) => !el.closest('[aria-hidden="true"]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.top < 80);
    const problems = [];
    controls.forEach((a, i) => {
      if (a.r.left < -1 || a.r.right > vw + 1)
        problems.push(`offscreen: ${a.el.textContent}`);
      controls.slice(i + 1).forEach((b) => {
        if (a.el.contains(b.el) || b.el.contains(a.el)) return;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 1 && y > 1)
          problems.push(`${a.el.textContent} × ${b.el.textContent}`);
      });
    });
    return problems;
  });
}

test.describe('Shared header fits its row', () => {
  CASES.forEach(([locale, width]) => {
    ['', '/companies'].forEach((route) => {
      test(`${locale} ${width}${route || ' (Home)'}: no overlap, nothing off screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/${locale}${route}`);
        await page.evaluate(() => document.fonts.ready);
        expect(await headerControlsOverlap(page)).toEqual([]);
        await expectNoHorizontalOverflow(page);
      });
    });
  });

  test('"More" opens from the keyboard and its links navigate', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/hy');
    const nav = page.getByRole('navigation', {
      name: 'Հիմնական նավարկություն',
    });
    const more = nav.getByRole('button', { name: MORE.hy });
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(more).toHaveAttribute('aria-expanded', 'true');

    const partner = page.getByRole('menuitem', { name: 'Դառնալ գործընկեր' });
    await expect(partner).toBeVisible();
    const violations = (
      await new AxeBuilder({ page }).include('header').analyze()
    ).violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact),
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

    await partner.click();
    await expect(page).toHaveURL('/hy/become-a-partner');
  });

  test('from 1440 every link fits in the row, in every locale', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await Promise.all(
      Object.keys(MORE).map(async (locale) => {
        const tab = await page.context().newPage();
        await tab.setViewportSize({ width: 1440, height: 800 });
        await tab.goto(`/${locale}`);
        await tab.evaluate(() => document.fonts.ready);
        await expect(
          tab.locator('header nav').getByRole('button', { name: MORE[locale] }),
        ).toHaveCount(0);
        await tab.close();
      }),
    );
  });
});
