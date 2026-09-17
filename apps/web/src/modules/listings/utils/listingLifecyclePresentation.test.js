import { describe, test, expect } from 'vitest';
import {
  LISTING_LIFECYCLE_STATES,
  resolveListingLifecycleState,
  daysUntilExpiry,
  isRenewEligible,
  resolveDefaultRenewalPeriod,
} from './listingLifecyclePresentation.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function listing(overrides = {}) {
  return {
    status: 'PUBLISHED',
    expires_at: null,
    frozen_at: null,
    publication_period_days: null,
    ...overrides,
  };
}

describe('resolveListingLifecycleState', () => {
  test('LEGACY for a listing with no expires_at ever assigned', () => {
    expect(resolveListingLifecycleState(listing(), NOW)).toBe(
      LISTING_LIFECYCLE_STATES.LEGACY,
    );
  });

  test('ACTIVE for a PUBLISHED listing comfortably before expiry', () => {
    const l = listing({ expires_at: '2026-07-15T12:00:00.000Z' });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.ACTIVE,
    );
  });

  test('EXPIRING_SOON at exactly the 2-day threshold', () => {
    const l = listing({ expires_at: '2026-06-17T12:00:00.000Z' });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.EXPIRING_SOON,
    );
  });

  test('EXPIRING_SOON with only hours remaining (expires today)', () => {
    const l = listing({ expires_at: '2026-06-15T18:00:00.000Z' });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.EXPIRING_SOON,
    );
  });

  test('EXPIRED_FROZEN once expires_at has passed, even with frozen_at still null (sweep has not run yet)', () => {
    const l = listing({ expires_at: '2026-06-14T12:00:00.000Z' });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN,
    );
  });

  test('EXPIRED_FROZEN for a genuinely frozen (UNPUBLISHED) listing', () => {
    const l = listing({
      status: 'UNPUBLISHED',
      expires_at: '2026-06-01T00:00:00.000Z',
      frozen_at: '2026-06-01T00:00:00.000Z',
    });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN,
    );
  });

  // The exact confusion brief §21 explicitly forbids — a manual unpublish
  // (never frozen) must never be presented as expired.
  test('LEGACY, not EXPIRED_FROZEN, for a manually-UNPUBLISHED (non-frozen) listing with a still-future expires_at', () => {
    const l = listing({
      status: 'UNPUBLISHED',
      expires_at: '2026-07-15T12:00:00.000Z',
      frozen_at: null,
    });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.LEGACY,
    );
  });

  test('EXPIRED_FROZEN takes priority even if expires_at were somehow still in the future', () => {
    const l = listing({
      status: 'UNPUBLISHED',
      expires_at: '2026-12-01T00:00:00.000Z',
      frozen_at: '2026-06-01T00:00:00.000Z',
    });
    expect(resolveListingLifecycleState(l, NOW)).toBe(
      LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN,
    );
  });
});

describe('daysUntilExpiry', () => {
  test('null when there is no expires_at', () => {
    expect(daysUntilExpiry(listing(), NOW)).toBeNull();
  });

  test('floors to whole days, never negative', () => {
    const l = listing({ expires_at: '2026-06-20T11:59:00.000Z' });
    expect(daysUntilExpiry(l, NOW)).toBe(4);
  });

  test('never negative for an already-passed expires_at', () => {
    const l = listing({ expires_at: '2026-06-01T00:00:00.000Z' });
    expect(daysUntilExpiry(l, NOW)).toBe(0);
  });
});

describe('isRenewEligible', () => {
  test('true for ACTIVE', () => {
    const l = listing({ expires_at: '2026-07-15T12:00:00.000Z' });
    expect(isRenewEligible(l)).toBe(true);
  });

  test('true for EXPIRING_SOON', () => {
    const l = listing({ expires_at: '2026-06-16T12:00:00.000Z' });
    expect(isRenewEligible(l)).toBe(true);
  });

  test('true for a genuinely frozen listing (has an expires_at from its prior lifecycle)', () => {
    const l = listing({
      status: 'UNPUBLISHED',
      expires_at: '2026-06-01T00:00:00.000Z',
      frozen_at: '2026-06-01T00:00:00.000Z',
    });
    expect(isRenewEligible(l)).toBe(true);
  });

  test('false for LEGACY (no expires_at ever assigned) — must go through ordinary Publish instead', () => {
    expect(isRenewEligible(listing())).toBe(false);
  });

  test('false for a manually-UNPUBLISHED (non-frozen) listing — must go through ordinary Publish, never Renew', () => {
    const l = listing({
      status: 'UNPUBLISHED',
      expires_at: '2026-07-15T12:00:00.000Z',
      frozen_at: null,
    });
    expect(isRenewEligible(l)).toBe(false);
  });

  test('false for DRAFT/ARCHIVED (LEGACY presentation, no expires_at)', () => {
    expect(isRenewEligible(listing({ status: 'DRAFT' }))).toBe(false);
    expect(isRenewEligible(listing({ status: 'ARCHIVED' }))).toBe(false);
  });
});

describe('resolveDefaultRenewalPeriod', () => {
  const APPROVED = [30, 90, 180, 365];

  test("preselects the listing's own current publication_period_days when it is approved", () => {
    const l = listing({ publication_period_days: 180 });
    expect(resolveDefaultRenewalPeriod(l, APPROVED, 90)).toBe(180);
  });

  test('falls back to the given default when publication_period_days is null', () => {
    expect(resolveDefaultRenewalPeriod(listing(), APPROVED, 90)).toBe(90);
  });

  test('falls back to the given default when publication_period_days is somehow not an approved value', () => {
    const l = listing({ publication_period_days: 45 });
    expect(resolveDefaultRenewalPeriod(l, APPROVED, 90)).toBe(90);
  });
});
