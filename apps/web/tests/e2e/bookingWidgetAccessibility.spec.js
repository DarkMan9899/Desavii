/**
 * Booking / action panel accessibility (docs/BOOKING_WIDGET_REBUILD.md §13)
 * on the representative demo listings, in a real browser:
 *
 * - axe: no serious or critical violation in the panel of a stay, a
 *   restaurant (table only and with the menu dialog / sheet step), a tour,
 *   a car rental, an attraction and an entertainment venue — on desktop
 *   (EN) and on a phone in Armenian and Russian, where text runs longest;
 * - a keyboard-only restaurant + menu flow, from the date to checkout;
 * - focus stays inside the menu dialog and the booking sheet, and returns to
 *   the control that opened them;
 * - an invalid rental interval is announced (role="alert");
 * - unavailable actions are disabled, focus is visible, touch targets meet
 *   WCAG 2.2 AA (24 × 24 px), and reduced motion removes the sheet's motion.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const LAPTOP_WIDTH = 1024;
const RESTAURANT = 'sprintj-toros-armenian-kitchen';
const CUSTOMER = {
  email: 'anna.harutyunyan@example.com',
  password: 'DemoPass!2024',
};

const LISTINGS = [
  ['hotel', 'demo-vendor-boutique-yerevan-hotel'],
  ['apartment', 'demo-vendor-yerevan-city-loft'],
  ['restaurant', RESTAURANT],
  ['tour', 'demo-vendor-dilijan-trail-tour'],
  ['car', 'demo-vendor-ararat-valley-fleet'],
  ['attraction', 'demo-vendor-certified-yerevan-city-guide'],
  ['entertainment', 'sprintj-labyrinth-escape-rooms'],
];
const CTA = {
  hotel: { en: 'Reserve', hy: 'Ամրագրել', ru: 'Забронировать' },
  apartment: { en: 'Reserve', hy: 'Ամրագրել', ru: 'Забронировать' },
  restaurant: {
    en: 'Reserve a table',
    hy: 'Ամրագրել սեղան',
    ru: 'Забронировать столик',
  },
  tour: { en: 'Book tour', hy: 'Ամրագրել տուրը', ru: 'Забронировать тур' },
  car: {
    en: 'Rent this car',
    hy: 'Վարձակալել մեքենան',
    ru: 'Арендовать автомобиль',
  },
  attraction: {
    en: 'Book visit',
    hy: 'Ամրագրել այցը',
    ru: 'Забронировать посещение',
  },
  entertainment: {
    en: 'Book session',
    hy: 'Ամրագրել սեանսը',
    ru: 'Забронировать сеанс',
  },
};
const WITH_PREORDER = {
  en: 'Table + dish pre-order',
  hy: 'Սեղան և ճաշատեսակների նախապատվեր',
  ru: 'Столик и предзаказ блюд',
};
const CHOOSE_DISHES = {
  en: 'Choose dishes',
  hy: 'Ընտրել ճաշատեսակներ',
  ru: 'Выбрать блюда',
};

test.use({ reducedMotion: 'reduce' });

function exactly(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** Axe on `selector` only, with animations settled so contrast is final. */
async function seriousOrCritical(page, selector) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }',
  });
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  return results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact))
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
}

async function openPanel(page, width, label) {
  if (width >= LAPTOP_WIDTH) {
    const panel = page.getByRole('complementary');
    await expect(
      panel.getByRole('button', { name: exactly(label) }),
    ).toBeVisible({ timeout: 15_000 });
    return { panel, selector: 'aside' };
  }
  const opener = page
    .getByRole('button', { name: exactly(label) })
    .and(page.locator(':visible'));
  await opener.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  return { panel: sheet, selector: '[role="dialog"]' };
}

/** Presses Tab until the focused element matches, within `max` presses. */
async function tabUntil(page, matches, max = 80) {
  // eslint-disable-next-line no-restricted-syntax -- one key at a time
  for (let i = 0; i < max; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab');
    // eslint-disable-next-line no-await-in-loop
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        label: el?.getAttribute('aria-label') ?? '',
        text: el?.textContent?.trim() ?? '',
        role: el?.getAttribute('role') ?? el?.tagName.toLowerCase(),
        value: el?.getAttribute('value') ?? '',
      };
    });
    if (matches(focused)) return focused;
  }
  throw new Error('The control was never reached by Tab.');
}

