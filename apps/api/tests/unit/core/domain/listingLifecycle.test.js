/**
 * Listing Lifetime / Renewal, Step B2: pure domain-logic coverage for the
 * lifecycle helpers. Step B4 adds `hasLifecycleExpired`/`isPubliclyVisible`,
 * now real callers use (`ListingService#getListing`'s public-detail gate,
 * `#assertBookable`'s booking-eligibility guard).
 *
 * Step B6.5: both functions now take a required `now` parameter (never an
 * internal `new Date()` read) — see `hasLifecycleExpired`'s own doc comment
 * for the mysql2 local-timezone DATETIME-parsing bug this closes. These are
 * pure unit tests with literal ISO-string `expiresAt` fixtures, never a real
 * mysql2 round trip, so a plain `new Date()` passed as `now` is exactly as
 * correct here as it was before — the bug only ever existed at the mysql2
 * boundary, never within a single, internally-consistent comparison.
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
    expect(hasLifecycleExpired(baseListing(), new Date())).toBe(false);
  });

  test('false when expiresAt is in the future', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000).toISOString();
    expect(hasLifecycleExpired(baseListing({ expiresAt: future }), now)).toBe(
      false,
    );
  });

  test('true once expiresAt has already passed, even with frozenAt still null (the sweep has not run yet)', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000).toISOString();
    expect(hasLifecycleExpired(baseListing({ expiresAt: past }), now)).toBe(
      true,
    );
  });

  test('true for an already-frozen listing regardless of expiresAt', () => {
    expect(
      hasLifecycleExpired(
        baseListing({ frozenAt: '2026-01-01T00:00:00.000Z' }),
        new Date(),
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
        new Date(),
      ),
    ).toBe(false);
  });

  // Step B6.5 — the exact boundary: equality is expired, never active.
  test('expires_at exactly equal to now is expired, not active', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    expect(
      hasLifecycleExpired(baseListing({ expiresAt: now.toISOString() }), now),
    ).toBe(true);
  });

  test('expires_at one millisecond after now is not expired', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const future = new Date(now.getTime() + 1).toISOString();
    expect(hasLifecycleExpired(baseListing({ expiresAt: future }), now)).toBe(
      false,
    );
  });

  // Step B6.5 — `now` is a required, explicit parameter; no silent internal
  // clock read that could quietly reintroduce the timezone bug this closes.
  test.each([undefined, null, 'not-a-date', new Date('invalid')])(
    'throws a TypeError when now is %p rather than a valid Date',
    (invalidNow) => {
      expect(() => hasLifecycleExpired(baseListing(), invalidNow)).toThrow(
        TypeError,
      );
    },
  );
});

describe('isPubliclyVisible', () => {
  test('true for an ordinary PUBLISHED, non-lifecycle-managed listing', () => {
    expect(isPubliclyVisible(baseListing(), new Date())).toBe(true);
  });

  test('false for a DRAFT listing', () => {
    expect(
      isPubliclyVisible(baseListing({ statusCode: 'DRAFT' }), new Date()),
    ).toBe(false);
  });

  test('true for a PUBLISHED listing whose expiresAt is still in the future', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000).toISOString();
    expect(isPubliclyVisible(baseListing({ expiresAt: future }), now)).toBe(
      true,
    );
  });

  test('false once a PUBLISHED listing has expired, even before the sweep has flipped its status', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000).toISOString();
    expect(isPubliclyVisible(baseListing({ expiresAt: past }), now)).toBe(
      false,
    );
  });

  test('false for a frozen listing', () => {
    expect(
      isPubliclyVisible(
        baseListing({ frozenAt: '2026-01-01T00:00:00.000Z' }),
        new Date(),
      ),
    ).toBe(false);
  });
});
