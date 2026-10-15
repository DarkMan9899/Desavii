/**
 * The shared `Select` on real screens (seeded data, nothing created):
 * - a page Select (admin bookings' Status filter, 10 options, so it is
 *   searchable): keyboard navigation keeps the active option in view,
 *   Tab from the search field moves on to the next field, Escape returns
 *   focus to the trigger;
 * - a Select whose trigger sits at the bottom of the viewport opens fully
 *   on screen (it used to open below the fold);
 * - a Select inside a Modal (admin promotions): the list lives in the
 *   dialog, the first Escape closes the list, the second the modal;
 * - on a phone, a Select inside an elevated card (the trip planner's
 *   currency) opens a full-width sheet above the account tab bar — it was
 *   card-wide and under the tab bar;
 * - in HY and RU the search and no-results texts are translated and long
 *   options fit without horizontal overflow.
 */

import { test, expect, resetRateLimits } from './fixtures.js';
import {
  expectEveryOptionReachable,
  expectNoHorizontalOverflow,
  expectPanelInViewport,
} from './selectAssertions.js';

const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const TRAVELLER = {
  email: 'anna.harutyunyan@example.com',
  password: 'DemoPass!2024',
};
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const TRIGGER_TO_VIEWPORT_BOTTOM = 60;

async function login(page, { email, password }, landing) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(landing);
}

/** The option `aria-activedescendant` points at lies inside the list's visible area. */
async function activeOptionVisible(page, trigger) {
  const activeId = await trigger.getAttribute('aria-activedescendant');
  return page.evaluate((id) => {
    const option = document.getElementById(id);
    const list = option.closest('[role=listbox]').getBoundingClientRect();
    const r = option.getBoundingClientRect();
    return r.top >= list.top - 1 && r.bottom <= list.bottom + 1;
  }, activeId);
}

test.describe('Shared Select on real screens', () => {
  test.describe('desktop (1440px)', () => {
    test.use({ viewport: DESKTOP });

    test('page Select: arrows keep the active option in view, Tab from the search moves to the next field, Escape returns focus', async ({
      page,
    }) => {
      await login(page, ADMIN, /\/en\/admin$/);
      await page.goto('/en/admin/bookings');
      const status = page.getByRole('combobox', {
        name: 'Status',
        exact: true,
      });

      await status.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('textbox', { name: 'Search…' }),
      ).toBeFocused();
      await expectPanelInViewport(page);
      const optionCount = await page.getByRole('option').count();
      expect(optionCount).toBeGreaterThan(8);
      for (let step = 0; step < optionCount; step += 1) {
        // eslint-disable-next-line no-await-in-loop -- one key at a time
        await page.keyboard.press('ArrowDown');
        // eslint-disable-next-line no-await-in-loop -- reads after each key
        expect(await activeOptionVisible(page, status)).toBe(true);
      }

      await page.keyboard.press('Tab');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(
        page.getByRole('combobox', { name: 'Refund review' }),
      ).toBeFocused();

      await status.click();
      await expectEveryOptionReachable(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(status).toBeFocused();
    });

    test('a Select at the bottom of the viewport opens fully on screen', async ({
      page,
    }) => {
      await login(page, ADMIN, /\/en\/admin$/);
      await page.goto('/en/admin/bookings');
      const status = page.getByRole('combobox', {
        name: 'Status',
        exact: true,
      });
      const box = await status.boundingBox();
      await page.setViewportSize({
        width: DESKTOP.width,
        height: Math.round(box.y + box.height + TRIGGER_TO_VIEWPORT_BOTTOM),
      });

      await status.click();
      await expectPanelInViewport(page);
      await expectEveryOptionReachable(page);
      await expectNoHorizontalOverflow(page);
    });

    test('Select inside a Modal: the list lives in the dialog, Escape closes the list first and the modal second', async ({
      page,
    }) => {
      await login(page, ADMIN, /\/en\/admin$/);
      await page.goto('/en/admin/promotions');
      await page.getByRole('button', { name: 'Promote a listing' }).click();
      const dialog = page.getByRole('dialog', { name: 'Create promotion' });
      const placement = dialog.getByRole('combobox', { name: 'Placement' });

      await placement.click();
      await expect(dialog.getByRole('listbox')).toBeVisible();
      await expectPanelInViewport(page);
      await expectEveryOptionReachable(page);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(placement).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });
  });

  test.describe('phone (390px, touch)', () => {
    test.use({ viewport: PHONE, hasTouch: true });

    test('a Select inside an elevated card opens a full-width sheet above the account tab bar', async ({
      page,
    }) => {
      await login(page, TRAVELLER, /\/en\/account$/);
      await page.goto('/en/account/trip-planner');
      const currency = page.getByRole('combobox', { name: 'Currency' });

      await currency.tap();
      // Polled: the sheet's enter animation slides it into place.
      await expect
        .poll(() =>
          page.getByRole('listbox').evaluate((listbox) => {
            const r = listbox.parentElement.getBoundingClientRect();
            return { left: r.left, right: r.right, bottom: r.bottom };
          }),
        )
        .toEqual({ left: 0, right: PHONE.width, bottom: PHONE.height });
      await expectEveryOptionReachable(page);

      await page.getByRole('option', { name: 'USD' }).tap();
      await expect(currency).toHaveText('USD');
      await expectNoHorizontalOverflow(page);
    });

    [
      {
        locale: 'hy',
        label: 'Կարգավիճակ',
        search: 'Փնտրել…',
        noResults: 'Արդյունքներ չեն գտնվել',
      },
      {
        locale: 'ru',
        label: 'Статус',
        search: 'Поиск…',
        noResults: 'Ничего не найдено',
      },
    ].forEach(({ locale, label, search, noResults }) => {
      test(`${locale.toUpperCase()}: the search and no-results texts are translated and long options fit`, async ({
        page,
      }) => {
        await login(page, ADMIN, /\/en\/admin$/);
        await page.goto(`/${locale}/admin/bookings`);

        await page.getByRole('combobox', { name: label, exact: true }).tap();
        await expectEveryOptionReachable(page);
        await expectNoHorizontalOverflow(page);

        const searchField = page.getByRole('textbox', { name: search });
        await searchField.fill('zzzz');
        await expect(page.getByRole('listbox')).toHaveText(noResults);
      });
    });
  });
});
