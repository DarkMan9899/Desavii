import { describe, test, expect, beforeEach } from 'vitest';
import {
  getSafeRedirectPath,
  resolveHomePath,
  resolvePostAuthPath,
  resolvePartnerStartPath,
} from './authDestinations.js';

// A `javascript:` URL, assembled so the fixture itself is not one.
const SCRIPT_URL = ['javascript', 'alert(1)'].join(':');
const PARTNERSHIP = [{ partner_id: 1, role_code: 'OWNER' }];

describe('getSafeRedirectPath', () => {
  test.each([
    '/en/partner/apply',
    '/hy/listings/42?checkIn=2026-11-01',
    '/ru/account#bookings',
    '/en',
  ])('keeps the in-app path %s', (path) => {
    expect(getSafeRedirectPath(path)).toBe(path);
  });

  test.each([
    ['protocol-relative', '//evil.example/path'],
    ['absolute URL', 'https://evil.example/en/account'],
    ['backslash host', '/\\evil.example'],
    ['script URL', SCRIPT_URL],
    ['relative path', 'en/account'],
    ['unknown locale', '/de/account'],
    ['no locale', '/account'],
    ['control character', '/en/\naccount'],
    ['empty', ''],
    ['missing', null],
  ])('rejects a %s target', (_kind, path) => {
    expect(getSafeRedirectPath(path)).toBeNull();
  });
});

describe('resolveHomePath', () => {
  beforeEach(() => window.localStorage.clear());

  test.each([
    ['CUSTOMER', [], [], '/hy/account'],
    ['ADMIN', ['ADMIN'], [], '/hy/admin'],
    ['SUPER_ADMIN', ['SUPER_ADMIN'], [], '/hy/admin'],
    ['MODERATOR', ['MODERATOR'], [], '/hy/admin'],
    ['SUPPORT', ['SUPPORT'], [], '/hy/admin'],
    ['MANAGER', ['MANAGER'], [], '/hy/manager'],
    ['MARKETING', ['MARKETING'], [], '/hy/marketing'],
    [
      'partner owner / booking manager',
      ['CUSTOMER'],
      PARTNERSHIP,
      '/hy/partner',
    ],
    ['applicant (no partnership yet)', ['CUSTOMER'], [], '/hy/account'],
  ])('%s lands on its workspace', (_who, roles, partnerships, expected) => {
    expect(resolveHomePath({ roles, partnerships, locale: 'hy' })).toBe(
      expected,
    );
  });

  test('a partner who last chose the customer workspace lands there', () => {
    window.localStorage.setItem('desavii:lastWorkspace', 'customer');

    expect(
      resolveHomePath({
        roles: ['CUSTOMER'],
        partnerships: PARTNERSHIP,
        locale: 'ru',
      }),
    ).toBe('/ru/account');
  });

  test('an admin-area role wins over a partnership', () => {
    expect(
      resolveHomePath({
        roles: ['ADMIN'],
        partnerships: PARTNERSHIP,
        locale: 'en',
      }),
    ).toBe('/en/admin');
  });
});

describe('resolvePostAuthPath', () => {
  test('a safe return target wins over the role home', () => {
    expect(
      resolvePostAuthPath({
        redirect: '/ru/partner/apply',
        roles: ['ADMIN'],
        partnerships: [],
        locale: 'ru',
      }),
    ).toBe('/ru/partner/apply');
  });

  test('an unsafe return target falls back to the role home', () => {
    expect(
      resolvePostAuthPath({
        redirect: '//evil.example',
        roles: [],
        partnerships: [],
        locale: 'hy',
      }),
    ).toBe('/hy/account');
  });
});

describe('resolvePartnerStartPath', () => {
  test('a visitor creates a partner account first', () => {
    expect(
      resolvePartnerStartPath({ isAuthenticated: false, locale: 'hy' }),
    ).toBe('/hy/partner/register');
  });

  test('a signed-in customer applies with the account they already have', () => {
    expect(
      resolvePartnerStartPath({
        isAuthenticated: true,
        partnerships: [],
        locale: 'ru',
      }),
    ).toBe('/ru/partner/apply');
  });

  test('a signed-in partner member goes to the partner workspace', () => {
    expect(
      resolvePartnerStartPath({
        isAuthenticated: true,
        partnerships: PARTNERSHIP,
        locale: 'en',
      }),
    ).toBe('/en/partner');
  });
});
