import { describe, test, expect } from 'vitest';
import {
  isPublicGa4Route,
  extractLocaleFromPathname,
} from './ga4RoutePolicy.js';

describe('isPublicGa4Route — genuinely public discovery routes', () => {
  test.each([
    ['/en', 'home'],
    ['/hy', 'home (hy)'],
    ['/en/search', 'search'],
    ['/en/listings/42', 'listing detail'],
    ['/en/companies', 'companies directory'],
    ['/en/companies/acme-tours', 'company profile'],
    ['/en/categories/hotels', 'category page'],
    ['/en/destinations/yerevan', 'destination page'],
    ['/en/about', 'about'],
    ['/en/contact', 'contact'],
    ['/en/faq', 'faq'],
    ['/en/help', 'help center'],
    ['/en/become-a-partner', 'become a partner'],
    ['/en/blog', 'blog index'],
    ['/en/blog/how-to-plan-a-trip', 'blog post'],
    ['/ru/search', 'search (ru locale)'],
  ])('%s is public (%s)', (pathname) => {
    expect(isPublicGa4Route(pathname)).toBe(true);
  });
});

describe('isPublicGa4Route — private/operational routes are excluded', () => {
  test.each([
    ['/en/booking/checkout', 'authenticated checkout, PublicLayout chrome'],
    ['/en/auth/login', 'auth funnel, out of v1 scope'],
    ['/en/auth/register', 'auth funnel'],
    ['/en/account', 'customer account dashboard'],
    ['/en/account/bookings', 'customer account'],
    ['/en/account/favorites', 'customer account'],
    ['/en/partner/apply', 'authenticated partner onboarding'],
    ['/en/partner/invitations/abc123', 'authenticated invitation accept'],
    ['/en/partner', 'partner dashboard'],
    [
      '/en/partner/analytics',
      'partner analytics (Step A6) — must stay untracked',
    ],
    ['/en/partner/analytics/listings/5', 'partner analytics drill-down'],
    ['/en/manager', 'manager workspace'],
    ['/en/manager/analytics', 'manager analytics'],
    ['/en/marketing', 'marketing workspace'],
    ['/en/admin', 'admin dashboard'],
    ['/en/admin/users', 'admin operational page'],
    ['/en/admin/settings', 'admin operational page'],
  ])('%s is NOT public (%s)', (pathname) => {
    expect(isPublicGa4Route(pathname)).toBe(false);
  });
});

describe('isPublicGa4Route — no fragile substring matching', () => {
  test('a path that merely contains "search" as a substring is not treated as the Search page', () => {
    expect(isPublicGa4Route('/en/admin/searchable-config')).toBe(false);
  });

  test('an unknown/404 path is not public', () => {
    expect(isPublicGa4Route('/en/this-route-does-not-exist')).toBe(false);
  });
});

describe('extractLocaleFromPathname', () => {
  test('extracts hy/en/ru from a locale-prefixed path', () => {
    expect(extractLocaleFromPathname('/en/search')).toBe('en');
    expect(extractLocaleFromPathname('/hy')).toBe('hy');
    expect(extractLocaleFromPathname('/ru/listings/5')).toBe('ru');
  });

  test('returns undefined for a path with no recognized locale prefix', () => {
    expect(extractLocaleFromPathname('/fr/search')).toBeUndefined();
  });
});
