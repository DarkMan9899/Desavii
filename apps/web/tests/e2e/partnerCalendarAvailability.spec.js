/**
 * Calendar Excellence — the Partner Calendar end to end, against the real
 * API and the demo-seeded `travelhub_test` database.
 *
 * 1. A hotel partner blocks two nights, edits the block and removes it,
 *    entirely through the UI; after every step the PUBLIC availability
 *    summary (what customers and Search read) shows exactly that: two
 *    nights taken, the checkout day untouched, then the edit, then
 *    nothing.
 * 2. A multi-room hotel's Listing Detail never asks for a unit-ambiguous
 *    calendar (the old `AMBIGUOUS_UNIT` 422).
 * 3. Just after midnight in Yerevan — while it is still the previous day
 *    in UTC — the Partner Calendar and Listing Detail both use the
 *    Yerevan date, and a customer's date picker opens on it even in a
 *    browser west of UTC.
 *
 * Every date is a fresh offset three months out, so runs never collide
 * with the seed's own scenario dates or with each other.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, request as playwrightRequest } from './fixtures.js';
import {
  API_BASE,
  VENDOR,
  flushRateLimits,
  resolveListingId,
  accessibleDayName,
  login,
  openPartnerCalendarDay,
} from './calendarHelpers.js';
import {
  addBusinessDays,
  getBusinessToday,
} from '../../src/utils/businessDate.js';

const HOTEL_SLUG = 'demo-vendor-boutique-yerevan-hotel';
const HOTEL_LABEL = 'Boutique Yerevan Hotel';
const ROOM_LABEL = 'Standard Room';
const MONTHS_AHEAD = 3;
// Days 5–19 of the month, so the whole stay stays inside one month grid.
const FIRST_DAY_OF_RANGE = 5;
const RUN_SALT_DAYS = Date.now() % 15;
const NIGHTS = 2;

function stayDates() {
  const [year, month] = getBusinessToday().split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + MONTHS_AHEAD, 1));
  target.setUTCDate(FIRST_DAY_OF_RANGE + RUN_SALT_DAYS);
  const checkIn = target.toISOString().slice(0, 10);
  return {
    checkIn,
    secondNight: addBusinessDays(checkIn, 1),
    checkOut: addBusinessDays(checkIn, NIGHTS),
  };
}

async function publicJson(path) {
  await flushRateLimits();
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.get(path);
  const body = await res.json();
  await ctx.dispose();
  return body.data;
}

async function resolveRoom(listingId) {
  const units = await publicJson(`availability/${listingId}/units`);
  const room = units.find((unit) => unit.unit_label === ROOM_LABEL);
  expect(room).toBeDefined();
  return room;
}

/** Rooms of `unitId` the public summary still offers on each date. */
async function remainingRooms(listingId, unitId, dates) {
  const entries = await Promise.all(
    dates.map(async (date) => {
      const summary = await publicJson(
        `availability/${listingId}/availability-summary?from=${date}&to=${date}`,
      );
      return [
        date,
        summary.find((row) => row.unit_id === unitId).remaining_count,
      ];
    }),
  );
  return Object.fromEntries(entries);
}

const englishRange = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function displayRange(from, to) {
  return englishRange.formatRange(
    new Date(`${from}T00:00:00Z`),
    new Date(`${to}T00:00:00Z`),
  );
}

test.beforeEach(async () => {
  await flushRateLimits();
});

test.describe('Partner Calendar — block, edit and remove a hotel block', () => {
  test('every change reaches public availability, nights checkout-exclusive', async ({
    page,
  }) => {
    const listingId = await resolveListingId(HOTEL_SLUG);
    const room = await resolveRoom(listingId);
    const { checkIn, secondNight, checkOut } = stayDates();
    const dates = [checkIn, secondNight, checkOut];
    const before = await remainingRooms(listingId, room.id, dates);

    await login(page, VENDOR, /\/en\/partner$/);
    await openPartnerCalendarDay(page, {
      listingLabel: HOTEL_LABEL,
      unitLabel: ROOM_LABEL,
      iso: checkIn,
    });
    await page
      .getByRole('gridcell', {
        name: new RegExp(`^${accessibleDayName(checkOut)}`),
      })
      .click();

    await page.getByRole('tab', { name: 'Block dates', exact: true }).click();
    await page.getByLabel('Quantity to block').fill('1');
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await expect(page.getByText('Dates blocked.')).toBeVisible({
      timeout: 10_000,
    });

    const ourBlock = page
      .getByRole('list', { name: /^Active blocks/ })
      .getByRole('listitem')
      .filter({ hasText: displayRange(checkIn, checkOut) });
    await expect(ourBlock).toBeVisible({ timeout: 10_000 });
    await expect(ourBlock).toContainText(`${NIGHTS} nights`);

    // Two nights taken; the checkout morning is still free.
    expect(await remainingRooms(listingId, room.id, dates)).toEqual({
      [checkIn]: before[checkIn] - 1,
      [secondNight]: before[secondNight] - 1,
      [checkOut]: before[checkOut],
    });

    await ourBlock.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit block' });
    await expect(dialog).toBeVisible();
    // Scan the dialog at rest: mid fade-in, axe samples text blended toward
    // the backdrop and reports a contrast failure the settled dialog does
    // not have (same hazard `inventoryAccessibility.spec.js` documents).
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished),
      ),
    );
    const violations = (
      await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
    ).violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact),
    );
    expect(violations).toEqual([]);

    await dialog.getByLabel(/Quantity to block/).fill('2');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Block updated.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog).toBeHidden();
    await expect(ourBlock).toContainText('2');

    expect(await remainingRooms(listingId, room.id, dates)).toEqual({
      [checkIn]: before[checkIn] - 2,
      [secondNight]: before[secondNight] - 2,
      [checkOut]: before[checkOut],
    });

    await ourBlock
      .getByRole('button', { name: 'Unblock', exact: true })
      .click();
    await expect(ourBlock).toBeHidden({ timeout: 10_000 });
    expect(await remainingRooms(listingId, room.id, dates)).toEqual(before);
  });
});

