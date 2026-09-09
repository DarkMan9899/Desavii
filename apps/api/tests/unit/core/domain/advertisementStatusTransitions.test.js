/**
 * Sprint 5 §11 / §17: "promotion state transitions." Validates the pure
 * transition-rule function against the state diagram documented in
 * docs/SPRINT_5_DATABASE_FOUNDATION.md §5.2.
 */

import { describe, test, expect } from '@jest/globals';
import {
  ADVERTISEMENT_STATUSES,
  isValidAdvertisementStatusTransition,
  isTerminalAdvertisementStatus,
} from '../../../../src/core/domain/advertisementStatusTransitions.js';

describe('Advertisement status transitions (Sprint 5 §11 manual-payment workflow)', () => {
  test('the full happy path from request to active is legal', () => {
    expect(
      isValidAdvertisementStatusTransition(
        'REQUEST_SUBMITTED',
        'AWAITING_OFFLINE_PAYMENT',
      ),
    ).toBe(true);
    expect(
      isValidAdvertisementStatusTransition(
        'AWAITING_OFFLINE_PAYMENT',
        'PAID_MANUAL',
      ),
    ).toBe(true);
    expect(
      isValidAdvertisementStatusTransition('PAID_MANUAL', 'APPROVED'),
    ).toBe(true);
    expect(isValidAdvertisementStatusTransition('APPROVED', 'SCHEDULED')).toBe(
      true,
    );
    expect(isValidAdvertisementStatusTransition('SCHEDULED', 'ACTIVE')).toBe(
      true,
    );
    expect(isValidAdvertisementStatusTransition('ACTIVE', 'EXPIRED')).toBe(
      true,
    );
  });

  test('an approved ad may go directly active when start_date has already arrived', () => {
    expect(isValidAdvertisementStatusTransition('APPROVED', 'ACTIVE')).toBe(
      true,
    );
  });

  test('admin may reject a submitted request; vendor/admin may cancel while awaiting payment', () => {
    expect(
      isValidAdvertisementStatusTransition('REQUEST_SUBMITTED', 'REJECTED'),
    ).toBe(true);
    expect(
      isValidAdvertisementStatusTransition(
        'AWAITING_OFFLINE_PAYMENT',
        'CANCELLED',
      ),
    ).toBe(true);
  });

  test('Sprint E: admin may cancel an already-paid, approved, scheduled, or active promotion, not only one still awaiting payment', () => {
    expect(
      isValidAdvertisementStatusTransition('PAID_MANUAL', 'CANCELLED'),
    ).toBe(true);
    expect(isValidAdvertisementStatusTransition('APPROVED', 'CANCELLED')).toBe(
      true,
    );
    expect(isValidAdvertisementStatusTransition('SCHEDULED', 'CANCELLED')).toBe(
      true,
    );
    expect(isValidAdvertisementStatusTransition('ACTIVE', 'CANCELLED')).toBe(
      true,
    );
  });

  test('a request cannot skip payment and jump straight to APPROVED', () => {
    expect(
      isValidAdvertisementStatusTransition('REQUEST_SUBMITTED', 'APPROVED'),
    ).toBe(false);
  });

  test('every terminal status has no outgoing transitions', () => {
    ['REJECTED', 'CANCELLED', 'EXPIRED'].forEach((status) => {
      expect(isTerminalAdvertisementStatus(status)).toBe(true);
      ADVERTISEMENT_STATUSES.forEach((target) => {
        expect(isValidAdvertisementStatusTransition(status, target)).toBe(
          false,
        );
      });
    });
  });

  test('an unknown status throws rather than silently allowing the transition', () => {
    expect(() =>
      isValidAdvertisementStatusTransition('NOPE', 'ACTIVE'),
    ).toThrow(TypeError);
  });

  test('ADVERTISEMENT_STATUSES exactly matches the 9 statuses seeded in migration 0010/seed 001', () => {
    // ADVERTISEMENT_STATUSES is frozen — sort a copy, never the original.
    expect([...ADVERTISEMENT_STATUSES].sort()).toEqual(
      [
        'REQUEST_SUBMITTED',
        'AWAITING_OFFLINE_PAYMENT',
        'PAID_MANUAL',
        'APPROVED',
        'SCHEDULED',
        'ACTIVE',
        'EXPIRED',
        'REJECTED',
        'CANCELLED',
      ].sort(),
    );
  });
});