async function focusIsInside(page, selector) {
  return page.evaluate(
    (sel) => Boolean(document.activeElement?.closest(sel)),
    selector,
  );
}

test.describe('axe — every booking family', () => {
  test.describe.configure({ mode: 'parallel' });

  LISTINGS.forEach(([family, slug]) => {
    [
      ['en', 1440],
      ['hy', 390],
      ['ru', 390],
    ].forEach(([locale, width]) => {
      test(`${family} (${locale}, ${width}px) has no serious/critical violation`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/listings/${slug}`);
        const { selector } = await openPanel(page, width, CTA[family][locale]);
        expect(await seriousOrCritical(page, selector)).toEqual([]);
      });
    });
  });

  [
    ['en', 1440],
    ['hy', 390],
    ['ru', 390],
  ].forEach(([locale, width]) => {
    test(`restaurant + menu (${locale}, ${width}px): the dish picker has no serious/critical violation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/listings/${RESTAURANT}`);
      const { panel } = await openPanel(page, width, CTA.restaurant[locale]);
      await panel.getByText(WITH_PREORDER[locale], { exact: true }).click();
      await panel
        .getByRole('button', { name: CHOOSE_DISHES[locale], exact: true })
        .click();
      // Desktop: a dialog over the page; phone: a step inside the sheet.
      await expect(page.getByRole('dialog')).toHaveCount(1);
      expect(await seriousOrCritical(page, '[role="dialog"]')).toEqual([]);
    });
  });
});

test.describe('keyboard and focus', () => {
  test('restaurant + menu, keyboard only: date, time, party, dishes, then checkout', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel(/^Password/).fill(CUSTOMER.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/, { timeout: 15_000 });
    await page.goto(`/en/listings/${RESTAURANT}`);
    const panel = page.getByRole('complementary');
    await expect(
      panel.getByRole('button', { name: 'Reserve a table' }),
    ).toBeDisabled({ timeout: 15_000 });

    // Into the panel from the page: Tab to its date control.
    await tabUntil(page, (f) => f.text === 'Select date…');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('grid')).toBeVisible();
    // Ten days ahead on a Wednesday-to-Sunday week is always an open day
    // unless it lands on Monday; skip Monday explicitly.
    const target = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }),
    );
    let days = 10;
    while ((target.getDay() + days) % 7 === 1) days += 1;
    // eslint-disable-next-line no-restricted-syntax -- one key per day
    for (let i = 0; i < days; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Enter');

    await tabUntil(page, (f) => f.role === 'combobox');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();

    await tabUntil(page, (f) => f.label === 'Increase Party size');
    await page.keyboard.press('Enter');
    await expect(panel.getByLabel('Party size', { exact: true })).toHaveValue(
      '2',
    );
    // The focused control shows a visible focus ring.
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineStyle,
    );
    expect(outline).not.toBe('none');

    await tabUntil(page, (f) => f.value === 'table');
    await page.keyboard.press('ArrowDown');
    await expect(panel.getByLabel('Table + dish pre-order')).toBeChecked();
    await tabUntil(page, (f) => f.text === 'Choose dishes');
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Pre-order dishes' });
    await expect(dialog).toBeVisible();
    expect(await focusIsInside(page, '[role="dialog"]')).toBe(true);
    // Focus trap: forty Tabs never leave the dialog.
    // eslint-disable-next-line no-restricted-syntax -- one key at a time
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Tab');
      // eslint-disable-next-line no-await-in-loop
      expect(await focusIsInside(page, '[role="dialog"]')).toBe(true);
    }
    await tabUntil(page, (f) => f.label === 'Increase Pork khorovats');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(dialog.getByText('2 dishes selected')).toBeVisible();
    await tabUntil(page, (f) => f.text === 'Done');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    // Focus returns to the control that opened the dialog.
    await expect(
      panel.getByRole('button', { name: 'Edit dishes' }),
    ).toBeFocused();

    await tabUntil(page, (f) => f.text === 'Reserve with pre-order');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/, {
      timeout: 15_000,
    });
    await expect(page.getByText('2 × Pork khorovats')).toBeVisible();
  });

  test('Escape closes the menu dialog and returns focus to its opener', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/listings/${RESTAURANT}`);
    const panel = page.getByRole('complementary');
    await panel.getByText('Table + dish pre-order', { exact: true }).click();
    const opener = panel.getByRole('button', { name: 'Choose dishes' });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('phone sheet (HY): focus stays inside, the menu step takes focus, Back and Escape return it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/hy/listings/${RESTAURANT}`);
    const opener = page
      .getByRole('button', { name: exactly(CTA.restaurant.hy) })
      .and(page.locator(':visible'));
    await opener.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // eslint-disable-next-line no-restricted-syntax -- one key at a time
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Tab');
      // eslint-disable-next-line no-await-in-loop
      expect(await focusIsInside(page, '[role="dialog"]')).toBe(true);
    }
    await sheet.getByText(WITH_PREORDER.hy, { exact: true }).click();
    await sheet
      .getByRole('button', { name: CHOOSE_DISHES.hy, exact: true })
      .click();
    await expect(
      sheet.getByRole('heading', { name: 'Ճաշատեսակների նախապատվեր' }),
    ).toBeFocused();
    await sheet.getByRole('button', { name: 'Վերադառնալ ամրագրմանը' }).click();
    // Back returns focus to the pre-order block, still inside the sheet.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            document.activeElement?.closest('[role="dialog"]') &&
            document.activeElement.querySelector('fieldset'),
          ),
        ),
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('states, announcements, targets and motion', () => {
  test('a return before pickup is announced (role="alert") and the action stays disabled', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/listings/demo-vendor-ararat-valley-fleet');
    const panel = page.getByRole('complementary');
    const cta = panel.getByRole('button', { name: 'Rent this car' });
    await expect(cta).toBeDisabled({ timeout: 15_000 });
    await panel.getByLabel('Pickup & return dates').click();
    const day = page.getByRole('gridcell', { disabled: false }).nth(5);
    await day.click();
    await day.click();
    await panel.getByLabel('Pickup time').fill('18:00');
    await panel.getByLabel('Return time').fill('10:00');
    await expect(panel.getByRole('alert')).toHaveText(
      'Return must be after pickup. Please check the selected dates and times.',
    );
    await expect(cta).toBeDisabled();
  });

  test('a stepper at its bound is disabled, never a silent no-op', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/listings/${RESTAURANT}`);
    const panel = page.getByRole('complementary');
    await expect(
      panel.getByRole('button', { name: 'Decrease Party size' }),
    ).toBeDisabled({ timeout: 15_000 });
  });

  test('touch targets on a phone are at least 24 × 24 px (WCAG 2.2 AA)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/listings/${RESTAURANT}`);
    const { panel } = await openPanel(page, 390, 'Reserve a table');
    await panel.getByText('Table + dish pre-order', { exact: true }).click();
    const targets = [
      panel.getByRole('button', { name: 'Increase Party size' }),
      panel.getByRole('button', { name: 'Decrease Party size' }),
      panel.getByRole('button', { name: 'Choose dishes' }),
      panel.getByRole('button', { name: 'Reserve a table' }),
    ];
    // eslint-disable-next-line no-restricted-syntax -- each target in turn
    for (const target of targets) {
      // eslint-disable-next-line no-await-in-loop
      const box = await target.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('reduced motion: the booking sheet opens without animation', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/listings/${RESTAURANT}`);
    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true);
    await openPanel(page, 390, 'Reserve a table');
    const timings = await page.evaluate(() => {
      const sheet = document.querySelector('[role="dialog"]');
      const styles = getComputedStyle(sheet);
      const seconds = (value) =>
        Math.max(...value.split(',').map((part) => parseFloat(part) || 0));
      return {
        animation: seconds(styles.animationDuration),
        transition: seconds(styles.transitionDuration),
      };
    });
    // `reduced-motion-safe` collapses every duration to 0.01ms.
    expect(timings.animation).toBeLessThanOrEqual(0.001);
    expect(timings.transition).toBeLessThanOrEqual(0.001);
  });
});
