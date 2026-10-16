import { describe, test, expect } from 'vitest';
import findActiveNavItemId from './navigationMatch.js';

const ITEMS = [
  { id: 'dashboard', href: '/hy/admin', exact: true },
  { id: 'users', href: '/hy/admin/users' },
  { id: 'ai-moderation', href: '/hy/admin/ai/moderation' },
  { id: 'ai-usage', href: '/hy/admin/ai/usage' },
];

describe('findActiveNavItemId', () => {
  test.each([
    ['/hy/admin', 'dashboard'],
    ['/hy/admin/', 'dashboard'],
    ['/hy/admin/users', 'users'],
    ['/hy/admin/users/', 'users'],
    ['/hy/admin/users/42', 'users'],
    ['/hy/admin/ai/usage', 'ai-usage'],
    ['/hy/admin/ai/moderation', 'ai-moderation'],
  ])('%s highlights %s', (pathname, expected) => {
    expect(findActiveNavItemId(ITEMS, pathname)).toBe(expected);
  });

  test('a page whose section has no visible item highlights nothing, not the exact-match Dashboard', () => {
    expect(findActiveNavItemId(ITEMS, '/hy/admin/partners')).toBeUndefined();
  });

  test('a look-alike prefix is not a parent section', () => {
    expect(
      findActiveNavItemId(ITEMS, '/hy/admin/users-archive'),
    ).toBeUndefined();
  });

  test('the longest matching href wins regardless of item order, and a non-exact root still owns unlisted pages', () => {
    const partnerItems = [
      { id: 'bookings', href: '/en/partner/bookings' },
      { id: 'dashboard', href: '/en/partner' },
    ];
    expect(findActiveNavItemId(partnerItems, '/en/partner/bookings/7')).toBe(
      'bookings',
    );
    expect(findActiveNavItemId(partnerItems, '/en/partner/staff')).toBe(
      'dashboard',
    );
  });

  test('another locale never matches', () => {
    expect(findActiveNavItemId(ITEMS, '/ru/admin/users')).toBeUndefined();
  });
});
