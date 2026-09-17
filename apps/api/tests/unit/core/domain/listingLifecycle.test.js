/**
 * Listing Lifetime / Renewal, Step B2: pure domain-logic coverage for the
 * lifecycle helpers, ahead of any real caller existing yet (Step B4+).
 */

import { describe, test, expect } from '@jest/globals';
import {
  isFrozen,
  hasPublicationExpiry,
  isLifecycleManaged,
} from '../../../../src/core/domain/listingLifecycle.js';

function baseListing(overrides = {}) {
  return {
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
