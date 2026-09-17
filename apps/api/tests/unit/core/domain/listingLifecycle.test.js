/**
 * Listing Lifetime / Renewal, Step B2: pure domain-logic coverage for the
 * lifecycle helpers. Step B4 adds `hasLifecycleExpired`/`isPubliclyVisible`,
 * now real callers use (`ListingService#getListing`'s public-detail gate,
 * `#assertBookable`'s booking-eligibility guard).
 */

import { describe, test, expect } from '@jest/globals';
import {
  isFrozen,
  hasPublicationExpiry,
  isLifecycleManaged,
  hasLifecycleExpired,
  isPubliclyVisible,
} from '../../../../src/core/domain/listingLifecycle.js';

function baseListing(overrides = {}) {
  return {
    statusCode: 'PUBLISHED',
    expiresAt: null,
    frozenAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('isFrozen', () => {
  test('a listing with no frozenAt is never frozen', () => {
    expect(isFrozen(baseListing())).toBe(false);
  });

  test('a listing with frozenAt set is frozen', () => {
    expect(
      isFrozen(baseListing({ frozenAt: '2026-01-01T00:00:00.000Z' })),
    ).toBe(true);
  });

  test('a soft-deleted listing is never considered frozen, even with frozenAt set', () => {
    expect(
      isFrozen(
        baseListing({
          frozenAt: '2026-01-01T00:00:00.000Z',
          deletedAt: '2026-06-01T00:00:00.000Z',
        }),
      ),
    ).toBe(false);
  });
});

describe('hasPublicationExpiry', () => {
  test('false when expiresAt was never assigned (every pre-Step-B3 listing)', () => {
    expect(hasPublicationExpiry(baseListing())).toBe(false);
  });

  test('true once expiresAt is assigned', () => {
    expect(
      hasPublicationExpiry(
        baseListing({ expiresAt: '2026-12-31T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });
});

describe('isLifecycleManaged', () => {
  test('false for a listing with neither expiresAt nor frozenAt set', () => {
    expect(isLifecycleManaged(baseListing())).toBe(false);
  });

  test('true once expiresAt is assigned, even before it is ever frozen', () => {
    expect(
      isLifecycleManaged(
        baseListing({ expiresAt: '2026-12-31T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });

  test('true for a frozen listing whose expiresAt has since been cleared', () => {
    expect(
      isLifecycleManaged(
        baseListing({ expiresAt: null, frozenAt: '2026-01-01T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });
});

describe('hasLifecycleExpired', () => {
  test('false for a non-lifecycle-managed listing (expiresAt/frozenAt both null)', () => {
    expect(hasLifecycleExpired(baseListing())).toBe(false);
  });

  test('false when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasLifecycleExpired(baseListing({ expiresAt: future }))).toBe(false);
  });

  test('true once expiresAt has already passed, even with frozenAt still null (the sweep has not run yet)', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(hasLifecycleExpired(baseListing({ expiresAt: past }))).toBe(true);
  });

  test('true for an already-frozen listing regardless of expiresAt', () => {
    expect(
      hasLifecycleExpired(
        baseListing({ frozenAt: '2026-01-01T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });

  test('false for a frozen-but-soft-deleted listing (isFrozen itself excludes deleted rows)', () => {
    expect(
      hasLifecycleExpired(
        baseListing({
          frozenAt: '2026-01-01T00:00:00.000Z',
          deletedAt: '2026-06-01T00:00:00.000Z',
        }),
      ),
    ).toBe(false);
  });
});

describe('isPubliclyVisible', () => {
  test('true for an ordinary PUBLISHED, non-lifecycle-managed listing', () => {
    expect(isPubliclyVisible(baseListing())).toBe(true);
  });

  test('false for a DRAFT listing', () => {
    expect(isPubliclyVisible(baseListing({ statusCode: 'DRAFT' }))).toBe(false);
  });

  test('true for a PUBLISHED listing whose expiresAt is still in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isPubliclyVisible(baseListing({ expiresAt: future }))).toBe(true);
  });

  test('false once a PUBLISHED listing has expired, even before the sweep has flipped its status', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isPubliclyVisible(baseListing({ expiresAt: past }))).toBe(false);
  });

  test('false for a frozen listing', () => {
    expect(
      isPubliclyVisible(baseListing({ frozenAt: '2026-01-01T00:00:00.000Z' })),
    ).toBe(false);
  });
});
