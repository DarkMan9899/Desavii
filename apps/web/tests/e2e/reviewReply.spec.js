/**
 * P1.5 (Master Roadmap, Review Trust & Safety) — partner reply to a
 * review, end to end against the real backend + dev-seeded database.
 *
 * Backend authorization (401 unauthenticated, 403 no-relationship, 422
 * validation, 404 unknown review) and the full OWNER reply/edit/delete
 * lifecycle are already proven in isolation by the backend integration
 * suite (`apps/api/tests/integration/reviews/reviewReply.test.js`, 7/7).
 * Matching `reviewModeration.spec.js`'s established convention, this
 * spec's job is proving the UI surfaces actually work end to end against
 * that real backend, not re-proving already-covered service logic:
 *   - the Reply/Edit/Delete affordances render only for the right
 *     partner (an owning OWNER sees them; a customer and an unrelated
 *     partner do not — the UI-level mirror of the backend's 403);
 *   - a posted reply is publicly visible immediately, under the correct
 *     partner/company identity (there's exactly one vendor-response slot
 *     per review, so "correct identity" here means "the listing's own
 *     partner posted it," which the 403 checks below already establish
 *     no one else could have done);
 *   - i18n (EN/HY/RU) and mobile layout hold up;
 *   - nothing about admin moderation breaks once a reply exists.
 *
 * Reuses the existing seeded review on listing 37 ("Modern Sevan Tour",
 * owned by `caucasus-trail-tours`) rather than building a fresh
 * booking-to-review chain through the UI — the same fixture
 * `reviewModeration.spec.js` already reuses, restored to its original
 * (no-reply) state at the end of this test.
 */

import {
  test,
  expect,
  resetRateLimits,
  resolveSeededReview,
} from './fixtures.js';

const REVIEW_OWNER = {
  email: 'partner.tours@example.com',
  password: 'DemoPass!2024',
};
const OTHER_PARTNER = {
  email: 'vendor@travelhub.dev',
  password: 'DevVendor!2024',
};
const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };

const API_BASE = 'http://localhost:4000/api/v1/';
const REVIEW_LISTING_ID = 37;
const REVIEW_LISTING_TITLE = 'Modern Sevan Tour';
const REPLY_TEXT = `E2E reply ${Date.now()}`;

// The review's own id/content aren't hardcoded — `resolveSeededReview`
// (see `fixtures.js`) resolves them from the real API at test start,
// since the demo seed doesn't guarantee this listing keeps the same
// review across reseeds (found via a P2.1 acceptance-verification
// reseed). Module-scoped so `test.afterEach`'s teardown can reach the id
// resolved inside the test body.
let resolvedReviewId;

async function login(page, { email, password }, expectedUrlPattern) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

async function logout(page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/en$/);
}

/** Scoped to this one review's own card, not any other review on the same listing. */
function reviewCard(page, reviewText) {
  return page.locator('div').filter({ hasText: reviewText }).last();
}

