import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_GROUP_ORDER,
  adminSectionHref,
  canOpenAdminSection,
} from './adminNavigation.js';
import findActiveNavItemId from '../utils/navigationMatch.js';

const WEB_ROOT = path.resolve(__dirname, '../..');
// The real route table — so a sidebar entry can never point at a route
// that does not exist, and no admin page is left without a section.
const ROUTES_SOURCE = fs.readFileSync(
  path.join(WEB_ROOT, 'src/routes/index.jsx'),
  'utf8',
);
const ADMIN_ROUTE_PATHS = [
  ...ROUTES_SOURCE.matchAll(/path="(admin(?:\/[^"]*)?)"/g),
].map((match) => match[1]);
const SECTIONS = ADMIN_NAV_ITEMS.map((item) => ({
  ...item,
  href: adminSectionHref('en', item),
  exact: item.path === '',
}));

function translation(locale, key) {
  const messages = JSON.parse(
    fs.readFileSync(
      path.join(WEB_ROOT, `public/locales/${locale}/common.json`),
      'utf8',
    ),
  );
  return key.split('.').reduce((node, part) => node?.[part], messages);
}

describe('admin navigation map', () => {
  test('finds the admin routes it checks against', () => {
    expect(ADMIN_ROUTE_PATHS.length).toBeGreaterThan(20);
  });

  test('every sidebar entry opens a route that exists — no dead or stale links', () => {
    ADMIN_NAV_ITEMS.forEach((item) => {
      const route = item.path ? `admin/${item.path}` : 'admin';
      expect(ADMIN_ROUTE_PATHS, item.id).toContain(route);
    });
  });

  test('every admin route belongs to exactly one section, so it highlights and is permission-checked like it', () => {
    ADMIN_ROUTE_PATHS.forEach((routePath) => {
      const concrete = `/en/${routePath.replace(/:[^/]+/g, '1')}`;
      expect(findActiveNavItemId(SECTIONS, concrete), routePath).toBeDefined();
    });
  });

  test('ids and paths are unique, and every group is a known section group', () => {
    const ids = ADMIN_NAV_ITEMS.map((item) => item.id);
    const paths = ADMIN_NAV_ITEMS.map((item) => item.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    ADMIN_NAV_ITEMS.filter((item) => item.groupId).forEach((item) =>
      expect(ADMIN_NAV_GROUP_ORDER).toContain(item.groupId),
    );
  });

  test.each(['hy', 'en', 'ru'])(
    '%s: every entry and group has a translated label',
    (locale) => {
      ADMIN_NAV_ITEMS.forEach((item) =>
        expect(typeof translation(locale, item.labelKey), item.id).toBe(
          'string',
        ),
      );
      ADMIN_NAV_GROUP_ORDER.forEach((groupId) =>
        expect(
          typeof translation(locale, `admin.nav.groups.${groupId}`),
          groupId,
        ).toBe('string'),
      );
    },
  );

  test('a section with a list of permissions opens with any one of them', () => {
    const partners = ADMIN_NAV_ITEMS.find((item) => item.id === 'partners');
    expect(canOpenAdminSection(partners, ['partner.moderate'])).toBe(true);
    expect(canOpenAdminSection(partners, ['partner.verify'])).toBe(true);
    expect(canOpenAdminSection(partners, ['user.list'])).toBe(false);
    const dashboard = ADMIN_NAV_ITEMS.find((item) => item.id === 'dashboard');
    expect(canOpenAdminSection(dashboard, [])).toBe(true);
  });
});
