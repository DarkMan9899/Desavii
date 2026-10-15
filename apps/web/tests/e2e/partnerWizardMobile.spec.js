/**
 * P2.1 (Partner Listing Wizard — mobile/responsive fix) — end to end
 * against the real backend + demo-seeded database.
 *
 * The forensic audit found two real, verified mobile defects on the
 * wizard's first step: `CategoryStep`'s vertical/category picker used a
 * fixed 3-column `<Grid>` (unusably cramped at ~390px), and
 * `WizardProgress`'s 11-step row had no responsive handling at all
 * (would overflow badly under ~768px, worst at 390px). Both were fixed
 * with CSS only — no JS/behavior change — so this spec verifies the
 * real rendered layout at representative widths, not just that the page
 * loads.
 */

import { test, expect } from './fixtures.js';

const VENDOR = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };

async function login(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(VENDOR.email);
  await page.getByLabel(/^Password/).fill(VENDOR.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

test.describe('Partner Listing Wizard — mobile/responsive (CategoryStep + WizardProgress)', () => {
  test('category picker adapts from 1 column (mobile) to 3 (tablet+), progress bar never causes page overflow', async ({
    page,
  }) => {
    await login(page);

    // 390px — the primary regression case.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/partner/listings/new');
    await expect(page.getByRole('radiogroup')).toBeVisible();

    const categoryOption = page.getByRole('radio').first();
    await expect(categoryOption).toBeVisible();
    // A real single-column layout, not merely "not broken" — the first
    // two category cards stack vertically (second card's top is below
    // the first card's bottom), not side by side.
    const firstBox = await categoryOption.boundingBox();
    const secondBox = await page.getByRole('radio').nth(1).boundingBox();
    expect(secondBox.y).toBeGreaterThanOrEqual(
      firstBox.y + firstBox.height - 1,
    );

    // No page-level horizontal scrollbar anywhere on this step at 390px.
    const hasPageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBe(false);

    // The wizard progress bar states the current step in full,
    // regardless of whether the step row itself needs to scroll.
    await expect(page.getByText('Step 1 of 11: Category')).toBeVisible();

    // The category picker itself is genuinely usable: selecting an
    // option enables Continue.
    await categoryOption.click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();

    // Tablet: the same picker now shows a real 3-column layout — the
    // first three cards sit on the same row (near-equal top offsets).
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(100);
    const tabletBoxes = await Promise.all([
      page.getByRole('radio').nth(0).boundingBox(),
      page.getByRole('radio').nth(1).boundingBox(),
      page.getByRole('radio').nth(2).boundingBox(),
    ]);
    expect(Math.abs(tabletBoxes[0].y - tabletBoxes[1].y)).toBeLessThan(5);
    expect(Math.abs(tabletBoxes[1].y - tabletBoxes[2].y)).toBeLessThan(5);
    const tabletOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(tabletOverflow).toBe(false);

    // Desktop: unchanged 3-column layout, still no page overflow.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(100);
    const desktopOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(desktopOverflow).toBe(false);
    await expect(page.getByRole('radio').nth(2)).toBeVisible();
  });
});
