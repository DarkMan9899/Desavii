/**
 * Category-aware booking panel (docs/BOOKING_WIDGET_REBUILD.md §8) — the
 * real page, in a real browser, on each category's representative demo
 * listing:
 *
 * - HY / EN / RU at 390, 430, 768, 1024, 1280, 1440 and 1920 px: the panel
 *   (the pinned sidebar from laptop, the booking sheet below it) names its
 *   action in the flow's own words, never shows another category's fields
 *   (a car has no guests, a table no count, a tour no range), never
 *   overflows, and logs no console error;
 * - a restaurant table reservation without dishes, and with a dish
 *   pre-order chosen in the desktop dialog and in the mobile sheet's own
 *   step — booked end to end, and read back by the guest and the partner.
 */

import path from 'node:path';
import { test, expect } from './fixtures.js';
import { expectNoHorizontalOverflow } from './selectAssertions.js';
import { VISUAL_QA_OUTPUT_DIR } from './visualQa.js';
import {
  accessibleDayName,
  clickNextMonthUntil,
  monthsFromToday,
} from './calendarHelpers.js';

const WIDTHS = [390, 430, 768, 1024, 1280, 1440, 1920];
const LOCALES = ['hy', 'en', 'ru'];
const LAPTOP_WIDTH = 1024;
const RESTAURANT = 'sprintj-toros-armenian-kitchen';

const CTA = {
  stay: { en: 'Reserve', hy: 'Ամրագրել', ru: 'Забронировать' },
  restaurant: {
    en: 'Reserve a table',
    hy: 'Ամրագրել սեղան',
    ru: 'Забронировать столик',
  },
  tour: { en: 'Book tour', hy: 'Ամրագրել տուրը', ru: 'Забронировать тур' },
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
  vehicle: {
    en: 'Rent this car',
    hy: 'Վարձակալել մեքենան',
    ru: 'Арендовать автомобиль',
  },
};
const GUESTS = { en: 'Guests', hy: 'Հյուրեր', ru: 'Гости' };

// Each category's representative demo listing and the action it offers.
const CATEGORIES = [
  ['hotels', 'demo-vendor-boutique-yerevan-hotel', 'stay'],
  ['apartments', 'demo-vendor-yerevan-city-loft', 'stay'],
  ['villas', 'sprintj-dilijan-forest-villa', 'stay'],
  ['guest-houses', 'sprintj-goris-cave-country-guesthouse', 'stay'],
  ['restaurants', RESTAURANT, 'restaurant'],
  ['tours', 'demo-vendor-dilijan-trail-tour', 'tour'],
  ['car-rentals', 'demo-vendor-ararat-valley-fleet', 'vehicle'],
  ['attractions', 'demo-vendor-certified-yerevan-city-guide', 'attraction'],
  ['entertainment-venues', 'sprintj-labyrinth-escape-rooms', 'entertainment'],
];
// Flows that never ask for a separate guest count.
const WITHOUT_GUESTS = new Set([
  'restaurant',
  'tour',
  'attraction',
  'entertainment',
  'vehicle',
]);

const CUSTOMER = {
  email: 'anna.harutyunyan@example.com',
  password: 'DemoPass!2024',
};
const PARTNER = {
  email: 'partner.taste-collective@example.com',
  password: 'DemoPass!2024',
};

/** Screenshot evidence, kept with the other visual-QA captures. */
async function visualQaScreenshot(page, name) {
  await page.screenshot({
    path: path.join(VISUAL_QA_OUTPUT_DIR, `${name}.png`),
  });
}

function exactly(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** The visible booking panel: the sidebar from laptop, else the sheet. */
async function openPanel(page, width, ctaLabel) {
  if (width >= LAPTOP_WIDTH) return page.getByRole('complementary');
  await page
    .getByRole('button', { name: exactly(ctaLabel) })
    .and(page.locator(':visible'))
    .click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  return sheet;
}

async function login(page, { email, password }, landing) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(landing, { timeout: 15_000 });
}

/** A date in the panel's own calendar, `days` from today. */
async function pickDayAhead(panel, page, days) {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() + days);
  const iso = day.toISOString().slice(0, 10);
  await panel.getByLabel('Date', { exact: true }).click();
  await clickNextMonthUntil(page, iso, monthsFromToday(iso));
  await page
    .getByRole('gridcell', { name: accessibleDayName(iso), exact: true })
    .click();
}

