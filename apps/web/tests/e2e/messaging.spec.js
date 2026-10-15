/**
 * Phase 14 Messaging Platform: bell badge/dropdown, the full Messaging
 * page (list/thread/composer/reactions/archive/attachments), real
 * cross-persona delivery via the polling transport, admin
 * `messaging.view_all` read visibility into a conversation the admin
 * doesn't participate in, and `messaging.moderate` message deletion —
 * against the real backend + demo-seeded dev database
 * (`seedDemoMarketplace.js`'s 11 seeded conversations give every persona
 * a realistic set of threads to assert against).
 */

import Redis from 'ioredis';
import { test, expect } from './fixtures.js';

// fixtures.js's own `page` fixture only flushes once, before this test's
// default `page` is handed over — tests here that open EXTRA contexts
// (customer/partner/admin cross-persona checks) log in several more times
// after that single flush, easily exceeding the real `sensitive` tier's
// 10/min budget deep into a full-suite run. Mirrors inventory.spec.js's
// identical fix: flush before every individual login call, not just once
// per test.
async function flushRateLimits() {
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
    // Fail-open — see globalSetup.js's identical rationale.
  } finally {
    redis.disconnect();
  }
}

async function loginAsDemoCustomer(
  page,
  email = 'anna.harutyunyan@example.com',
) {
  await flushRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

async function loginAsDemoPartner(page) {
  await flushRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('partner.hotels@example.com');
  await page.getByLabel(/^Password/).fill('DemoPass!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/partner$/);
}

async function loginAsAdmin(page) {
  await flushRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('admin@travelhub.dev');
  await page.getByLabel(/^Password/).fill('DevAdmin!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

function conversationListItems(page) {
  return page.getByRole('listitem').filter({ has: page.locator('button') });
}

// The customer Account Overview page also shows a "Messages" quick-link
// card alongside the persistent sidebar nav's own "Messages" item, so an
// unscoped `getByRole('link', { name: 'Messages' })` is genuinely
// ambiguous there (strict-mode violation). Scoping to the nav landmark
// (`CustomerAccountLayout.jsx`'s `Sidebar` — `ariaLabel={t('nav.account')}`,
// "My Account") resolves to the one real navigation link, regardless of
// whether a quick-link card is also present on the current page.
function customerMessagesNavLink(page) {
  return page
    .getByRole('navigation', { name: 'My Account' })
    .getByRole('link', { name: 'Messages' });
}

// Phase 14.9: "message the host about this booking" — the real entry
// point for `useCreateConversationMutation` (previously wired but never
// reachable from any UI). Reuses the customer's real demo booking
// history rather than a fixture.
test.describe('Starting a conversation from a booking', () => {
  test('clicking "Message host" opens a booking-scoped conversation, and clicking it again reopens the SAME thread', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await page.getByRole('link', { name: 'Bookings', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/bookings$/);

    const firstBookingLink = page
      .locator('a[href*="/account/bookings/"]')
      .first();
    await expect(firstBookingLink).toBeVisible();
    await firstBookingLink.click();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/);

    const messageHostButton = page.getByRole('button', {
      name: 'Message host',
    });
    await expect(messageHostButton).toBeVisible();
    await messageHostButton.click();

    await expect(page).toHaveURL(/\/en\/account\/messages\/(\d+)$/);
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({
      timeout: 10_000,
    });
    const conversationUrl = page.url();

    // Back to the same booking and click Message host a second time —
    // the backend's idempotent-by-context reuse (conversationService.js)
    // must land on the exact same conversation, never a duplicate.
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/account\/bookings\/\d+$/);
    await page.getByRole('button', { name: 'Message host' }).click();
    await expect(page).toHaveURL(conversationUrl);
  });
});

test.describe('Messaging bell', () => {
  test('opens a dropdown listing recent conversations', async ({ page }) => {
    await loginAsDemoCustomer(page);

    const bellTrigger = page.getByRole('button', { name: /Messages/ });
    await expect(bellTrigger).toBeVisible();
    await bellTrigger.click();

    await expect(page.getByText('Messages').first()).toBeVisible();
    await expect(page.getByText('View all messages')).toBeVisible();
  });
});

// Serial: every test here logs in as the same demo customer and mutates
// shared conversation state (send/react/archive) — concurrent workers
// racing over the same "first conversation" lookup would be flaky.
test.describe.serial('Messaging page (customer)', () => {
  test('lists real seeded conversations and opens a thread', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await customerMessagesNavLink(page).click();
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();

    await expect(conversationListItems(page).first()).toBeVisible({
      timeout: 10_000,
    });
    await conversationListItems(page).first().click();

    await expect(page).toHaveURL(/\/en\/account\/messages\/\d+$/);
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('sending a message shows it in the thread', async ({ page }) => {
    await loginAsDemoCustomer(page);
    await customerMessagesNavLink(page).click();
    await conversationListItems(page).first().click();
    await expect(page).toHaveURL(/\/en\/account\/messages\/\d+$/);

    const uniqueBody = `E2E message ${Date.now()}`;
    await page.getByPlaceholder('Write a message…').fill(uniqueBody);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(uniqueBody)).toBeVisible({ timeout: 10_000 });
  });

  test('searching finds a message by its body and jumps to its conversation', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await customerMessagesNavLink(page).click();
    await conversationListItems(page).first().click();
    await expect(page).toHaveURL(/\/en\/account\/messages\/(\d+)$/);
    const conversationId = page.url().match(/messages\/(\d+)$/)[1];

    const uniqueBody = `Searchable message ${Date.now()}`;
    await page.getByPlaceholder('Write a message…').fill(uniqueBody);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(uniqueBody)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder('Search conversations').fill(uniqueBody);
    const resultButton = page.getByRole('button', { name: uniqueBody });
    await expect(resultButton).toBeVisible({ timeout: 10_000 });
    await resultButton.click();

    await expect(page).toHaveURL(
      new RegExp(`/en/account/messages/${conversationId}$`),
    );
  });

  test('reacting to a message shows a reaction chip', async ({ page }) => {
    await loginAsDemoCustomer(page);
    await customerMessagesNavLink(page).click();
    await conversationListItems(page).first().click();
    await expect(page).toHaveURL(/\/en\/account\/messages\/\d+$/);
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Thumbs up' }).first().click();
    await expect(page.getByText('1').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('archiving a conversation moves it into the Archived tab', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await customerMessagesNavLink(page).click();
    await conversationListItems(page).first().click();
    await expect(page).toHaveURL(/\/en\/account\/messages\/\d+$/);

    const archiveButton = page.getByRole('button', { name: 'Archive' });
    await expect(archiveButton).toBeVisible({ timeout: 10_000 });
    await archiveButton.click();
    await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(conversationListItems(page).first()).toBeVisible({
      timeout: 10_000,
    });

    // Revert so the demo-seeded baseline stays clean for other test runs.
    await page.getByRole('button', { name: 'Unarchive' }).click();
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('attaching an image shows it as a thumbnail in the thread', async ({
    page,
  }) => {
    await loginAsDemoCustomer(page);
    await customerMessagesNavLink(page).click();
    await page.getByRole('tab', { name: 'All' }).click();
    await conversationListItems(page).first().click();
    await expect(page).toHaveURL(/\/en\/account\/messages\/\d+$/);
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({
      timeout: 10_000,
    });

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Attach a file' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'e2e-attachment.png',
      mimeType: 'image/png',
      // A minimal valid 1x1 transparent PNG.
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });

    // The upload is a separate async request from selecting the file —
    // wait for it to land in the pending-attachments list before sending,
    // otherwise Send is still disabled (no body, no attachment yet).
    await expect(page.getByText('IMAGE')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByAltText('Attachment').last()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Cross-persona delivery', () => {
  test('a message sent by a customer is seen by the partner in a second context', async ({
    browser,
  }) => {
    const customerContext = await browser.newContext();
    const partnerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    const partnerPage = await partnerContext.newPage();

    try {
      await loginAsDemoCustomer(customerPage, 'davit.sargsyan@example.com');
      await customerMessagesNavLink(customerPage).click();
      await conversationListItems(customerPage).first().click();
      await expect(customerPage).toHaveURL(/\/en\/account\/messages\/\d+$/);

      const uniqueBody = `Cross-persona E2E ${Date.now()}`;
      await customerPage.getByPlaceholder('Write a message…').fill(uniqueBody);
      await customerPage.getByRole('button', { name: 'Send' }).click();
      await expect(customerPage.getByText(uniqueBody)).toBeVisible({
        timeout: 10_000,
      });

      await loginAsDemoPartner(partnerPage);
      await partnerPage.getByRole('link', { name: 'Messages' }).click();
      await expect(conversationListItems(partnerPage).first()).toBeVisible({
        timeout: 10_000,
      });
      await conversationListItems(partnerPage).first().click();
      await expect(partnerPage).toHaveURL(/\/en\/partner\/messages\/\d+$/);

      // The transport polls every 4s (`messagingTransport.js`) — give it
      // a couple of cycles to pick up the new message.
      await expect(partnerPage.getByText(uniqueBody)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await customerContext.close();
      await partnerContext.close();
    }
  });
});

test.describe('Admin moderation & view_all visibility', () => {
  test('an admin can read a conversation they do not participate in, and delete a message in it', async ({
    browser,
  }) => {
    const customerContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    const adminPage = await adminContext.newPage();

    try {
      await loginAsDemoCustomer(customerPage);
      await customerMessagesNavLink(customerPage).click();
      await conversationListItems(customerPage).first().click();
      await expect(customerPage).toHaveURL(/\/en\/account\/messages\/(\d+)$/);
      const conversationUrl = customerPage.url();
      const conversationId = conversationUrl.match(/messages\/(\d+)$/)[1];

      const uniqueBody = `Moderation target ${Date.now()}`;
      await customerPage.getByPlaceholder('Write a message…').fill(uniqueBody);
      await customerPage.getByRole('button', { name: 'Send' }).click();
      await expect(customerPage.getByText(uniqueBody)).toBeVisible({
        timeout: 10_000,
      });

      await loginAsAdmin(adminPage);
      await adminPage.goto(`/en/admin/messages/${conversationId}`);

      await expect(adminPage.getByText(uniqueBody)).toBeVisible({
        timeout: 10_000,
      });
      // Not a participant: no composer, no archive control — only
      // read + moderate access (see ChatWindow.jsx's `isParticipant` gate).
      await expect(
        adminPage.getByPlaceholder('Write a message…'),
      ).not.toBeVisible();
      await expect(
        adminPage.getByRole('button', { name: 'Archive' }),
      ).not.toBeVisible();

      const messageRow = adminPage
        .getByText(uniqueBody)
        .locator('xpath=ancestor::li');
      await messageRow.getByRole('button', { name: 'Delete message' }).click();
      await expect(adminPage.getByText(uniqueBody)).toHaveCount(0, {
        timeout: 10_000,
      });
    } finally {
      await customerContext.close();
      await adminContext.close();
    }
  });
});
