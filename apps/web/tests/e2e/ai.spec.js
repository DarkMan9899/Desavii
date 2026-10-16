/**
 * Phase 15 AI Platform: Trip Planner golden path, AI Search → real
 * filtered results, the contextual AI Assistant, Partner AI content
 * generation, and the Admin AI moderation queue — against the real
 * backend + demo-seeded dev database (`seedDemoMarketplace.js`'s 80+
 * listings give every persona real data to ground AI responses in).
 */

import { test, expect } from './fixtures.js';

async function loginAsDemoCustomer(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('anna.harutyunyan@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

async function loginAsDemoPartner(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('partner.hotels@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

async function loginAsDevAdmin(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('admin@travelhub.dev');
  await page.getByLabel(/^Password/).fill('DevAdmin!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

test.describe('AI Trip Planner', () => {
  test('plans a real trip grounded in real published listings', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/account/trip-planner');
    await expect(
      page.getByRole('heading', { name: 'AI Trip Planner' }),
    ).toBeVisible();

    await page.getByLabel('Destination').fill('Yerevan');
    await page.getByLabel('Days').fill('3');
    await page.getByLabel('Budget').fill('500');

    await page.getByRole('button', { name: 'Plan my trip' }).click();
    await expect(
      page.getByRole('heading', { name: '3-day trip to Yerevan' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Day 3' })).toBeVisible();
  });
});

test.describe('AI Search', () => {
  test('parses a natural-language query into real search filters', async ({
    page,
  }) => {
    // Every /ai/* route requires authentication.
    await loginAsDemoCustomer(page);
    await page.goto('/en/search');
    // Search & Discovery rebuild: AI search sits behind a toggle so the
    // results start higher on the page.
    await page
      .getByRole('button', { name: 'Describe your trip to AI' })
      .click();
    await page
      .getByLabel("Describe what you're looking for")
      .fill('hotels in Yerevan');
    await page.getByRole('button', { name: 'Search with AI' }).click();

    // The bar updates the URL-synced filters in place — the page never
    // navigates away from /en/search.
    await expect(page).toHaveURL(/\/en\/search/);
    await expect(page).toHaveURL(/destination=/, { timeout: 15_000 });
  });
});

test.describe('AI Assistant', () => {
  test('answers a grounded question from an authenticated page', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);

    await page.getByRole('button', { name: 'Ask AI assistant' }).click();
    await expect(
      page.getByRole('heading', { name: 'AI Assistant' }),
    ).toBeVisible();

    await page.getByLabel('Your message').fill('What can you help me with?');
    await page.getByRole('button', { name: 'Send' }).click();

    // A real assistant reply renders as a second bubble in the message
    // log (the user's own message is the first) — wait on the log's
    // content directly rather than on transient button state.
    const log = page.getByRole('log');
    await expect(log.locator('div').nth(1)).not.toHaveText('', {
      timeout: 20_000,
    });
  });
});

test.describe('Partner AI tools', () => {
  test('generates real content grounded in an existing published listing', async ({
    page,
  }) => {
    await loginAsDemoPartner(page);
    await page.goto('/en/partner/listings');

    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page).toHaveURL(/listingId=\d+/);
    const listingId = new URL(page.url()).searchParams.get('listingId');
    expect(listingId).toBeTruthy();

    await page.goto(
      `/en/partner/listings/new?listingId=${listingId}&step=review`,
    );
    await expect(
      page.getByRole('heading', { name: 'AI writing tools' }),
    ).toBeVisible();

    const descriptionRow = page
      .getByText('Description', { exact: true })
      .locator('..');
    await descriptionRow.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByLabel('Generated content')).not.toHaveValue('', {
      timeout: 15_000,
    });
  });
});

test.describe('Admin AI moderation', () => {
  test('surfaces a real moderation queue and scores a listing', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/ai/moderation');
    await expect(
      page.getByRole('heading', { name: 'AI Moderation' }),
    ).toBeVisible();

    const scoreButtons = page.getByRole('button', { name: 'Score' });
    await expect(scoreButtons.first()).toBeVisible({ timeout: 10_000 });
    await scoreButtons.first().click();

    await expect(
      page.getByRole('heading', { name: 'Listing score' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Heuristic score:')).toBeVisible();
    await expect(page.getByText('AI note:')).toBeVisible();
  });

  test('a customer cannot reach the admin AI usage dashboard', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.goto('/en/admin/ai/usage');
    // RequireRole renders an in-place "Access restricted" fallback for a
    // non-admin-area role rather than redirecting — the AI usage data
    // never loads.
    await expect(
      page.getByRole('heading', { name: 'Access restricted' }),
    ).toBeVisible();
  });
});