test.describe('booking panel — every category, locale and width', () => {
  test.describe.configure({ mode: 'parallel' });

  CATEGORIES.forEach(([category, slug, flow]) => {
    LOCALES.forEach((locale) => {
      test(`${category} (${locale}) names its action "${CTA[flow][locale]}" and shows only its own fields`, async ({
        page,
      }) => {
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        const ctaLabel = CTA[flow][locale];

        // eslint-disable-next-line no-restricted-syntax -- one page, widths in order
        for (const width of WIDTHS) {
          // eslint-disable-next-line no-await-in-loop -- sequential by design
          await page.setViewportSize({ width, height: 900 });
          // eslint-disable-next-line no-await-in-loop
          await page.goto(`/${locale}/listings/${slug}`);
          // eslint-disable-next-line no-await-in-loop
          const panel = await openPanel(page, width, ctaLabel);
          // eslint-disable-next-line no-await-in-loop
          await expect(
            panel.getByRole('button', { name: exactly(ctaLabel) }),
          ).toBeVisible({ timeout: 15_000 });
          if (WITHOUT_GUESTS.has(flow)) {
            // eslint-disable-next-line no-await-in-loop
            await expect(
              panel.getByLabel(GUESTS[locale], { exact: true }),
            ).toHaveCount(0);
          }
          // eslint-disable-next-line no-await-in-loop
          await expectNoHorizontalOverflow(page);
          if (width === 390 || width === 1440) {
            // eslint-disable-next-line no-await-in-loop
            await visualQaScreenshot(
              page,
              `booking-${category}-${locale}-${width}`,
            );
          }
        }
        expect(errors).toEqual([]);
      });
    });
  });
});

// §10: Toros runs a late-night service on Friday and Saturday until 02:00.
// A reservation names its real calendar date: Friday's after-midnight tail
// is offered on Saturday, Saturday's on Sunday, before the day's own hours.
const LATE_NIGHT = {
  en: {
    date: 'Date',
    time: 'Reservation time',
    hint: 'Open until 02:00 — times after midnight are on the next date.',
  },
  hy: {
    date: 'Ամսաթիվ',
    time: 'Ամրագրման ժամը',
    hint: 'Բաց է մինչև 02:00․ կեսգիշերից հետո ժամերն ընտրեք հաջորդ օրվա համար։',
  },
  ru: {
    date: 'Дата',
    time: 'Время бронирования',
    hint: 'Открыто до 02:00 — время после полуночи выбирайте на следующую дату.',
  },
};

/** Days from today (Asia/Yerevan) to the first `dayOfWeek` at least `min` days out. */
function daysUntil(dayOfWeek, min) {
  const yerevanToday = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }),
  );
  let days = min;
  while ((yerevanToday.getDay() + days) % 7 !== dayOfWeek) days += 1;
  return days;
}

/**
 * Chooses a date with the keyboard only: open, arrow forward `days`, Enter.
 * The grid starts on today, or on the date already chosen.
 */
async function pickDayByKeyboard(panel, page, label, days) {
  await panel.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  // eslint-disable-next-line no-restricted-syntax -- one key per day
  for (let i = 0; i < days; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Enter');
}

async function offeredTimes(panel, page, label) {
  await panel.getByRole('combobox', { name: label }).click();
  const times = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  return times;
}

test.describe('restaurant — late-night hours past midnight', () => {
  ['en', 'hy', 'ru'].forEach((locale) => {
    [390, 768, 1024, 1440].forEach((width) => {
      test(`${locale} at ${width}px: Friday says where its after-midnight times are; Sunday offers Saturday's tail first`, async ({
        page,
      }) => {
        const text = LATE_NIGHT[locale];
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/listings/${RESTAURANT}`);
        const panel = await openPanel(page, width, CTA.restaurant[locale]);

        await pickDayByKeyboard(panel, page, text.date, daysUntil(5, 7));
        await expect(panel.getByText(text.hint, { exact: true })).toBeVisible();
        await visualQaScreenshot(
          page,
          `restaurant-late-night-${locale}-${width}`,
        );
        const friday = await offeredTimes(panel, page, text.time);
        expect(friday[0]).toBe('11:00');
        expect(friday.at(-1)).toBe('23:30');

        // From the chosen Friday, two days on is Sunday.
        await pickDayByKeyboard(panel, page, text.date, 2);
        const sunday = await offeredTimes(panel, page, text.time);
        expect(sunday.slice(0, 5)).toEqual([
          '00:00',
          '00:30',
          '01:00',
          '01:30',
          '12:00',
        ]);
        await expect(panel.getByText(text.hint, { exact: true })).toHaveCount(
          0,
        );
        await expectNoHorizontalOverflow(page);
      });
    });
  });

  test('a 01:00 reservation in Saturday night’s tail is held on Sunday, at 01:00', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${RESTAURANT}`);
    const panel = page.getByRole('complementary');
    const days = daysUntil(0, 14);
    await pickDayByKeyboard(panel, page, 'Date', days);
    await panel.getByRole('combobox', { name: 'Reservation time' }).click();
    await page.getByRole('option', { name: '01:00', exact: true }).click();

    const holdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/booking-holds') &&
        response.request().method() === 'POST',
    );
    await panel
      .getByRole('button', { name: exactly('Reserve a table') })
      .click();
    const response = await holdResponse;
    expect(response.status()).toBe(201);
    const [item] = (await response.json()).data.items;
    const expectedDate = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }),
    );
    expectedDate.setDate(expectedDate.getDate() + days);
    const iso = `${expectedDate.getFullYear()}-${String(
      expectedDate.getMonth() + 1,
    ).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`;
    expect(item.date_from).toBe(iso);
    expect(item.start_time).toBe('01:00');
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
    await expect(page.getByText(iso)).toBeVisible();
  });
});