test.describe('Listing Detail — a multi-room hotel', () => {
  test('never asks for a unit-ambiguous calendar and shows its availability', async ({
    page,
  }) => {
    const listingId = await resolveListingId(HOTEL_SLUG);
    const refused = [];
    page.on('response', (response) => {
      if (
        response.url().includes('/availability/') &&
        response.status() >= 400
      ) {
        refused.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`/en/listings/${listingId}`);
    await expect(
      page.getByRole('heading', { name: 'Availability', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    expect(refused).toEqual([]);
    await expect(
      page.getByText("We couldn't load availability for this listing."),
    ).toHaveCount(0);
  });
});

test.describe('Just after midnight in Yerevan', () => {
  // A browser in UTC: at 20:30 UTC it is still "yesterday" there, but
  // already 00:30 tomorrow in Yerevan — the business date.
  test.use({ timezoneId: 'UTC' });

  const utcToday = new Date().toISOString().slice(0, 10);
  const instant = new Date(`${utcToday}T20:30:00Z`);
  const yerevanDate = getBusinessToday(instant);

  test('the Partner Calendar marks the Yerevan date as today', async ({
    page,
  }) => {
    expect(yerevanDate).toBe(addBusinessDays(utcToday, 1));
    await login(page, VENDOR, /\/en\/partner$/);
    await page.clock.setFixedTime(instant);
    await page.goto('/en/partner/calendar');

    await expect(
      page.locator('[role="gridcell"][aria-current="date"]'),
    ).toHaveAccessibleName(new RegExp(`^${accessibleDayName(yerevanDate)}`), {
      timeout: 15_000,
    });
  });

  test('Listing Detail reads availability from the Yerevan date', async ({
    page,
  }) => {
    const listingId = await resolveListingId(HOTEL_SLUG);
    await page.clock.setFixedTime(instant);
    const summaryRequest = page.waitForRequest((request) =>
      request.url().includes('/availability-summary'),
    );
    await page.goto(`/en/listings/${listingId}`);

    const url = new URL((await summaryRequest).url());
    expect(url.searchParams.get('from')).toBe(yerevanDate);
    expect(url.searchParams.get('to')).toBe(addBusinessDays(yerevanDate, 29));
  });
});

test.describe('A customer west of UTC just after midnight in Yerevan', () => {
  // 20:30 UTC is 16:30 in New York (still "today" there) and 00:30
  // tomorrow in Yerevan — the date every booking rule uses.
  test.use({ timezoneId: 'America/New_York' });

  const utcToday = new Date().toISOString().slice(0, 10);
  const instant = new Date(`${utcToday}T20:30:00Z`);
  const yerevanDate = getBusinessToday(instant);

  test('the Listing Detail date picker opens on the Yerevan today', async ({
    page,
  }) => {
    const listingId = await resolveListingId(HOTEL_SLUG);
    await page.clock.setFixedTime(instant);
    await page.goto(`/en/listings/${listingId}`);
    await page.getByLabel('Dates').click();

    const today = page.getByRole('gridcell', {
      name: accessibleDayName(yerevanDate),
      exact: true,
    });
    await expect(today).toHaveAttribute('aria-current', 'date');
    await expect(today).toBeEnabled();
    // The New York date is already in the past in Yerevan. On the 1st it
    // belongs to the previous month, which the picker does not show.
    const newYorkDate = addBusinessDays(yerevanDate, -1);
    if (newYorkDate.slice(0, 7) === yerevanDate.slice(0, 7)) {
      await expect(
        page.getByRole('gridcell', {
          name: accessibleDayName(newYorkDate),
          exact: true,
        }),
      ).toBeDisabled();
    }
  });
});
