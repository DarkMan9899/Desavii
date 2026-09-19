import { describe, test, expect } from 'vitest';
import {
  PARTNER_CAPABILITIES,
  roleHasCapability,
} from './partnerCapabilities.js';

describe('partnerCapabilities (apps/web/src/modules/availability) — Step A6 VIEW_ANALYTICS addition', () => {
  test('OWNER always passes, regardless of capability', () => {
    expect(
      roleHasCapability('OWNER', PARTNER_CAPABILITIES.VIEW_ANALYTICS),
    ).toBe(true);
  });

  test('MANAGER and ANALYTICS_VIEWER are granted VIEW_ANALYTICS, mirroring the backend matrix exactly', () => {
    expect(
      roleHasCapability('MANAGER', PARTNER_CAPABILITIES.VIEW_ANALYTICS),
    ).toBe(true);
    expect(
      roleHasCapability(
        'ANALYTICS_VIEWER',
        PARTNER_CAPABILITIES.VIEW_ANALYTICS,
      ),
    ).toBe(true);
  });

  test('BOOKING_MANAGER and EDITOR are not granted VIEW_ANALYTICS', () => {
    expect(
      roleHasCapability('BOOKING_MANAGER', PARTNER_CAPABILITIES.VIEW_ANALYTICS),
    ).toBe(false);
    expect(
      roleHasCapability('EDITOR', PARTNER_CAPABILITIES.VIEW_ANALYTICS),
    ).toBe(false);
  });

  test('no membership (null/undefined role) is not granted VIEW_ANALYTICS', () => {
    expect(roleHasCapability(null, PARTNER_CAPABILITIES.VIEW_ANALYTICS)).toBe(
      false,
    );
    expect(
      roleHasCapability(undefined, PARTNER_CAPABILITIES.VIEW_ANALYTICS),
    ).toBe(false);
  });
});