test.describe('restaurant — table reservation and dish pre-order', () => {
  test('a table without dishes: open times only, party size, booked free', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${RESTAURANT}`);
    const panel = page.getByRole('complementary');

    await expect(panel.getByLabel('Guests', { exact: true })).toHaveCount(0);
    await pickDayAhead(panel, page, 40);
    await panel.getByRole('combobox', { name: 'Reservation time' }).click();
    await page.getByRole('option', { name: '13:00', exact: true }).click();
    await panel.getByRole('button', { name: 'Increase Party size' }).click();
    await panel
      .getByRole('button', { name: exactly('Reserve a table') })
      .click();

    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
    await expect(page.getByText('Dish pre-order')).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm booking request' }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/, {
      timeout: 15_000,
    });
    await expect(page.getByText('Reservation: Table only')).toBeVisible();
  });

  test('a dish pre-order chosen in the desktop dialog reaches the guest and the partner', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${RESTAURANT}`);
    const panel = page.getByRole('complementary');

    await pickDayAhead(panel, page, 41);
    await panel.getByRole('combobox', { name: 'Reservation time' }).click();
    await page.getByRole('option', { name: '19:00', exact: true }).click();
    await panel.getByText('Table + dish pre-order', { exact: true }).click();
    await panel.getByRole('button', { name: 'Choose dishes' }).click();

    const dialog = page.getByRole('dialog', { name: 'Pre-order dishes' });
    await expect(dialog).toBeVisible();
    // The partner switched the seasonal dish off: it is not offered.
    await expect(dialog.getByText('Ghapama (seasonal)')).toHaveCount(0);
    await dialog
      .getByRole('button', { name: 'Increase Pork khorovats' })
      .click();
    await dialog
      .getByRole('button', { name: 'Increase Pork khorovats' })
      .click();
    await dialog
      .getByRole('button', { name: 'Increase Dolma (6 pcs)' })
      .click();
    await expect(dialog.getByText('3 dishes selected')).toBeVisible();
    await visualQaScreenshot(page, 'restaurant-preorder-dialog-en-1440');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      panel.getByRole('button', { name: 'Edit dishes' }),
    ).toBeFocused();

    await panel
      .getByRole('button', { name: exactly('Reserve with pre-order') })
      .click();
    await expect(page).toHaveURL(/\/en\/booking\/checkout$/);
    await expect(page.getByText('2 × Pork khorovats')).toBeVisible();
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/bookings') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirm booking request' }).click();
    const body = await (await created).json();
    const [item] = body.data.items;
    // The server priced the dishes itself; the reservation stays free.
    expect(body.data.total_amount).toBe('0.00');
    expect(body.data.payment_required).toBe(false);
    expect(item.menu_preorder.subtotal_amount).toBe('13800.00');
    expect(item.menu_preorder.payment).toBe('PAY_AT_VENUE');

    await expect(
      page.getByText('Reservation: Table with dish pre-order'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Pre-order subtotal')).toBeVisible();

    await page.context().clearCookies();
    await login(page, PARTNER, /\/en\/partner/);
    await page.goto(`/en/partner/bookings/${body.data.id}`);
    await expect(
      page.getByText('Reservation: Table with dish pre-order'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('2 × Pork khorovats')).toBeVisible();
  });

  test('mobile (HY, 390): the menu is a step of the booking sheet and Back keeps the form', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/hy/listings/${RESTAURANT}`);
    const sheet = await openPanel(page, 390, CTA.restaurant.hy);

    await sheet
      .getByRole('button', { name: 'Ավելացնել՝ Հյուրերի քանակ' })
      .click();
    await sheet
      .getByText('Սեղան և ճաշատեսակների նախապատվեր', { exact: true })
      .click();
    await sheet.getByRole('button', { name: 'Ընտրել ճաշատեսակներ' }).click();

    // One dialog only — the sheet itself — showing the Armenian menu.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(
      sheet.getByRole('heading', { name: 'Ճաշատեսակների նախապատվեր' }),
    ).toBeFocused();
    await sheet
      .getByRole('button', { name: 'Ավելացնել՝ Խոզի խորոված' })
      .click();
    await expect(sheet.getByText('Ընտրված է 1 ճաշատեսակ')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await visualQaScreenshot(page, 'restaurant-preorder-sheet-hy-390');
    await sheet.getByRole('button', { name: 'Վերադառնալ ամրագրմանը' }).click();

    await expect(
      sheet.getByLabel('Հյուրերի քանակ', { exact: true }),
    ).toHaveValue('2');
    await expect(
      sheet.getByRole('button', { name: exactly('Ամրագրել նախապատվերով') }),
    ).toBeVisible();
  });
});
