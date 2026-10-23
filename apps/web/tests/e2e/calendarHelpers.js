/**
 * Shared Partner Calendar / inventory e2e helpers (Calendar Excellence):
 * dev accounts, rate-limit isolation, fixture listing lookup, calendar
 * navigation and the date formats the calendar's accessible names use.
 * Extracted from `inventory.spec.js` so every calendar spec drives the UI
 * the same way.
 */

import Redis from 'ioredis';
import { expect, request as playwrightRequest } from './fixtures.js';
import { getBusinessToday } from '../../src/utils/businessDate.js';

export const API_BASE = 'http://localhost:4000/api/v1/';
export const VENDOR = {
  email: 'vendor@travelhub.dev',
  password: 'DevVendor!2024',
};
export const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
/**
 * This spec is far more request-heavy than any other single spec file:
 * ~12 UI logins (sensitive tier, real ceiling 10/min) across 8 tests,
 * plus every page navigation fans out into several API calls (auth/me,
 * listing detail, availability-summary, calendar, units...) against the
 * real platform-wide `publicRateLimiter` (20/min, applied to every
 * request in `app.js`, including unauthenticated `resolveListingId`
 * lookups) and `authenticatedRateLimiter` (300/min, but shared with the
 * `sensitive` tier's own request volume). `globalSetup.js` only flushes
 * once at the very start of the whole suite, which isn't enough headroom
 * for this file's own volume. Mirrors
 * `apps/api/tests/integration/helpers/resetRateLimits.js`'s identical
 * fix (same Redis-backed counters, same four tiers) — clearing the
 * counter here is a test-isolation measure, never a change to the real
 * rate-limit config.
 */
export async function flushRateLimits() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const tiers = ['public', 'authenticated', 'sensitive', 'ai'];
    const keys = (
      await Promise.all([
        ...tiers.map((tier) => redis.keys(`ratelimit:${tier}:*`)),
        redis.keys('session:login_attempts:*'),
      ])
    ).flat();
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Same fail-open rationale as globalSetup.js — a reset failure here
    // must never fail the test run over a best-effort isolation step.
  } finally {
    redis.disconnect();
  }
}

export async function resolveListingId(slug) {
  await flushRateLimits();
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  const res = await ctx.get(`search?keyword=${encodeURIComponent(slug)}`);
  const body = await res.json();
  const match = (body.data ?? []).find((listing) => listing.slug === slug);
  await ctx.dispose();
  if (!match) {
    throw new Error(
      `Fixture listing "${slug}" not found via search — did the Phase 17 demo seed run? status=${res.status()} body=${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return match.id;
}

// Matches `DatePicker.jsx`/`PartnerCalendarEditor.jsx`'s own `dayFormatter`
// (both use Intl's `month: 'short'`, e.g. "Nov 22, 2026") — NOT `'long'`,
// which never matches either component's real gridcell aria-label.
export function accessibleDayName(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${monthName} ${day}, ${year}`;
}

export async function clickNextMonthUntil(page, isoDate, times) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential UI navigation, one click per iteration
    await page.getByRole('button', { name: 'Next month' }).click();
  }
}

/**
 * Month-grid "next month" clicks from the month the Partner Calendar opens
 * on — the Asia/Yerevan month, never the test machine's local one.
 */
export function monthsFromToday(isoDate, now = new Date()) {
  const [targetYear, targetMonth] = isoDate.split('-').map(Number);
  const [year, month] = getBusinessToday(now).split('-').map(Number);
  return (targetYear - year) * 12 + (targetMonth - month);
}

export async function login(page, { email, password }, expectedUrlPattern) {
  await flushRateLimits();
  // These flows switch accounts on one page (partner, then customer).
  // `/auth/login` sends a signed-in user on to their workspace, so start
  // each login signed out: the session lives in the refresh-token and
  // `session_hint` cookies.
  await page.context().clearCookies();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

/** Navigates the Partner Calendar to a listing/resource and selects a single future day. */
export async function openPartnerCalendarDay(
  page,
  { listingLabel, unitLabel, iso },
) {
  await page.goto('/en/partner/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Listing', exact: true }).click();
  await page.getByRole('option', { name: listingLabel, exact: true }).click();

  if (unitLabel) {
    await page.getByRole('button', { name: unitLabel, exact: true }).click();
  }

  await clickNextMonthUntil(page, iso, monthsFromToday(iso));
  // PartnerCalendarEditor appends a status suffix to the day cell's
  // accessible name (e.g. ", Available") for any date within the
  // currently-viewed month — unlike the customer DatePicker, which never
  // does. A starts-with match keeps this robust either way.
  await page
    .getByRole('gridcell', {
      name: new RegExp(`^${accessibleDayName(iso)}`),
    })
    .click();
}
