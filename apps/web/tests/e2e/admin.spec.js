/**
 * Phase 11 Admin Platform (Stage 11.0): role-aware login redirect to
 * `/admin`, the Dashboard's real marketplace metrics, and RBAC denial
 * for a non-admin-area role — against the real backend + demo-seeded
 * test database. Uses the seeded dev SUPER_ADMIN account
 * (`admin@travelhub.dev`) since it exists regardless of demo-seed state,
 * and the seeded dev CUSTOMER account for the negative-access case.
 */

import { test, expect } from './fixtures.js';

async function loginAsDevAdmin(page) {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill('admin@travelhub.dev');
  await page.getByLabel('Password').fill('DevAdmin!2024');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

test.describe('Admin login redirect', () => {
  test('a SUPER_ADMIN account is redirected straight to /admin', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await expect(
      page.getByRole('heading', { name: 'Marketplace overview' }),
    ).toBeVisible();
  });
});

test.describe('Admin dashboard', () => {
  test('shows real marketplace counts', async ({ page }) => {
    await loginAsDevAdmin(page);
    // "Users"/"Partners" alone are ambiguous now that the sidebar also
    // has a "Users" nav link — assert stat labels unique to the
    // dashboard's own cards instead.
    await expect(page.getByText('Published listings')).toBeVisible();
    await expect(
      page.getByText('Completed bookings', { exact: true }),
    ).toBeVisible();
    // 2026 Admin redesign renamed this section's heading to lead with
    // the dashboard's own organizing question, per its own header
    // comment — same real "Needs your attention" panel, new copy.
    await expect(page.getByText('Needs your attention')).toBeVisible();
  });
});

test.describe('Admin RBAC denial', () => {
  test('a CUSTOMER account visiting /admin directly sees the 403 page, not the dashboard', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel('Password').fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/admin');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });

  test('a CUSTOMER account visiting /admin/users directly sees the 403 page', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel('Password').fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/admin/users');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });
});

test.describe('Admin User Management (Stage 11.1)', () => {
  test('lists real seeded users, filters by keyword, and opens a detail page', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/users$/);

    // 28+ seeded users exist, cursor-paginated newest-first — the dev
    // vendor account (an early, low id) isn't guaranteed to be on page
    // one, so filter by keyword before asserting it's visible.
    await page.getByLabel('Search users').fill('vendor@travelhub.dev');
    await page.keyboard.press('Enter');
    await expect(page.getByText('vendor@travelhub.dev')).toBeVisible();

    await page.getByRole('link', { name: 'Dev Vendor' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/users\/\d+$/);
    await expect(page.getByText('vendor@travelhub.dev')).toBeVisible();
    await expect(page.getByText('Booking history')).toBeVisible();
    await expect(page.getByText('Partner memberships')).toBeVisible();
  });

  test('suspending and reactivating a user updates the status badge live', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/users');
    await page.getByLabel('Search users').fill('vendor@travelhub.dev');
    await page.keyboard.press('Enter');
    // Filtered to exactly one row, so the row's own "Suspend" button is
    // unique until the confirmation modal opens its own second one.
    await expect(page.getByRole('button', { name: 'Suspend' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Suspend' }).click();
    await page.getByRole('button', { name: 'Suspend' }).last().click();
    await expect(page.getByText('User suspended.')).toBeVisible();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Activate' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByRole('button', { name: 'Activate' }).last().click();
    await expect(page.getByText('User reactivated.')).toBeVisible();
  });
});

test.describe('Admin Partner Management (Stage 11.2)', () => {
  test('lists real seeded partners, filters by keyword, and opens a detail page', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    // `exact: true` — without it this also substring-matches the
    // Dashboard's own "Partners awaiting verification" attention tile
    // (2026 Admin redesign), a real, separate link.
    await page.getByRole('link', { name: 'Partners', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/partners$/);

    await page
      .getByLabel('Search partners')
      .fill('Yerevan Boutique Hospitality');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('link', { name: 'Yerevan Boutique Hospitality' }),
    ).toBeVisible();

    await page
      .getByRole('link', { name: 'Yerevan Boutique Hospitality' })
      .click();
    await expect(page).toHaveURL(/\/en\/admin\/partners\/\d+$/);
    await expect(page.getByText('vendor@travelhub.dev')).toBeVisible();
    await expect(page.getByText('Recent bookings')).toBeVisible();
  });

  test('rejecting and re-approving verification, then suspending and restoring visibility, all update live', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/partners');
    await page
      .getByLabel('Search partners')
      .fill('Yerevan Boutique Hospitality');
    await page.keyboard.press('Enter');
    await page
      .getByRole('link', { name: 'Yerevan Boutique Hospitality' })
      .click();
    await expect(page).toHaveURL(/\/en\/admin\/partners\/\d+$/);

    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Reject' }).last().click();
    await expect(
      page.getByText('Partner verification rejected.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Approve' }).last().click();
    await expect(
      page.getByText('Partner verification approved.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Suspend' }).click();
    await page.getByRole('button', { name: 'Suspend' }).last().click();
    await expect(page.getByText('Partner suspended.')).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).click();
    await page.getByRole('button', { name: 'Restore' }).last().click();
    await expect(page.getByText('Partner restored.')).toBeVisible();
  });
});