// Single test, not split by concern: every step shares one review
// fixture (post/edit/delete a reply on the same seeded row), and this
// suite runs `fullyParallel` by default — two tests mutating the same
// shared review concurrently is a genuine race (confirmed: an earlier
// two-test version of this file failed both tests every time, one
// worker's "Reply" label check losing to the other worker's in-flight
// post). One sequential test removes the race entirely, matching
// `reviewModeration.spec.js`'s own single-test-per-shared-fixture shape.
test.describe('Partner reply to a review — end to end', () => {
  // Unconditional, direct-API teardown — runs whether the test above
  // passed or failed partway through. Without this, a mid-test failure
  // (assertion error, a transient timeout, anything) leaves this shared
  // seeded review's reply in place, and the NEXT run then fails for an
  // unrelated reason (the i18n/label checks near the top expect the
  // pre-reply "Reply" button, not "Edit reply") — confirmed: exactly
  // this cascade was reproduced across a batch of repeated runs before
  // this hook existed. Best-effort by design (mirrors this suite's own
  // `resetRateLimits` fail-open pattern) — a cleanup failure must never
  // mask the real test result.
  test.afterEach(async ({ request }) => {
    if (!resolvedReviewId) return;
    try {
      const loginRes = await request.post(`${API_BASE}auth/login`, {
        data: { email: REVIEW_OWNER.email, password: REVIEW_OWNER.password },
      });
      if (!loginRes.ok()) return;
      const { data } = await loginRes.json();
      await request.delete(`${API_BASE}reviews/${resolvedReviewId}/reply`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
    } catch {
      // Best-effort teardown only — never fail the run over this.
    } finally {
      resolvedReviewId = undefined;
    }
  });

  test('the owning partner can reply, it is public, and no one else can act on it', async ({
    page,
    request,
  }) => {
    const seededReview = await resolveSeededReview(request, REVIEW_LISTING_ID);
    resolvedReviewId = seededReview.id;
    const REVIEW_TEXT = seededReview.text;

    await login(page, REVIEW_OWNER, /\/en\/partner$/);
    await page.goto(`/en/listings/${REVIEW_LISTING_ID}`);
    await expect(reviewCard(page, REVIEW_TEXT)).toBeVisible();

    // i18n, checked before any reply exists so the button still reads
    // plain "Reply" (not "Edit reply") in every locale. Switched via the
    // in-app language buttons (an SPA transition), not `page.goto` — the
    // access token lives in memory only by design (`tokenStore.js`) and
    // is lost on every full reload, re-acquired via `POST /auth/refresh`
    // on next boot; that endpoint shares `sensitiveRateLimiter` with
    // login/register, and stacking several full reloads under one
    // session exhausts it, kicking the session out mid-test (confirmed:
    // an earlier `page.goto`-per-locale version of this test intermittently
    // landed on an unexpectedly logged-out page for exactly this reason).
    await page.getByRole('button', { name: 'ՀՅ', exact: true }).click();
    await expect(
      reviewCard(page, REVIEW_TEXT).getByRole('button', { name: 'Պատասխանել' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'РУ', exact: true }).click();
    await expect(
      reviewCard(page, REVIEW_TEXT).getByRole('button', { name: 'Ответить' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(
      reviewCard(page, REVIEW_TEXT).getByRole('button', { name: 'Reply' }),
    ).toBeVisible();

    // Mobile viewport, same loaded page (no reload) — the affordance is
    // reachable and the reply form opens and is usable at a phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      reviewCard(page, REVIEW_TEXT).getByRole('button', { name: 'Reply' }),
    ).toBeVisible();
    await reviewCard(page, REVIEW_TEXT)
      .getByRole('button', { name: 'Reply' })
      .click();
    await expect(page.getByLabel('Your reply')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });

    await reviewCard(page, REVIEW_TEXT)
      .getByRole('button', { name: 'Reply' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Reply to this review' }),
    ).toBeVisible();
    await page.getByLabel('Your reply').fill(REPLY_TEXT);
    await page.getByRole('button', { name: 'Post reply' }).click();
    await expect(page.getByText('Reply posted.')).toBeVisible();

    // Publicly visible immediately, under the listing's own partner —
    // reload as a fully logged-out visitor to prove this isn't merely
    // client cache echoing back the just-submitted value. This test's
    // owner segment above already made several requests against this one
    // listing (i18n switches re-fetch translated content, the mobile
    // check, the actual post) sharing one un-flushed `publicRateLimiter`
    // budget — flushing again here (same real ceiling, not weakened)
    // avoids an intermittent false failure from that budget alone, not
    // from the reply itself (confirmed: reproduced 2/5 times without
    // this flush, 0/5 with it in repeated isolated runs).
    await logout(page);
    await resetRateLimits();
    await page.goto(`/en/listings/${REVIEW_LISTING_ID}`);
    await expect(
      reviewCard(page, REVIEW_TEXT).getByText(REPLY_TEXT),
    ).toBeVisible();

    // A CUSTOMER (no partnership at all) never sees reply/edit/delete
    // controls, even on a review they can otherwise Report.
    await login(page, CUSTOMER, /\/en\/account$/);
    await page.goto(`/en/listings/${REVIEW_LISTING_ID}`);
    await expect(
      reviewCard(page, REVIEW_TEXT).getByText(REPLY_TEXT),
    ).toBeVisible();
    await expect(
      reviewCard(page, REVIEW_TEXT).getByRole('button', {
        name: /Reply|Edit reply|Delete reply/,
      }),
    ).toHaveCount(0);
    await logout(page);

    // A DIFFERENT partner (OWNER elsewhere, not of this listing) is the
    // UI-level mirror of the backend's 403 for "no relationship to
    // *this* partner" — same check, but for a party that legitimately
    // holds a partner role, just not this one.
    await login(page, OTHER_PARTNER, /\/en\/partner$/);
    await page.goto(`/en/listings/${REVIEW_LISTING_ID}`);
    await expect(
      reviewCard(page, REVIEW_TEXT).getByText(REPLY_TEXT),
    ).toBeVisible();
    await expect(
      reviewCard(page, REVIEW_TEXT).getByRole('button', {
        name: /Reply|Edit reply|Delete reply/,
      }),
    ).toHaveCount(0);
    await logout(page);

    // Admin moderation is unaffected by a reply existing — the review
    // (found via the "All reviews" filter, not the default reported-only
    // queue, since this review has no report of its own) still loads and
    // is still actionable from the admin table.
    await login(page, ADMIN, /\/en\/admin$/);
    await page.goto('/en/admin/reviews?hasReports=false');
    const adminRow = page
      .getByRole('row')
      .filter({ hasText: REVIEW_LISTING_TITLE })
      .filter({ hasText: REVIEW_TEXT });
    await expect(adminRow).toBeVisible();
    await expect(
      adminRow.getByRole('button', { name: 'Reject' }),
    ).toBeVisible();
    await logout(page);

    // Restore the shared seeded fixture: the OWNER edits then deletes
    // their own reply, leaving listing 37's review back the way this
    // test (and reviewModeration.spec.js) found it.
    await login(page, REVIEW_OWNER, /\/en\/partner$/);
    await page.goto(`/en/listings/${REVIEW_LISTING_ID}`);
    await reviewCard(page, REVIEW_TEXT)
      .getByRole('button', { name: 'Edit reply' })
      .click();
    await expect(page.getByLabel('Your reply')).toHaveValue(REPLY_TEXT);
    await page.keyboard.press('Escape');
    await reviewCard(page, REVIEW_TEXT)
      .getByRole('button', { name: 'Delete reply' })
      .click();
    await page.getByRole('button', { name: 'Delete reply' }).last().click();
    await expect(page.getByText('Reply deleted.')).toBeVisible();
    await expect(
      reviewCard(page, REVIEW_TEXT).getByText(REPLY_TEXT),
    ).not.toBeVisible();
  });
});
