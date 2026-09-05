/**
 * Sprint C-2 (Public Rooms / Choose Your Room) — dedicated accessibility
 * verification for the new public Rooms section and Room Detail modal on
 * `/:locale/listings/:id`. Neither `accessibility.spec.js` nor
 * `inventoryAccessibility.spec.js` (Phase 17) touch this surface —
 * their listing-detail scans predate Sprint C-2 entirely.
 *
 * Mirrors `partnerRoomAuthoringAccessibility.spec.js`'s (Sprint C-1)
 * exact `@axe-core/playwright` "serious"/"critical" scoping convention
 * and `reducedMotion: 'reduce'` rationale. Uses the real demo fixture
 * (Boutique Yerevan Hotel, `demo-vendor-boutique-yerevan-hotel`) rather
 * than a throwaway listing — Sprint C-2 is read-only public discovery,
 * so there is no owner-mutation setup needed the way Sprint C-1's
 * authoring scan required.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

test.use({ reducedMotion: 'reduce' });

const HOTEL_SLUG = 'demo-vendor-boutique-yerevan-hotel';

async function seriousOrCriticalViolations(page) {
  await page.waitForTimeout(350);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
}

test.describe('Public Rooms accessibility (Sprint C-2)', () => {
  test('the Rooms section on a real multi-room Hotel has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto(`/en/listings/${HOTEL_SLUG}`);
    await expect(
      page.getByRole('heading', { name: 'Rooms', level: 2 }),
    ).toBeVisible({ timeout: 15_000 });

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('an open Room Detail dialog (gallery, key facts, amenities, Select Room) has no serious/critical accessibility violations, and focus enters/returns correctly', async ({
    page,
  }) => {
    await page.goto(`/en/listings/${HOTEL_SLUG}`);
    await expect(
      page.getByRole('heading', { name: 'Rooms', level: 2 }),
    ).toBeVisible({ timeout: 15_000 });

    const viewButton = page
      .getByRole('button', { name: /^View .+ details$/ })
      .first();
    await viewButton.focus();
    await viewButton.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Focus must land inside the dialog, never stay behind it.
    const focusIsInsideDialog = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]');
      return Boolean(dialogEl && dialogEl.contains(document.activeElement));
    });
    expect(focusIsInsideDialog).toBe(true);

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    // The trigger button gets focus back — never left stranded.
    await expect(viewButton).toBeFocused();
  });

  test('the Rooms section in HY has no serious/critical accessibility violations', async ({
    page,
  }) => {
    await page.goto(`/hy/listings/${HOTEL_SLUG}`);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({
      timeout: 15_000,
    });

    const violations = await seriousOrCriticalViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