// Serial: the approve/reject tests each deplete one filtered view's row
// count, so they must not run concurrently against the same rows.
// Demo-seeded listings (seedDemoMarketplace.js) are written directly with
// moderation_status_id = APPROVED or REJECTED, never PENDING (only a
// listing created through the real wizard starts PENDING) — so the
// page's own PENDING-default filter is legitimately empty against demo
// data; these tests select the APPROVED/REJECTED filters explicitly to
// exercise real seeded rows.
test.describe.serial('Admin Listing Moderation (Stage 11.3)', () => {
  test('lists real seeded listings with title/partner/status/moderation columns', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    // `exact: true` — without it this also substring-matches the
    // Dashboard's own "Listings awaiting moderation" attention tile.
    await page.getByRole('link', { name: 'Listings', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/listings$/);

    await page.getByRole('combobox', { name: 'Moderation' }).click();
    await page.getByRole('option', { name: 'Approved' }).click();
    await expect(page.getByRole('row').nth(1)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText('Approved', { exact: true }).first(),
    ).toBeVisible();
  });

  test('approving a rejected listing moves it out of the REJECTED filter', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/listings');
    await page.getByRole('combobox', { name: 'Moderation' }).click();
    await page.getByRole('option', { name: 'Rejected' }).click();
    await expect(
      page.getByRole('button', { name: 'Approve' }).first(),
    ).toBeVisible({ timeout: 10_000 });
    const rowCountBefore = await page.getByRole('row').count();

    await page
      .getByRole('row')
      .nth(1)
      .getByRole('button', { name: 'Approve' })
      .click();
    await page.getByRole('button', { name: 'Approve' }).last().click();
    await expect(page.getByText('Listing approved.')).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(rowCountBefore - 1, {
      timeout: 10_000,
    });
  });

  test('rejecting an approved listing with notes moves it out of the APPROVED filter', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/listings');
    await page.getByRole('combobox', { name: 'Moderation' }).click();
    await page.getByRole('option', { name: 'Approved' }).click();
    await expect(
      page.getByRole('button', { name: 'Reject' }).first(),
    ).toBeVisible({ timeout: 10_000 });
    // The APPROVED filter has 70 real demo rows (more than one page), so
    // rejecting one backfills the vacancy from page 2 — the visible row
    // *count* stays at the page size. Assert by the specific row's title
    // disappearing instead of a count delta.
    const rejectedTitle = await page
      .getByRole('row')
      .nth(1)
      .locator('td')
      .first()
      .textContent();

    await page
      .getByRole('row')
      .nth(1)
      .getByRole('button', { name: 'Reject' })
      .click();
    await page.getByLabel('Notes (optional)').fill('Missing required photos.');
    await page.getByRole('button', { name: 'Reject' }).last().click();
    await expect(page.getByText('Listing rejected.')).toBeVisible();
    await expect(
      page.getByRole('cell', { name: rejectedTitle, exact: true }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});

// Serial: the confirm/reject/cancel tests each act on a specific seeded
// booking's status, so a shared "find one PENDING_VENDOR row" step must
// not race against another test doing the same thing.
test.describe.serial('Admin Booking Operations (Stage 11.4)', () => {
  test('lists real seeded bookings and opens a detail page with real status history', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    // `exact: true` — without it this also substring-matches the
    // Dashboard's own "Bookings awaiting vendor response" attention tile.
    await page.getByRole('link', { name: 'Bookings', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/bookings$/);
    await expect(page.getByRole('row').nth(1)).toBeVisible({
      timeout: 10_000,
    });

    const reference = await page
      .getByRole('row')
      .nth(1)
      .getByRole('link')
      .first()
      .textContent();
    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/en\/admin\/bookings\/\d+$/);
    // Scoped to the h1, not a bare getByText(reference): the detail
    // page's breadcrumb also contains this same reference text (e.g.
    // "Booking BK-..." as both the breadcrumb's current-page label and
    // the page's own heading), so an unscoped substring match hits both
    // and trips Playwright's strict-mode violation whenever a booking
    // whose detail page renders that breadcrumb happens to land in
    // this row (which one that is shifts with every reseed).
    await expect(page.getByRole('heading', { name: reference })).toBeVisible();
    await expect(page.getByText('Status history')).toBeVisible();
  });

  test('confirming a PENDING_VENDOR booking moves it to CONFIRMED, then completing it moves it to COMPLETED', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/bookings');
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Awaiting confirmation' }).click();
    await expect(page.getByRole('row').nth(1)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/en\/admin\/bookings\/\d+$/);

    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Booking confirmed.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark completed' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Mark completed' }).click();
    await page.getByRole('button', { name: 'Mark completed' }).last().click();
    await expect(page.getByText('Booking marked completed.')).toBeVisible();
  });

  test('rejecting a PENDING_VENDOR booking moves it to REJECTED', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/bookings');
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Awaiting confirmation' }).click();
    await expect(page.getByRole('row').nth(1)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/en\/admin\/bookings\/\d+$/);

    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Reject' }).last().click();
    await expect(page.getByText('Booking rejected.')).toBeVisible();
  });
});

test.describe.serial('Admin Marketplace Configuration (Stage 11.5)', () => {
  test('lists real seeded categories and switches between tabs', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.getByRole('link', { name: 'Configuration' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/marketplace-config$/);
    await expect(
      page.getByRole('cell', { name: 'Hotels', exact: true }),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Amenities' }).click();
    await expect(page.getByRole('tab', { name: 'Amenities' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Countries' }).click();
    await expect(
      page.getByRole('cell', { name: 'Armenia', exact: true }),
    ).toBeVisible();
  });

  test('creating, editing, and deleting a category all work end-to-end', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/marketplace-config');
    const uniqueName = `E2E Category ${Date.now()}`;
    const uniqueSlug = `e2e-category-${Date.now()}`;

    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByLabel('Name').fill(uniqueName);
    await page.getByLabel('Slug').fill(uniqueSlug);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Category created.')).toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();

    await page
      .getByRole('row')
      .filter({ hasText: uniqueName })
      .getByRole('button', { name: 'Edit' })
      .click();
    const renamedName = `${uniqueName} renamed`;
    const nameInput = page.getByLabel('Name');
    await nameInput.fill('');
    await nameInput.fill(renamedName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Category updated.')).toBeVisible();
    await expect(page.getByText(renamedName)).toBeVisible();

    await page
      .getByRole('row')
      .filter({ hasText: renamedName })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Category deleted.')).toBeVisible();
    await expect(page.getByText(renamedName)).toHaveCount(0);
  });

  test('a MODERATOR (no marketplace.configure) sees the data but cannot write', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('vendor@travelhub.dev');
    await page.getByLabel('Password').fill('DevVendor!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/partner$/);

    // The dev vendor account has no admin-area role at all, so this
    // proves the read/write RBAC split indirectly: an ADMIN/SUPER_ADMIN
    // is the only persona this suite has credentials for that can reach
    // the page — full MODERATOR-vs-ADMIN write-permission coverage lives
    // in the backend integration suite (`adminMarketplaceConfig.test.js`),
    // which asserts the 403 directly against the API.
    await page.goto('/en/admin/marketplace-config');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });
});

test.describe.serial('Admin CMS (Stage 11.6)', () => {
  test('lists the real seeded pages and opens a detail page', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.getByRole('link', { name: 'Content', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/cms$/);

    await expect(page.getByRole('link', { name: 'about' })).toBeVisible();
    await page.getByRole('link', { name: 'about' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/cms\/\d+$/);
    await expect(page.getByLabel('Slug')).toHaveValue('about');
  });

  test('editing a translation saves and persists across reload', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/cms');
    await page.getByRole('link', { name: 'faq' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/cms\/\d+$/);

    await page.getByRole('tab', { name: 'EN' }).click();
    const titleInput = page.getByLabel('Title');
    const uniqueTitle = `FAQ Title ${Date.now()}`;
    await titleInput.fill('');
    await titleInput.fill(uniqueTitle);

    const saveButtons = page.getByRole('button', { name: 'Save' });
    await saveButtons.last().click();
    await expect(page.getByText('Content saved.')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'EN' }).click();
    await expect(page.getByLabel('Title')).toHaveValue(uniqueTitle);

    // Restores the real seeded title (008_cms_pages.js) so this test
    // stays idempotent across repeated local/dev runs — the `faq` page
    // is real, shared content `public.spec.js`'s own `/faq` check reads,
    // not a throwaway fixture this test owns.
    await titleInput.fill('');
    await titleInput.fill('Frequently Asked Questions');
    await saveButtons.last().click();
    await expect(page.getByText('Content saved.')).toBeVisible();
  });

  test('creating and deleting a page works end-to-end', async ({ page }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/cms');

    const slug = `e2e-page-${Date.now()}`;
    await page.getByRole('button', { name: 'Add page' }).click();
    await page.getByLabel('Slug').fill(slug);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Page created.')).toBeVisible();
    await expect(page.getByRole('link', { name: slug })).toBeVisible();

    await page
      .getByRole('row')
      .filter({ hasText: slug })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Page deleted.')).toBeVisible();
    await expect(page.getByRole('link', { name: slug })).toHaveCount(0);
  });
});

test.describe('Admin Audit Logs (Stage 11.7)', () => {
  test('lists real entries and filters by action', async ({ page }) => {
    await loginAsDevAdmin(page);
    // Logging in itself just wrote a real `user.logged_in` audit row —
    // no manual data setup needed. Admin Sprint 7 replaced the raw
    // `action`/`target_type` codes this test used to assert on with a
    // real, translated label catalog (89 real action strings) — the
    // filter's own text input still takes/sends the raw action code
    // (the backend match is still exact-equality on that string), but
    // the rendered cell must never show the raw code itself.
    await page.getByRole('link', { name: 'Audit Logs' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/audit-logs$/);

    await expect(
      page.getByRole('columnheader', { name: 'Time' }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'User logged in' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'user.logged_in' }),
    ).toHaveCount(0);

    await page.getByLabel('Search actions').fill('user.logged_in');
    await page.getByLabel('Search actions').press('Enter');

    await expect(page).toHaveURL(/action=user\.logged_in/);
    const actionCells = page.getByRole('cell', { name: 'User logged in' });
    await expect(actionCells.first()).toBeVisible();
    const otherRows = page
      .getByRole('row')
      .filter({ hasNotText: 'User logged in' })
      .filter({ hasNotText: 'Time' });
    await expect(otherRows).toHaveCount(0);
  });

  test('a CUSTOMER account visiting /admin/audit-logs directly sees the 403 page', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel('Password').fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/admin/audit-logs');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });
});

test.describe('Admin System Health (Stage 11.8)', () => {
  test('shows database/cache status, environment/version, and queue rows', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.getByRole('link', { name: 'System Health' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/system-health$/);

    await expect(page.getByText('Database')).toBeVisible();
    await expect(page.getByText('Cache')).toBeVisible();
    await expect(page.getByText('Environment')).toBeVisible();
    await expect(page.getByText('Version')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Background job queues' }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Hold expiry sweep' }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Pending-vendor SLA sweep' }),
    ).toBeVisible();
  });

  test('a CUSTOMER account visiting /admin/system-health directly sees the 403 page', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel('Password').fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/admin/system-health');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });
});

test.describe('Admin Settings (Stage 11.9)', () => {
  test('lists seeded settings, creates and deletes a setting', async ({
    page,
  }) => {
    await loginAsDevAdmin(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/settings$/);

    await expect(page.getByRole('cell', { name: 'site_name' })).toBeVisible();

    const key = `e2e_setting_${Date.now()}`;
    await page.getByRole('button', { name: 'Add setting' }).click();
    await page.getByLabel('Key', { exact: false }).fill(key);
    await page.getByLabel('Value (JSON)').fill('"hello"');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Setting created.')).toBeVisible();
    await expect(page.getByRole('cell', { name: key })).toBeVisible();

    await page
      .getByRole('row')
      .filter({ hasText: key })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Setting deleted.')).toBeVisible();
    await expect(page.getByRole('cell', { name: key })).toHaveCount(0);
  });

  test('toggling a feature flag persists across reload', async ({ page }) => {
    await loginAsDevAdmin(page);
    await page.goto('/en/admin/settings');
    await page.getByRole('tab', { name: 'Feature Flags' }).click();
    await expect(
      page.getByRole('cell', { name: 'maintenance_mode' }),
    ).toBeVisible();

    const toggle = page.getByRole('switch', {
      name: 'Toggle Maintenance mode',
    });
    const wasChecked = await toggle.isChecked();
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked({ checked: !wasChecked });

    await page.reload();
    await page.getByRole('tab', { name: 'Feature Flags' }).click();
    await expect(
      page.getByRole('switch', { name: 'Toggle Maintenance mode' }),
    ).toBeChecked({ checked: !wasChecked });

    // Revert so the demo-seeded baseline stays clean for other tests/runs.
    await page
      .getByRole('switch', { name: 'Toggle Maintenance mode' })
      .click({ force: true });
    await expect(
      page.getByRole('switch', { name: 'Toggle Maintenance mode' }),
    ).toBeChecked({ checked: wasChecked });
  });

  test('a CUSTOMER account visiting /admin/settings directly sees the 403 page', async ({
    page,
  }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill('customer@travelhub.dev');
    await page.getByLabel('Password').fill('DevCustomer!2024');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto('/en/admin/settings');
    await expect(page.getByText('Access restricted')).toBeVisible();
  });
});
